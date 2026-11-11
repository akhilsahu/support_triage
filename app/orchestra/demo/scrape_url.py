"""Scrape a URL and export chunks/metadata without indexing or fact extraction.

Edit URL below, or run from the repository root:
    python -m app.orchestra.demo.scrape_url --url https://example.com
    python -m app.orchestra.demo.scrape_url --url https://example.com --deep

Python/debugger entry point:
    main(url="https://example.com")

Each run creates data/chunks/url-<timestamp>-<id>/ with one JSON file per
chunk and a summary.json. Vision is opt-in; --deep uses the configured deep
scraper. Otherwise the existing quick-to-deep fallback is preserved.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict, replace
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time
from uuid import uuid4

PROJECT_ROOT = Path(__file__).resolve().parents[3]
URL = "https://amazon.in"
OUTPUT_DIR = PROJECT_ROOT / "data" / "chunks"


def _save_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


async def scrape_url(
    url: str = URL, output_dir: str | Path = OUTPUT_DIR, *,
    force_deep: bool = False, vision: bool = False,
) -> Path:
    """Return the export directory; all scraping/parsing uses shared services."""
    # Lazy imports let --help work without application/provider initialization.
    from app.orchestra.ai.config import build_ingestion_config
    from app.orchestra.ai.ingestion.preparation import prepare_source
    from app.orchestra.ai.ingestion.scraper import smart_scrape_url
    from app.orchestra.ai.ingestion.chunking.sizing import CHUNKING_VERSION

    if not isinstance(url, str) or not url.strip():
        raise ValueError("Provide a nonempty URL")
    started = time.perf_counter()
    scraped = await smart_scrape_url(url.strip(), force_deep=force_deep)
    scraped_at = time.perf_counter()
    raw = scraped.raw_bytes or scraped.clean_text.encode("utf-8")
    filename = scraped.filename if scraped.raw_bytes else "content.md"
    parser_config = replace(build_ingestion_config(), vision_enabled=vision)
    prepared = await asyncio.to_thread(prepare_source, raw, filename, parser_config=parser_config, web=True)
    prepared_at = time.perf_counter()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = Path(output_dir).expanduser().resolve() / f"url-{timestamp}-{uuid4().hex[:8]}"
    destination.mkdir(parents=True, exist_ok=False)
    source = {
        "requested_url": url.strip(), "final_url": scraped.final_url,
        "title": scraped.title, "filename": filename,
        "scrape_mode": scraped.mode_used, "provenance": scraped.provenance,
    }
    chunk_files = []
    for index, chunk in enumerate(prepared.chunks):
        name = f"chunk_{index:04d}.json"
        _save_json(destination / name, {"source": source, **asdict(chunk)})
        chunk_files.append(name)

    _save_json(destination / "summary.json", {
        "source": source,
        "quality": asdict(scraped.quality) if scraped.quality else None,
        "page_count": prepared.document.page_count,
        "chunk_count": len(prepared.chunks),
        "chunking_version": CHUNKING_VERSION,
        "strategy": prepared.strategy,
        "chunking_config": asdict(prepared.config),
        "document_metadata": prepared.document.metadata,
        "page_assets": scraped.page_assets,
        "vision_enabled": vision,
        "scrape_seconds": round(scraped_at - started, 3),
        "prepare_seconds": round(prepared_at - scraped_at, 3),
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "chunk_files": chunk_files,
    })
    print(f"Saved {len(prepared.chunks)} chunks ({scraped.mode_used} scrape) to {destination}")
    return destination


def main(
    url: str = URL, output_dir: str | Path = OUTPUT_DIR, *,
    force_deep: bool = False, vision: bool = False,
) -> Path:
    return asyncio.run(scrape_url(url, output_dir, force_deep=force_deep, vision=vision))


def _cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=URL, help="URL to scrape; defaults to the editable URL variable")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Export parent directory (default: data/chunks)")
    parser.add_argument("--deep", action="store_true", help="Start with the configured deep scraper")
    parser.add_argument("--vision", action="store_true", help="Allow configured vision/OCR while parsing")
    args = parser.parse_args()
    try:
        main(args.url, args.output_dir, force_deep=args.deep, vision=args.vision)
    except Exception as error:
        # Provider exceptions can contain credentials/URLs; do not echo them.
        print(f"Export failed ({type(error).__name__}). Check the URL and scraper configuration.", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    _cli()
