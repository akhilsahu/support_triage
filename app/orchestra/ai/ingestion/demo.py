"""
Demo / test script for the ingestion pipeline.

Usage:
    # Parse a file
    python -m app.orchestra.ai.ingestion.demo path/to/file.pdf
    python -m app.orchestra.ai.ingestion.demo path/to/file.docx --verbose
    python -m app.orchestra.ai.ingestion.demo path/to/file.xlsx --no-vision

    # Scrape a URL
    python -m app.orchestra.ai.ingestion.demo --url https://example.com/page

What it tests:
    1. File/URL is recognised and the correct parser selected
    2. Parses without errors, trying fallback if primary fails
    3. Output contains pages with non-empty text
    4. Prints a summary: pages, chars, sections, excerpt per page
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


def main() -> None:
    file = "/Users/aks/Downloads/hdfc-life-click-2-protect-supreme-plus.pdf"
    url=None
    no_vision=True
    verbose=True

    if no_vision:
        os.environ["INGESTION_VISION_ENABLED"] = "false"

    # Import after env is set so config picks up the override
    from app.orchestra.ai.ingestion import IngestionService
    from app.orchestra.ai.ingestion.config import build_ingestion_config
    from app.orchestra.ai.ingestion.parsers.html_parser import HtmlParser

    cfg = build_ingestion_config()
    svc = IngestionService(cfg)

    # ── URL mode ──────────────────────────────────────────────────────────────
    if url:
        print(f"\n{'='*60}")
        print(f"URL    : {url}")
        print(f"Parser : HtmlParser (URL scrape)")
        print(f"{'='*60}")
        try:
            start   = time.time()
            html_p  = HtmlParser(cfg)
            doc     = html_p.parse_url(url)
            elapsed = time.time() - start
        except Exception as e:
            print(f"\nFAIL: {type(e).__name__}: {e}")
            sys.exit(1)
        _print_result(doc, elapsed, verbose)
        return

    # ── File mode ─────────────────────────────────────────────────────────────
    filepath = Path(file)
    if not filepath.exists():
        print(f"ERROR: File not found: {filepath}")
        sys.exit(1)

    ext = filepath.suffix.lower()

    print(f"\n{'='*60}")
    print(f"File     : {filepath.name}")
    print(f"Size     : {filepath.stat().st_size / 1024:.1f} KB")
    print(f"Extension: {ext}")

    if not svc.is_supported(filepath.name):
        print(f"\nFAIL: '{ext}' is not supported.")
        print(f"Supported: {', '.join(sorted(svc.supported_extensions()))}")
        sys.exit(1)

    entry = cfg.parser_map.get(ext, {})
    print(f"Parser   : {entry.get('parser', '?')}")
    if entry.get("fallback"):
        print(f"Fallback : {entry['fallback']} (if primary fails)")
    print(f"Vision   : {'enabled' if cfg.vision_enabled else 'disabled'}")
    print(f"{'='*60}")

    raw = filepath.read_bytes()
    try:
        start   = time.time()
        doc     = svc.parse(raw, filepath.name)
        elapsed = time.time() - start
    except Exception as e:
        print(f"\nFAIL: {type(e).__name__}: {e}")
        sys.exit(1)

    _print_result(doc, elapsed, verbose)


def _print_result(doc, elapsed: float, verbose: bool) -> None:
    issues      = []
    total_chars = sum(len(p.text) for p in doc.pages)
    sections    = [p.section for p in doc.pages if p.section]

    if not doc.pages:
        issues.append("No pages were produced")
    empty = [p.page for p in doc.pages if not p.text.strip()]
    if empty:
        issues.append(f"Pages with empty text: {empty}")

    print(f"\nResult   : {'PASS' if not issues else 'WARN'}")
    print(f"Pages    : {len(doc.pages)}")
    print(f"Chars    : {total_chars:,}")
    print(f"Sections : {len(set(sections))} unique")
    print(f"Time     : {elapsed:.2f}s")

    if issues:
        print("\nWarnings:")
        for issue in issues:
            print(f"  - {issue}")

    print(f"\n{'─'*60}")
    print("Page breakdown:")
    for page in doc.pages:
        excerpt = page.text.strip()[:120].replace("\n", " ")
        section = f"[{page.section}] " if page.section else ""
        print(f"  Page {page.page:>3}  {section}{excerpt}{'…' if len(page.text) > 120 else ''}")
        if verbose:
            print(f"\n{page.text}\n{'─'*40}")

    if doc.metadata:
        print(f"\nMetadata : {doc.metadata}")

    print(f"{'='*60}\n")

    if issues:
        sys.exit(1)


if __name__ == "__main__":
    main()
