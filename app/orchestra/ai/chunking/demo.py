"""
Demo / test script for the chunking pipeline.

Takes a file path, parses it via IngestionService, then chunks the result
via ChunkingService. Standalone — does not affect any other part of the app.

Usage:
    python -m app.orchestra.ai.chunking.demo path/to/file.pdf
    python -m app.orchestra.ai.chunking.demo path/to/file.pdf --no-vision
    python -m app.orchestra.ai.chunking.demo path/to/file.pdf --verbose

What it tests:
    1. File is parsed via IngestionService (parser -> ParsedDocument)
    2. ParsedDocument is chunked via ChunkingService (strategy from extension)
    3. Table pages are never split (is_table protection)
    4. Reports: strategy used, chunk count, chunk sizes, oversized-chunk warnings
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import List


def validate_chunks(chunks, doc, cfg) -> List[str]:
    """
    Structural checks on chunked output. Returns a list of human-readable
    issue strings (empty list = clean).
    """
    from app.orchestra.ai.chunking.config import ChunkStrategy

    issues: List[str] = []

    # Empty / whitespace-only chunks
    empty = [i for i, c in enumerate(chunks) if not c.text.strip()]
    if empty:
        issues.append(f"{len(empty)} empty/whitespace chunk(s): {empty}")

    # Chunks below the configured floor
    if cfg.min_chunk_size:
        undersized = [i for i, c in enumerate(chunks) if 0 < len(c.text.strip()) < cfg.min_chunk_size]
        if undersized:
            issues.append(f"{len(undersized)} chunk(s) below min_chunk_size={cfg.min_chunk_size}: {undersized}")

    # Oversized chunks not explained by a table page
    if cfg.chunk_size:
        table_sections = {p.section for p in doc.pages if p.is_table}
        oversized = [
            i for i, c in enumerate(chunks)
            if len(c.text) > cfg.chunk_size * 1.5 and c.section not in table_sections
        ]
        if oversized:
            issues.append(f"{len(oversized)} oversized chunk(s) not explained by a table page: {oversized}")

    # Every table ParsedPage must become exactly one chunk (never split, never
    # merged with prose). Compared as counts, not per-page-number, because a
    # single physical page can legitimately hold multiple separate tables —
    # they all share the same `page` value now that it's the real PDF page.
    source_tables = sum(1 for p in doc.pages if p.is_table)
    output_tables = sum(1 for c in chunks if c.is_table)
    if source_tables != output_tables:
        issues.append(f"{source_tables} table page(s) in source but {output_tables} table chunk(s) in output")

    # Content-loss check: overlap/header-repeat/context prefix normally make
    # total chunk chars >= source chars. A big shortfall suggests dropped text.
    source_chars = len(doc.full_text)
    chunk_chars = sum(len(c.text) for c in chunks)
    if source_chars and chunk_chars < source_chars * 0.9:
        issues.append(f"possible content loss: chunks total {chunk_chars} chars vs source {source_chars} chars")

    # Context-enriched prefix should be present on every chunk when enabled
    if cfg.context_enriched:
        missing_prefix = [i for i, c in enumerate(chunks) if not c.text.startswith(doc.filename)]
        if missing_prefix:
            issues.append(f"{len(missing_prefix)} chunk(s) missing context-enriched filename prefix: {missing_prefix[:5]}")

    # LINE_ATOMIC (JSONL) chunks must each parse as valid JSON
    if cfg.strategy == ChunkStrategy.LINE_ATOMIC:
        bad_json = []
        for i, c in enumerate(chunks):
            body = c.text.split(":\n", 1)[-1] if cfg.context_enriched else c.text
            try:
                json.loads(body)
            except Exception:
                bad_json.append(i)
        if bad_json:
            issues.append(f"{len(bad_json)} chunk(s) failed JSON parse: {bad_json[:5]}")

    return issues


def main() -> None:
    file = "/Users/aks/Downloads/SBI_Life_-_Smart_Swadhan_Supreme__brochure__eng.pdf"
    url=None
    no_vision=True
    verbose=True


    if no_vision:
        os.environ["INGESTION_VISION_ENABLED"] = "false"

    # Import after env is set so config picks up the override
    from app.orchestra.ai.ingestion import get_ingestion_service
    from app.orchestra.ai.chunking import get_chunking_service

    filepath = Path(file)
    if not filepath.exists():
        print(f"ERROR: File not found: {filepath}")
        sys.exit(1)

    svc = get_ingestion_service()
    if not svc.is_supported(filepath.name):
        print(f"FAIL: '{filepath.suffix}' is not supported.")
        print(f"Supported: {', '.join(sorted(svc.supported_extensions()))}")
        sys.exit(1)

    # Stamped once per run so the console output and the dumped file can
    # always be traced back to exactly which run produced them — avoids
    # mistaking a stale output file for a fresh one.
    run_ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"\n{'='*60}")
    print(f"File : {filepath.name}  ({filepath.stat().st_size / 1024:.1f} KB)")
    print(f"Run  : {run_ts}")
    print(f"{'='*60}")

    raw = filepath.read_bytes()

    # ── Parse ─────────────────────────────────────────────────────────────────
    try:
        t0 = time.time()
        doc = svc.parse(raw, filepath.name)
        parse_time = time.time() - t0
    except Exception as e:
        print(f"\nFAIL (parse): {type(e).__name__}: {e}")
        sys.exit(1)

    table_pages = sum(1 for p in doc.pages if p.is_table)
    print(f"\nParsed   : {doc.page_count} pages in {parse_time:.2f}s")
    print(f"Tables   : {table_pages} table page(s) detected")

    if not doc.pages:
        print("\nFAIL: parser produced no pages.")
        sys.exit(1)

    # ── Chunk ─────────────────────────────────────────────────────────────────
    chunker = get_chunking_service()
    cfg = chunker.get_config(doc.filename)

    try:
        t0 = time.time()
        chunks = chunker.chunk(doc)
        chunk_time = time.time() - t0
    except Exception as e:
        print(f"\nFAIL (chunk): {type(e).__name__}: {e}")
        sys.exit(1)

    print(f"Strategy : {cfg.strategy.value}  (chunk_size={cfg.chunk_size}, overlap={cfg.overlap})")
    print(f"Chunks   : {len(chunks)} in {chunk_time:.2f}s")

    if not chunks:
        print("\nFAIL: chunker produced no chunks.")
        sys.exit(1)

    sizes = [len(c.text) for c in chunks]
    print(f"Size     : min={min(sizes)}  max={max(sizes)}  avg={sum(sizes)//len(sizes)}")

    issues = validate_chunks(chunks, doc, cfg)

    print(f"\nResult   : {'PASS' if not issues else 'WARN'}")
    if issues:
        print("Warnings:")
        for issue in issues:
            print(f"  - {issue}")

    print(f"\n{'─'*60}")
    print("Chunk breakdown:")
    for i, c in enumerate(chunks):
        excerpt = c.text.strip()[:100].replace("\n", " ")
        section = f"[{c.section}] " if c.section else ""
        print(f"  #{i:>3} page={c.page:<3} chars={len(c.text):<5} {section}{excerpt}{'…' if len(c.text) > 100 else ''}")
        if verbose:
            print(f"\n{c.text}\n{'─'*40}")

    # Dump every chunk, full text, in order, to a plain text file for
    # side-by-side reading against the source PDF. Filename and in-file
    # header both carry the run timestamp so this dump can never be
    # mistaken for a different (possibly stale) run.
    dump_path = filepath.with_name(f"{filepath.stem}_chunks_{run_ts}.txt")
    with open(dump_path, "w", encoding="utf-8") as f:
        f.write(f"source_file: {filepath.name}\n")
        f.write(f"run_timestamp: {run_ts}\n")
        f.write(f"chunk_count: {len(chunks)}\n\n")
        for i, c in enumerate(chunks):
            f.write(f"{'='*70}\n")
            f.write(f"CHUNK #{i} | page={c.page} | section={c.section or '(none)'} | chars={len(c.text)}\n")
            f.write(f"{'='*70}\n")
            f.write(c.text.strip() + "\n\n")
    print(f"\nDumped   : all {len(chunks)} chunks to {dump_path}")
    print(f"Run      : {filepath.name} @ {run_ts}")

    print(f"{'='*60}\n")

    if issues:
        sys.exit(1)


if __name__ == "__main__":
    main()
