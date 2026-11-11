"""
Scraper contracts — the types every provider speaks.

Deliberately free of FastAPI: a provider raises ScrapeError, and whichever
layer called it decides what that means (the API maps it to a status code, a
background job would just log it). Keeping HTTP framework types out is what
lets this package be reused from a job, a CLI, or a test.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


ScrapeMode = Literal["quick", "deep"]


@dataclass(frozen=True)
class FetchedPage:
    """One successfully fetched page, before any parsing."""

    raw:          bytes
    final_url:    str    # after redirects — may differ from what the user typed
    content_type: str
    # Synthetic name whose EXTENSION selects the parser (page.html / page.pdf /
    # page.txt / page.md). Not shown to users; `title` is the display name.
    filename:     str
    title:        str    # <title>, or the hostname when there isn't one
    status_code:  int
    provider:     str = ""
    mode:         ScrapeMode = "quick"

    @property
    def size_bytes(self) -> int:
        return len(self.raw)


class ScrapeError(Exception):
    """
    A fetch that failed for a reason worth telling the user about.

    `status_hint` is what the HTTP layer should return — carried as plain data
    so this module never imports a web framework. `reason` is a short machine
    tag for logs/metrics; `str(e)` is the human message.
    """

    def __init__(self, message: str, *, reason: str = "fetch_failed", status_hint: int = 400):
        super().__init__(message)
        self.reason = reason
        self.status_hint = status_hint
