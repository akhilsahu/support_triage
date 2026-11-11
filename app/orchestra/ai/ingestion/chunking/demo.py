"""Inspect file chunking without indexing or database writes.

Python:
    from app.orchestra.ai.ingestion.chunking.demo import run_demo
    report = run_demo("/path/to/document.pdf", output_path="/tmp/chunks.json")

All options are function parameters. Vision/model calls are disabled by default;
set no_vision=False to allow the configured vision provider. Full output is saved
as JSON at output_path, or in an OS temporary file when output_path is omitted.
Running this file directly (including in the debugger) calls main() with its
editable default parameters below; no command-line arguments are needed.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import asdict, replace
import json
from pathlib import Path
import tempfile
import time


def validate_chunks(chunks, doc, cfg) -> list[str]:
    """Check final budgets and source coverage, including table-row duplicates."""
    from app.orchestra.ai.ingestion.chunking.sizing import fits, token_count

    issues = []
    covered = {}
    for index, chunk in enumerate(chunks):
        if not chunk.text.strip():
            issues.append(f"Chunk {index} is empty")
        if not fits(chunk.text, cfg):
            issues.append(f"Chunk {index} exceeds its final character/token budget")
        if chunk.metadata.get("token_count") != token_count(chunk.text, cfg):
            issues.append(f"Chunk {index} has an incorrect token count")
        for direction, step in (("previous", -1), ("next", 1)):
            neighbor = chunk.metadata.get(f"{direction}_chunk_index", -1)
            if neighbor != -1 and (neighbor != index + step or not 0 <= neighbor < len(chunks)
                                   or chunks[neighbor].metadata.get("group_index") != chunk.metadata.get("group_index")):
                issues.append(f"Chunk {index} has an invalid {direction} link")
            if chunk.metadata.get(f"continues_{direction}") and neighbor == -1:
                issues.append(f"Chunk {index} has a structural continuation without a {direction} link")
        if chunk.metadata.get("row_boundary_source") == "newline_fallback":
            issues.append(f"Chunk {index}: legacy table lacks explicit row spans; embedded cell newlines are ambiguous")
        if chunk.metadata.get("table_header_unknown"):
            issues.append(f"Chunk {index}: parser supplied no explicit table header; no header was inferred")
        if chunk.metadata.get("repeated_header_omitted"):
            issues.append(f"Chunk {index}: table header cannot be repeated within the configured budget")
        for span in chunk.metadata.get("source_spans", []):
            fragment = span["page_fragment"]
            if not 0 <= fragment < len(doc.pages):
                issues.append(f"Chunk {index} has an invalid source fragment")
                continue
            page = doc.pages[fragment]
            if span["page"] != page.page or not 0 <= span["start"] < span["end"] <= len(page.text):
                issues.append(f"Chunk {index} has an invalid source locator")
                continue
            covered.setdefault(fragment, []).append((span["start"], span["end"]))
    for fragment, page in enumerate(doc.pages):
        cursor = 0
        for start, end in sorted(covered.get(fragment, [])):
            if start > cursor and page.text[cursor:start].strip():
                issues.append(f"Missing source content in page fragment {fragment}: {cursor}:{start}")
            cursor = max(cursor, end)
        if page.text[cursor:].strip():
            issues.append(f"Missing source content in page fragment {fragment}: {cursor}:{len(page.text)}")
    return issues


def run_demo(filename: str | Path, *, no_vision: bool = True, verbose: bool = False,
             output_path: str | Path | None = None, config=None) -> dict:
    """Parse/chunk a file, save its full JSON report, and return the report."""
    from app.orchestra.ai.config import build_ingestion_config
    from app.orchestra.ai.ingestion.parser_service import IngestionService
    from app.orchestra.ai.ingestion.chunking import ChunkingService
    from app.orchestra.ai.ingestion.chunking.sizing import CHUNKING_VERSION

    path = Path(filename).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    ingestion_cfg = build_ingestion_config()
    if no_vision:
        ingestion_cfg = replace(ingestion_cfg, vision_enabled=False)
    ingestion = IngestionService(ingestion_cfg)
    if not ingestion.is_supported(path.name):
        raise ValueError(f"Unsupported file extension: {path.suffix}")

    started = time.monotonic()
    document = ingestion.parse(path.read_bytes(), path.name)
    parsed_at = time.monotonic()
    chunker = ChunkingService()
    # Captions are deterministic in this demo; no hidden LLM enrichment calls.
    cfg = replace(config or chunker.get_config(path.name), table_caption_mode="heuristic")
    chunks = chunker.chunk(document, cfg)
    if not chunks:
        raise ValueError("File produced no chunks")
    issues = validate_chunks(chunks, document, cfg)
    report = {
        "filename": path.name, "chunking_version": CHUNKING_VERSION,
        "strategy": cfg.strategy.value, "max_tokens": cfg.max_tokens,
        "chunk_size_characters": cfg.chunk_size, "overlap_characters": cfg.overlap,
        "tokenizer": cfg.tokenizer_name, "pages": document.page_count,
        "chunk_count": len(chunks),
        "split_modes": dict(Counter(chunk.metadata["split_mode"] for chunk in chunks)),
        "block_types": dict(Counter(chunk.metadata["block_type"] for chunk in chunks)),
        "row_boundary_sources": dict(Counter(chunk.metadata["row_boundary_source"] for chunk in chunks if chunk.metadata.get("row_boundary_source"))),
        "structural_continuation_chunks": sum(bool(chunk.metadata["continues_previous"] or chunk.metadata["continues_next"]) for chunk in chunks),
        "repeated_header_chunks": sum(chunk.metadata["repeated_header"] for chunk in chunks),
        "max_chunk_tokens": max(chunk.metadata["token_count"] for chunk in chunks),
        "parse_seconds": round(parsed_at - started, 3),
        "chunk_seconds": round(time.monotonic() - parsed_at, 3),
        "issues": issues, "chunks": [asdict(chunk) for chunk in chunks],
    }
    if output_path is None:
        with tempfile.NamedTemporaryFile(prefix="chunking-", suffix=".json", delete=False) as handle:
            destination = Path(handle.name)
    else:
        destination = Path(output_path).expanduser().resolve()
        if destination == path:
            raise ValueError("Output must not overwrite the source file")
        destination.parent.mkdir(parents=True, exist_ok=True)
    report["output_path"] = str(destination)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{path.name}: {len(chunks)} chunks; max {report['max_chunk_tokens']}/{cfg.max_tokens} tokens")
    print(f"Split modes: {report['split_modes']}; repeated headers: {report['repeated_header_chunks']}")
    print(f"Source coverage and budgets: {'PASS' if not issues else 'WARN'}")
    for issue in issues:
        print(f"  {issue}")
    print(f"Full output: {destination}")
    if verbose:
        for chunk in chunks:
            print(f"\nChunk {chunk.chunk_index} | page {chunk.page} | {chunk.metadata['token_count']} tokens"
                  f" | {chunk.metadata['block_type']}/{chunk.metadata['split_mode']}"
                  f" | continues previous={chunk.metadata['continues_previous']}, next={chunk.metadata['continues_next']}\n{chunk.text}")
    return report


def main(filename: str | Path = "uploads/chatbot_logos/SpaceX IPO Roadshow.pdf", *, no_vision: bool = True, verbose: bool = False,
         output_path: str | Path | None = "/Users/aks/Projects/support247_bobathon/data/chunks/file.json", config=None) -> dict:
    """Function entry point; exceptions propagate to the caller."""
    print("This is main file")
    return run_demo(filename, no_vision=no_vision, verbose=verbose,
                    output_path=output_path, config=config)


if __name__ == "__main__":
    # Direct-file debugger launches put this directory, rather than the project
    # root, on sys.path. Make the same app imports work as a package invocation.
    import sys

    project_root = str(Path(__file__).resolve().parents[5])
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    main()
