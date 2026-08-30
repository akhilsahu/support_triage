"""Deterministic, provider-neutral extraction quality assessment."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal


QualityRating = Literal["good", "questionable", "poor"]

_BOILERPLATE = re.compile(
    r"^(?:faq|faqs|terms(?:\s*&\s*|\s+and\s+)conditions|contact us|"
    r"privacy policy|login|register now|apply now|view all(?:\s+\w+)*|"
    r"quick links|important links)$",
    re.IGNORECASE,
)
_WORDS = re.compile(r"\b[\w₹$%.,+-]+\b")
_ENDS_SENTENCE = re.compile(r"[.!?][\]\)'\"]*$")


@dataclass(frozen=True)
class ExtractionQuality:
    score: int
    rating: QualityRating
    reasons: tuple[str, ...]


def _rating_for_score(score: int) -> QualityRating:
    if score >= 70:
        return "good"
    if score >= 40:
        return "questionable"
    return "poor"


def assess_extraction(text: str) -> ExtractionQuality:
    """Score extracted text without relying on any scraper-specific metadata.

    Length alone is deliberately insufficient: a repeated navigation tree can
    be much larger than a useful article. Line diversity, navigation density,
    and prose density ensure those two cases receive different ratings, while
    a normal prose paragraph remains valid even when it has no line breaks.
    """
    cleaned_text = text.strip()
    lines = [
        " ".join(line.split())
        for line in cleaned_text.splitlines()
        if line.strip()
    ]
    words = _WORDS.findall(cleaned_text)

    if not words:
        return ExtractionQuality(
            score=30,
            rating="poor",
            reasons=("too_little_content",),
        )

    normalized = [line.casefold() for line in lines]
    unique_line_ratio = len(set(normalized)) / max(len(normalized), 1)
    repeated_line_ratio = 1 - unique_line_ratio

    navigation_lines = sum(
        bool(_BOILERPLATE.fullmatch(line)) or len(line.split()) <= 4
        for line in lines
    )
    navigation_ratio = navigation_lines / max(len(lines), 1)

    prose_lines = sum(
        len(line.split()) >= 8 and bool(_ENDS_SENTENCE.search(line))
        for line in lines
    )
    prose_ratio = prose_lines / max(len(lines), 1)

    score = 100
    reasons: list[str] = []

    if len(cleaned_text) < 200 or len(words) < 40:
        score -= 35
        reasons.append("too_little_content")
    if repeated_line_ratio > 0.45:
        score -= 35
        reasons.append("high_repetition")
    if navigation_ratio > 0.65:
        score -= 35
        reasons.append("navigation_dominant")
    if len(lines) >= 8 and prose_ratio < 0.12:
        score -= 20
        reasons.append("low_prose_density")

    score = max(0, min(100, score))
    return ExtractionQuality(
        score=score,
        rating=_rating_for_score(score),
        reasons=tuple(reasons),
    )
