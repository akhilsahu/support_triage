"""Deterministic, provider-neutral extraction quality assessment."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal


QualityRating = Literal["good", "questionable", "poor"]

_BOILERPLATE = re.compile(
    r"^(?:faq|faqs|terms(?:\s*&\s*|\s+and\s+)conditions|contact us|"
    r"privacy policy|login|sign in|create account|register now|apply now|view all(?:\s+\w+)*|"
    r"quick links|important links|keyboard shortcuts|skip to main content|"
    r"search|cart|orders|all categories|select the department|delivering to|update location|"
    r"search\s+alt\s*\+\s*/|cart\s+shift\s*\+\s*alt\s*\+\s*c|home\s+shift\s*\+\s*alt\s*\+\s*h|"
    r"orders\s+shift\s*\+\s*alt\s*\+\s*o|show/hide shortcuts.*)$",
    re.IGNORECASE,
)
_BOT_CHALLENGE = re.compile(
    r"(?:enter the characters you see below|robot check|verify you are human|"
    r"verify you are a human|access denied|just a moment\.{3}|enable javascript and cookies|"
    r"security check to continue|please complete the captcha|cloudflare ray id)",
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


def assess_extraction(text: str, *, raw_bytes_len: int | None = None) -> ExtractionQuality:
    """Score extracted text without relying on any scraper-specific metadata.

    Length alone is deliberately insufficient: a repeated navigation tree can
    be much larger than a useful article. Line diversity, navigation density,
    prose density, and HTML-to-text ratios ensure unhydrated shells, bot challenges,
    and menus receive low ratings, while normal prose remains valid.
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

    # 1. Bot check / CAPTCHA challenge detection
    if _BOT_CHALLENGE.search(cleaned_text):
        score -= 60
        reasons.append("bot_detection_challenge")

    # 2. Content length checks
    if len(cleaned_text) < 200 or len(words) < 40:
        score -= 35
        reasons.append("too_little_content")

    # 3. High repetition checks
    if repeated_line_ratio > 0.45:
        score -= 35
        reasons.append("high_repetition")

    # 4. Navigation & boilerplate ratio
    if navigation_ratio > 0.65:
        score -= 35
        reasons.append("navigation_dominant")

    # 5. Prose density checks
    if len(lines) >= 8 and prose_ratio < 0.12:
        score -= 20
        reasons.append("low_prose_density")
    elif len(lines) >= 3 and prose_lines == 0:
        score -= 25
        reasons.append("low_prose_density")

    # 6. Unhydrated SPA / HTML ratio check (e.g. 100 KB+ of HTML yielding < 1.5% extracted text)
    if raw_bytes_len and raw_bytes_len > 80_000:
        ratio = len(cleaned_text) / raw_bytes_len
        if ratio < 0.015:
            score -= 35
            reasons.append("unhydrated_shell")

    score = max(0, min(100, score))
    return ExtractionQuality(
        score=score,
        rating=_rating_for_score(score),
        reasons=tuple(reasons),
    )
