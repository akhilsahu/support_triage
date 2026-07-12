"""
IngestionService — loads parsers from config and parses documents.

Usage:
    svc = IngestionService()
    doc = svc.parse(raw_bytes, "report.pdf")
"""

from __future__ import annotations

import importlib
from pathlib import Path
from typing import Dict, List, Optional, Type

import structlog

from app.rag.document_parser import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.base import BaseParser
from app.orchestra.ai.ingestion.config import IngestionConfig, build_ingestion_config, _FALLBACK_MODULES
from app.orchestra.ai.ingestion.running_header_filter import HeadingCandidate, RunningHeaderFilter

logger = structlog.get_logger()


class IngestionService:

    def __init__(self, cfg: Optional[IngestionConfig] = None) -> None:
        self.cfg = cfg or build_ingestion_config()
        self._parsers = self._load_parsers()

    # ── Public API ────────────────────────────────────────────────────────────

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        """Parse file bytes into a ParsedDocument. Tries primary parser first, then fallback."""
        chain = self._get_chain(filename)
        if not chain:
            raise ValueError(
                f"Unsupported file type '{filename}'. "
                f"Supported: {', '.join(sorted(self._parsers))}"
            )

        last_err: Optional[Exception] = None
        for parser in chain:
            try:
                logger.info("ingestion.parsing", filename=filename,
                            parser=type(parser).__name__,
                            size_kb=round(len(raw) / 1024, 1))
                doc = parser.parse(raw, filename)
                # PdfParser already runs its own running-header/footer
                # detection up front, from raw per-page lines (see
                # PdfParser._detect_boilerplate_lines) — more precise than
                # this filter, since it uses real page numbers and a length
                # floor. Running this filter on top of PDF output actively
                # corrupts correct section metadata: its consecutive-dedup
                # layer can't distinguish a genuine running header from a
                # section heading that legitimately persists across several
                # ParsedPages (the normal case now that heading detection
                # tracks real headings), and collapses the latter back to
                # a stale, previous section label. Kept active for other
                # parsers (DOCX/HTML/PPTX/etc.), which have no equivalent
                # of their own yet.
                if Path(filename).suffix.lower() != ".pdf":
                    doc = self._filter_running_headers(doc)
                logger.info("ingestion.done", filename=filename,
                            parser=type(parser).__name__, pages=doc.page_count)
                return doc
            except Exception as e:
                last_err = e
                logger.warning("ingestion.trying_fallback", filename=filename,
                               failed=type(parser).__name__, error=str(e))

        raise RuntimeError(f"All parsers failed for '{filename}'. Last error: {last_err}")

    def is_supported(self, filename: str) -> bool:
        return bool(self._get_chain(filename))

    def supported_extensions(self) -> List[str]:
        return list(self._parsers.keys())

    # ── Running header filter ─────────────────────────────────────────────────

    def _filter_running_headers(self, doc: ParsedDocument) -> ParsedDocument:
        """
        Post-parse pass applied to every ParsedDocument before it reaches
        the chunker. Detects and removes repeated section labels (running page
        headers) that would cause BY_STRUCTURE chunking to collapse all content
        under one section name.

        Called from parse() — runs transparently after any parser succeeds,
        so parsers themselves need no knowledge of this logic.

        Why post-parse rather than inside each parser:
          - Parsers don't all have access to y_position data (DOCX, HTML, PPTX).
          - A single call site here covers current and future parsers for free.
          - Keeps parser code focused on extraction, not header heuristics.

        Layers active: C (frequency) + A (consecutive dedup).
        Layer B (positional) is disabled — bbox/y data is not stored on ParsedPage.

        Pages whose section is suppressed inherit the last valid section label
        so their text remains contextually anchored in the chunker.
        """
        pages = doc.pages
        if not pages:
            logger.debug(
                "ingestion.header_filter.skip",
                filename=doc.filename,
                reason="document has no pages",
            )
            return doc

        total = len(pages)

        # Build one HeadingCandidate per page that has a non-empty section label.
        # y_position=0.5 is a neutral sentinel — Layer B is disabled, so this
        # value is never evaluated; it just satisfies the dataclass signature.
        candidates = [
            HeadingCandidate(
                text=p.section,
                page=idx,
                y_position=0.5,
                total_pages=total,
            )
            for idx, p in enumerate(pages)
            if p.section
        ]

        logger.debug(
            "ingestion.header_filter.start",
            filename=doc.filename,
            total_pages=total,
            pages_with_section=len(candidates),
            unique_sections=len({c.text for c in candidates}),
        )

        if not candidates:
            logger.debug(
                "ingestion.header_filter.skip",
                filename=doc.filename,
                reason="no pages carry a section label",
            )
            return doc

        # Layer B disabled — no positional data available post-parse.
        # Layers C (frequency) and A (consecutive dedup) run.
        result = RunningHeaderFilter(positional_filter_enabled=False).filter(candidates)
        suppressed = result.suppressed_texts()

        if not suppressed:
            logger.debug(
                "ingestion.header_filter.clean",
                filename=doc.filename,
                reason="no running headers detected — all section labels look legitimate",
            )
            return doc

        logger.info(
            "ingestion.header_filter.suppressed",
            filename=doc.filename,
            suppressed_count=len(suppressed),
            suppressed_labels=sorted(suppressed),
            total_pages=total,
        )

        # Remap pages: a page whose section was suppressed inherits the last
        # non-suppressed section so its content isn't orphaned (empty section
        # would cause BY_STRUCTURE to group it with unrelated content).
        last_valid_section = ""
        remapped: List[ParsedPage] = []
        remapped_count = 0

        for page in pages:
            if page.section and page.section not in suppressed:
                # Section is legitimate — keep as-is and update the carry-forward value
                last_valid_section = page.section
                remapped.append(page)
            else:
                # Section is a running header (or empty) — carry forward the last good one
                remapped_count += 1
                logger.debug(
                    "ingestion.header_filter.remap",
                    filename=doc.filename,
                    page=page.page,
                    old_section=page.section or "(empty)",
                    new_section=last_valid_section or "(empty — no prior valid section)",
                )
                remapped.append(ParsedPage(
                    page=page.page,
                    text=page.text,
                    section=last_valid_section,
                    is_table=page.is_table,
                ))

        logger.info(
            "ingestion.header_filter.done",
            filename=doc.filename,
            pages_remapped=remapped_count,
            pages_unchanged=total - remapped_count,
        )

        return ParsedDocument(
            filename=doc.filename,
            extension=doc.extension,
            pages=remapped,
            metadata=doc.metadata,
        )

    # ── Internals ─────────────────────────────────────────────────────────────

    def _get_chain(self, filename: str) -> List[BaseParser]:
        """Return [primary, fallback?] parser instances for this file."""
        ext = Path(filename).suffix.lower()
        return self._parsers.get(ext, [])

    def _load_parsers(self) -> Dict[str, List[BaseParser]]:
        """
        Build ext → [primary, fallback?] from config.parser_map.
        Only imports the specific module each entry points to — no directory scanning.
        """
        instances: Dict[str, BaseParser] = {}   # class name → singleton, reused across extensions
        parsers:   Dict[str, List[BaseParser]] = {}

        for ext, entry in self.cfg.parser_map.items():
            if ext not in self.cfg.enabled_extensions:
                continue

            chain: List[BaseParser] = []

            # primary — module is always declared in the entry
            primary_name = entry.get("parser")
            if primary_name:
                inst = self._get_instance(primary_name, entry.get("module", ""), instances)
                if inst:
                    chain.append(inst)

            # fallback — may live in a different module; look up in _FALLBACK_MODULES
            fallback_name = entry.get("fallback")
            if fallback_name:
                fb_module = _FALLBACK_MODULES.get(fallback_name, entry.get("module", ""))
                inst = self._get_instance(fallback_name, fb_module, instances)
                if inst:
                    chain.append(inst)

            if chain:
                parsers[ext] = chain
                logger.debug("ingestion.registered", ext=ext,
                             parser=primary_name, fallback=fallback_name)

        logger.info("ingestion.ready", total=len(parsers), extensions=list(parsers.keys()))
        return parsers

    def _get_instance(self, class_name: str, module_path: str,
                      instances: Dict[str, BaseParser]) -> Optional[BaseParser]:
        """Import only the required module and return a singleton instance of class_name."""
        if class_name in instances:
            return instances[class_name]
        try:
            mod = importlib.import_module(module_path)
            cls: Type[BaseParser] = getattr(mod, class_name)
            instances[class_name] = cls(self.cfg)
            return instances[class_name]
        except Exception as e:
            logger.warning("ingestion.load_error", class_name=class_name,
                           module=module_path, error=str(e))
            return None


# ── Singleton ─────────────────────────────────────────────────────────────────

_instance: Optional[IngestionService] = None


def get_ingestion_service() -> IngestionService:
    global _instance
    if _instance is None:
        _instance = IngestionService()
    return _instance
