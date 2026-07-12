"""
running_header_filter.py
app/orchestra/ai/ingestion/running_header_filter.py

Parser-agnostic utility for detecting and suppressing running page headers
before they reach the chunking layer.

Implements four complementary layers:
  B — positional filter   : headings in the top Y-band on every page
  C — frequency filter    : strings appearing on > N% of total pages
  A — deduplication       : identical consecutive headings collapsed to one
  D — collapse detector   : chunker-level check for structure collapse

Any parser (PDF, DOCX, HTML, etc.) feeds HeadingCandidate objects in;
gets back a filtered list with running headers removed.

Usage
-----
From a parser:
    from app.orchestra.ai.ingestion.running_header_filter import (
        HeadingCandidate, RunningHeaderFilter
    )
    candidates = [HeadingCandidate(text=h.text, page=h.page,
                                   y_position=h.top / page_height,
                                   total_pages=doc.page_count)
                  for h in raw_headings]
    clean = RunningHeaderFilter().filter(candidates)

From the chunker (layer D):
    from app.orchestra.ai.ingestion.running_header_filter import detect_structure_collapse
    if detect_structure_collapse(chunks, chunk_size):
        # fall back to BY_PAGE or BY_SIZE for this document
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from typing import Sequence

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data contract
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class HeadingCandidate:
    """
    Parser-agnostic representation of a potential heading.

    Attributes
    ----------
    text:
        The heading string as extracted by the parser.
    page:
        Zero-based page (or section) index where this heading was found.
    y_position:
        Normalized vertical position on the page, in [0.0, 1.0].
        0.0 = top of page, 1.0 = bottom.
        Pass 0.5 if the parser cannot determine position (disables layer B).
    total_pages:
        Total number of pages (or sections) in the document.
        Required for layer C frequency calculation.
    """
    text: str
    page: int
    y_position: float       # 0.0 (top) → 1.0 (bottom)
    total_pages: int


@dataclass
class FilterResult:
    """
    Returned by RunningHeaderFilter.filter().

    Attributes
    ----------
    headings:
        Cleaned list of HeadingCandidate objects with running headers removed.
    suppressed:
        Headings that were removed and the reason for each.
    """
    headings: list[HeadingCandidate]
    suppressed: list[tuple[HeadingCandidate, str]] = field(default_factory=list)

    def suppressed_texts(self) -> set[str]:
        return {h.text for h, _ in self.suppressed}


# ---------------------------------------------------------------------------
# Main filter class
# ---------------------------------------------------------------------------

class RunningHeaderFilter:
    """
    Removes running page headers from a list of HeadingCandidate objects.

    Layers run in order B → C → A. Each layer receives the output of the
    previous one, so they compound rather than overlap.

    Parameters
    ----------
    top_band_threshold:
        Layer B — Y-position ceiling for the "top band" check.
        Any heading with y_position <= this value on EVERY page it appears
        is treated as a positional header candidate.
        Default 0.10 (top 10% of page height).
    frequency_threshold:
        Layer C — fraction of total pages above which a heading string is
        considered a running header.
        Default 0.5 (appears on more than 50% of pages).
    deduplicate_consecutive:
        Layer A — if True, collapse consecutive identical heading texts to
        the first occurrence.
        Default True.
    positional_filter_enabled:
        Set False to skip layer B entirely (e.g. for parsers that cannot
        provide reliable y_position values).
        Default True.
    """

    def __init__(
        self,
        top_band_threshold: float = 0.10,
        frequency_threshold: float = 0.50,
        deduplicate_consecutive: bool = True,
        positional_filter_enabled: bool = True,
    ) -> None:
        self.top_band_threshold = top_band_threshold
        self.frequency_threshold = frequency_threshold
        self.deduplicate_consecutive = deduplicate_consecutive
        self.positional_filter_enabled = positional_filter_enabled

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def filter(self, candidates: Sequence[HeadingCandidate]) -> FilterResult:
        """
        Run all enabled layers in order (B → C → A) and return a FilterResult.

        Each layer receives the output of the previous one — they compound.
        No layer reorders; each only removes.
        """
        if not candidates:
            logger.debug("RunningHeaderFilter.filter: no candidates, skipping all layers")
            return FilterResult(headings=[])

        logger.debug(
            "RunningHeaderFilter.filter: starting — %d candidate(s), "
            "layer_b=%s, layer_c=%.0f%% threshold, layer_a=%s",
            len(candidates),
            "enabled" if self.positional_filter_enabled else "disabled",
            self.frequency_threshold * 100,
            "enabled" if self.deduplicate_consecutive else "disabled",
        )

        suppressed: list[tuple[HeadingCandidate, str]] = []
        working = list(candidates)

        # ── Layer B: positional ───────────────────────────────────────────────
        # Skip when y_position data is unavailable (e.g. post-parse from DOCX/HTML).
        if self.positional_filter_enabled:
            working, dropped = self._layer_b_positional(working)
            suppressed.extend((h, "positional") for h in dropped)
            logger.debug(
                "Layer B (positional, top_band=%.0f%%): suppressed %d heading(s): %s",
                self.top_band_threshold * 100,
                len(dropped),
                [h.text for h in dropped] or "none",
            )
        else:
            logger.debug("Layer B (positional): skipped — positional_filter_enabled=False")

        # ── Layer C: frequency ────────────────────────────────────────────────
        # Core layer — catches the "brochure header" problem where a string
        # like a product name repeats on every page and looks like a heading.
        working, dropped = self._layer_c_frequency(working)
        suppressed.extend((h, "frequency") for h in dropped)
        logger.debug(
            "Layer C (frequency, threshold=%.0f%%): suppressed %d heading(s): %s",
            self.frequency_threshold * 100,
            len(dropped),
            [h.text for h in dropped] or "none",
        )

        # ── Layer A: consecutive dedup ────────────────────────────────────────
        # Catches stragglers that passed C — same heading on adjacent pages
        # (e.g. a chapter title that just misses the frequency cutoff).
        if self.deduplicate_consecutive:
            working, dropped = self._layer_a_dedup(working)
            suppressed.extend((h, "consecutive_duplicate") for h in dropped)
            logger.debug(
                "Layer A (consecutive dedup): suppressed %d heading(s): %s",
                len(dropped),
                [h.text for h in dropped] or "none",
            )
        else:
            logger.debug("Layer A (consecutive dedup): skipped — deduplicate_consecutive=False")

        logger.info(
            "RunningHeaderFilter.filter: done — %d input → %d kept, %d suppressed",
            len(candidates), len(working), len(suppressed),
        )
        return FilterResult(headings=working, suppressed=suppressed)

    # ------------------------------------------------------------------
    # Layer B — positional
    # ------------------------------------------------------------------

    def _layer_b_positional(
        self, candidates: list[HeadingCandidate]
    ) -> tuple[list[HeadingCandidate], list[HeadingCandidate]]:
        """
        Flag headings that consistently sit in the top Y-band across every page.

        Requires ALL occurrences of a text to be within the band — not just one.
        This prevents removing a real section heading that happens to be near the
        top on a single page (e.g. a chapter that starts at the top of its page).
        """
        # Collect every y_position seen for each unique heading text
        positions_by_text: dict[str, list[float]] = {}
        for h in candidates:
            positions_by_text.setdefault(h.text, []).append(h.y_position)

        positional_noise: set[str] = set()
        for text, ys in positions_by_text.items():
            if all(y <= self.top_band_threshold for y in ys):
                positional_noise.add(text)
                logger.debug(
                    "Layer B: '%s' flagged as positional noise — "
                    "all %d occurrence(s) within top %.0f%% band (y_positions: %s)",
                    text, len(ys), self.top_band_threshold * 100,
                    [round(y, 3) for y in ys],
                )

        kept   = [h for h in candidates if h.text not in positional_noise]
        dropped = [h for h in candidates if h.text in positional_noise]
        return kept, dropped

    # ------------------------------------------------------------------
    # Layer C — frequency
    # ------------------------------------------------------------------

    def _layer_c_frequency(
        self, candidates: list[HeadingCandidate]
    ) -> tuple[list[HeadingCandidate], list[HeadingCandidate]]:
        """
        Remove headings that appear on more than `frequency_threshold` of pages.

        Counts distinct pages per heading text — not raw occurrences — so a
        heading that appears twice on one page doesn't inflate its score.
        total_pages is read from the candidates; we take the max as a safe
        fallback in case parsers disagree (they shouldn't).
        """
        if not candidates:
            return [], []

        total_pages = max(h.total_pages for h in candidates)
        if total_pages == 0:
            logger.warning("Layer C: total_pages=0, skipping frequency check")
            return list(candidates), []

        # Count the number of distinct pages each heading text appears on
        pages_by_text: dict[str, set[int]] = {}
        for h in candidates:
            pages_by_text.setdefault(h.text, set()).add(h.page)

        cutoff = self.frequency_threshold * total_pages
        frequent_noise: set[str] = set()
        for text, pages in pages_by_text.items():
            page_count = len(pages)
            if page_count > cutoff:
                frequent_noise.add(text)
                logger.debug(
                    "Layer C: '%s' flagged as frequent noise — "
                    "appears on %d/%d pages (%.0f%% > threshold %.0f%%)",
                    text, page_count, total_pages,
                    (page_count / total_pages) * 100,
                    self.frequency_threshold * 100,
                )

        kept   = [h for h in candidates if h.text not in frequent_noise]
        dropped = [h for h in candidates if h.text in frequent_noise]
        return kept, dropped

    # ------------------------------------------------------------------
    # Layer A — consecutive deduplication
    # ------------------------------------------------------------------

    def _layer_a_dedup(
        self, candidates: list[HeadingCandidate]
    ) -> tuple[list[HeadingCandidate], list[HeadingCandidate]]:
        """
        Collapse consecutive identical heading texts to the first occurrence.

        Sorted by (page, y_position) before scanning so "consecutive" means
        adjacent in reading order, not insertion order. Catches headings that
        narrowly missed Layer C's frequency cutoff but still repeat back-to-back
        across pages (e.g. a chapter title that spans 40% of pages — below the
        50% threshold but still produces redundant section boundaries).
        """
        if not candidates:
            return [], []

        # Sort by reading order so adjacency check is meaningful
        sorted_candidates = sorted(candidates, key=lambda h: (h.page, h.y_position))
        kept:    list[HeadingCandidate] = []
        dropped: list[HeadingCandidate] = []
        last_text: str | None = None

        for h in sorted_candidates:
            if h.text == last_text:
                # Same heading repeated on the next page — it's a running header,
                # not a new section boundary
                dropped.append(h)
                logger.debug(
                    "Layer A: '%s' on page %d is a consecutive duplicate of page %d, dropping",
                    h.text, h.page,
                    kept[-1].page if kept else -1,
                )
            else:
                kept.append(h)
                last_text = h.text

        return kept, dropped


# ---------------------------------------------------------------------------
# Layer D — chunker-level collapse detector (standalone, no parser coupling)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ChunkInfo:
    """
    Minimal chunk descriptor for collapse detection.
    Parsers and chunkers produce these; no PDF/DOCX types needed.
    """
    text: str
    section_label: str
    size: int           # character count


def detect_structure_collapse(
    chunks: Sequence[ChunkInfo],
    chunk_size: int,
    dominance_threshold: float = 0.80,
    size_multiplier: float = 2.0,
) -> bool:
    """
    Layer D — detect when BY_STRUCTURE has collapsed a document into
    one oversized block due to a repeated section label.

    Returns True if the chunker should fall back to BY_PAGE / BY_SIZE.

    Parameters
    ----------
    chunks:
        The chunks produced by the structure-based strategy.
    chunk_size:
        The configured maximum chunk size (characters).
    dominance_threshold:
        Fraction of chunks that must share the same label to trigger.
        Default 0.80 (80% share one label).
    size_multiplier:
        If the largest chunk exceeds chunk_size * this value AND the
        dominant-label condition is met, collapse is confirmed.
        Default 2.0.

    Notes
    -----
    Either condition alone is not enough:
    - A document legitimately dominated by one section can still chunk cleanly.
    - An oversized chunk alone may have a table-page explanation.
    Both must hold together.
    """
    if not chunks:
        logger.debug("detect_structure_collapse: no chunks provided, returning False")
        return False

    label_counts = Counter(c.section_label for c in chunks)
    most_common_label, most_common_count = label_counts.most_common(1)[0]
    dominance = most_common_count / len(chunks)
    max_size  = max(c.size for c in chunks)
    size_exceeded = max_size > chunk_size * size_multiplier

    logger.debug(
        "detect_structure_collapse: dominant_label=%r covers %.0f%% of %d chunks "
        "(threshold %.0f%%), max_chunk_size=%d (limit=%d, multiplier=%.1f)",
        most_common_label, dominance * 100, len(chunks),
        dominance_threshold * 100, max_size, chunk_size, size_multiplier,
    )

    collapsed = dominance >= dominance_threshold and size_exceeded

    if collapsed:
        # Both conditions met: a single label dominates AND the largest chunk is
        # way over the size limit. Almost certainly a running-header collapse that
        # the upstream filter missed. Chunker should fall back to BY_PAGE/BY_SIZE.
        logger.warning(
            "detect_structure_collapse: COLLAPSE DETECTED — "
            "label=%r on %.0f%% of chunks, max chunk %d chars vs limit %d "
            "— recommend falling back to BY_PAGE or BY_SIZE strategy",
            most_common_label, dominance * 100, max_size, chunk_size,
        )
    elif dominance >= dominance_threshold and not size_exceeded:
        # High dominance but chunk sizes are fine — one long section is legitimate
        logger.debug(
            "detect_structure_collapse: label=%r dominates (%.0f%%) but "
            "max chunk size %d is within limit — no collapse",
            most_common_label, dominance * 100, max_size,
        )
    elif size_exceeded and dominance < dominance_threshold:
        # Oversized chunk but caused by a table or genuinely large section, not collapse
        logger.debug(
            "detect_structure_collapse: max chunk size %d exceeds limit but "
            "no dominant label (%.0f%% < threshold %.0f%%) — likely a table page",
            max_size, dominance * 100, dominance_threshold * 100,
        )

    return collapsed


# ---------------------------------------------------------------------------
# Module-level convenience wrapper
# ---------------------------------------------------------------------------

def filter_headings(
    candidates: Sequence[HeadingCandidate],
    *,
    top_band_threshold: float = 0.10,
    frequency_threshold: float = 0.50,
    deduplicate_consecutive: bool = True,
    positional_filter_enabled: bool = True,
) -> FilterResult:
    """
    Convenience wrapper — constructs a RunningHeaderFilter with the given
    config and runs it in one call.

    Example
    -------
    from app.orchestra.ai.ingestion.running_header_filter import (
        HeadingCandidate, filter_headings
    )
    result = filter_headings(candidates, frequency_threshold=0.6)
    clean_headings = result.headings
    """
    return RunningHeaderFilter(
        top_band_threshold=top_band_threshold,
        frequency_threshold=frequency_threshold,
        deduplicate_consecutive=deduplicate_consecutive,
        positional_filter_enabled=positional_filter_enabled,
    ).filter(candidates)
