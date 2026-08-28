"""
Pull authoritative attributes out of an indexed document.

Retrieval finds the passage most similar to a question; it does not guarantee a
specific number reaches the answer. "What is the annual fee for SBI Card PRIME?"
is a lookup, and the value lives in a shared MITC document listing ~20 cards.
This turns those rows into editable facts that get injected on every turn.

Two properties are load-bearing:

  * Nothing is auto-accepted. Every row comes back `verified=False`. The source
    table has "SBI Card MILES PRIME" and "SBI Card PRIME" one row apart, so a
    wrong match is a confidently wrong fee rather than a missing one — the
    failure a human is far better placed to catch than a matcher.

  * Format-agnostic. Table rows are the fast path, not the requirement: when a
    document has `is_table_row` chunks only those are read (cheap and precise),
    and a prose document falls back to its ordinary chunks. Same endpoint, same
    review flow; only the token cost differs.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import structlog

from app.rag.vector_store import get_vector_store

logger = structlog.get_logger()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _providers() -> List[tuple]:
    """
    Every configured OpenAI-compatible provider, in LLM_PROVIDER_PRIORITY order.

    Returns the whole list rather than one entry because "configured" and
    "working" are different things: a key can be present and the account out of
    credit, which is exactly the state that made a single-pick resolver return
    nothing. The caller walks this list on failure.

    Now powered by the central get_async_openai_clients utility to ensure
    all backend services parse the priority exactly the same way.
    """
    from app.core.llm_provider import get_async_openai_clients
    return get_async_openai_clients()


async def _complete(providers: List[tuple], body: str) -> tuple:
    """
    Run one batch, falling through to the next provider on failure.

    Returns (content, working_providers) — the caller keeps the reordered list so
    a provider that just failed hard is not retried on every subsequent batch.
    """
    last: Optional[Exception] = None
    for i, (name, client, model) in enumerate(providers):
        try:
            res = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": f"{body}\n\nExtract the facts as JSON."},
                ],
                temperature=0.0,
                max_tokens=2000,
                response_format={"type": "json_object"},
            )
            # Promote the provider that worked so later batches start with it.
            return (res.choices[0].message.content or ""), providers[i:] + providers[:i]
        except Exception as e:
            last = e
            logger.warning("facts.extract.provider_failed", provider=name, error=str(e)[:200])
    raise RuntimeError(f"All LLM providers failed: {last}")

# Batching trades LLM round-trips against the risk of a long input degrading
# extraction. Rows are short, so a reasonably large batch is still well inside
# a comfortable context.
_BATCH_CHUNKS = 25
_MAX_CHUNKS   = 400        # refuse silently-enormous documents rather than bill for them
_MAX_CHARS    = 12_000     # per batch

_SYSTEM = (
    "You extract LOOKUP FACTS from customer-support documents — the specific "
    "values a customer asks for by name and a support agent must never guess.\n"
    "Return JSON: {\"facts\": [{\"subject\": str, \"label\": str, \"value\": str, "
    "\"note\": str}]}\n"
    "- subject: the product, plan or policy the fact is about, copied EXACTLY as "
    "written in the source. Never merge or normalise two similar names — "
    "'X MILES PRIME' and 'X PRIME' are different subjects.\n"
    "- label: the attribute name in Title Case, e.g. 'Annual Fee', 'Renewal Fee', "
    "'Coverage Limit'. Use the shortest natural name; do not repeat the subject "
    "inside the label.\n"
    "- value: the value including units/currency exactly as written.\n"
    "- note: any qualifying condition (waivers, eligibility, validity). \"\" if none.\n"
    "\n"
    "INCLUDE only quantitative or contractual specifics: fees, charges, rates, "
    "limits, caps, thresholds, durations, validity periods, eligibility ages and "
    "amounts.\n"
    "EXCLUDE marketing claims, feature descriptions, benefit lists and anything "
    "without a concrete value ('worldwide acceptance', 'insurance offerings', "
    "'accepted at millions of outlets').\n"
    "\n"
    "Extract only what is explicitly stated. Never infer or calculate. Prefer "
    "returning nothing over returning something vague — a short, precise list is "
    "the goal. If the text states no concrete values, return {\"facts\": []}."
)


def _select_chunks(chunks: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], str]:
    """Table rows if the document has them, otherwise everything. Returns (chunks, mode)."""
    rows = [c for c in chunks if (c.get("metadata") or {}).get("is_table_row")]
    if rows:
        return rows, "table_rows"
    # Skip the whole-table chunks when falling back: their rows are already
    # covered by the prose pass and re-reading a 20-row blob is what this
    # design exists to avoid.
    prose = [c for c in chunks if not (c.get("metadata") or {}).get("is_table")]
    return (prose or chunks), "prose"


def _batches(chunks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    out, cur, size = [], [], 0
    for c in chunks:
        text = c.get("document") or c.get("text") or ""
        if cur and (len(cur) >= _BATCH_CHUNKS or size + len(text) > _MAX_CHARS):
            out.append(cur)
            cur, size = [], 0
        cur.append(c)
        size += len(text)
    if cur:
        out.append(cur)
    return out


# Values that answer nothing. Observed in real output: the model would rather
# emit "Late Payment Fee: Not specified" than omit the row, and a fact whose
# value is "at the prevailing rate" is worse than no fact — it occupies prompt
# space and invites the agent to state a non-answer as if it were the figure.
# This is the same failure RAG_QUALITY_DIRECTIVES warns about, one layer earlier.
_NON_ANSWERS = (
    "not specified", "not mentioned", "not stated", "not applicable", "n/a",
    "as applicable", "as determined", "prevailing rate", "at prevailing",
    "varies", "refer to", "see terms", "as per terms", "unknown",
)


def _is_answer(value: str) -> bool:
    v = value.strip().lower()
    if len(v) < 2:
        return False
    return not any(bad in v for bad in _NON_ANSWERS)


def _parse(raw: str) -> List[Dict[str, str]]:
    """Tolerate a model that wraps its JSON in prose or a code fence."""
    if not raw:
        return []
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return []
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []
    facts = data.get("facts") if isinstance(data, dict) else None
    return [f for f in (facts or []) if isinstance(f, dict)]


async def extract_facts(
    space_id: str,
    doc_id:   str,
    known_topics: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Read an indexed document and propose facts. Writes nothing.

    Each returned dict carries provenance (source_doc_id / source_filename /
    source_page) taken from the chunk it came from, because facts are injected
    into the system prompt rather than retrieved and so never pass through
    `_citation_from_chunk` — they have to carry their own citation.

    `topic` is a *suggestion* only, filled in when the subject matches a topic
    slug already in use. It is never trusted: the caller stores every row
    unverified for a human to confirm.
    """
    from app.utils.slug import slugify

    chunks = get_vector_store().get_doc_chunks(space_id, doc_id)
    if not chunks:
        return []
    if len(chunks) > _MAX_CHUNKS:
        logger.info("facts.extract.truncated", doc_id=doc_id,
                    chunks=len(chunks), cap=_MAX_CHUNKS)
        chunks = chunks[:_MAX_CHUNKS]

    selected, mode = _select_chunks(chunks)
    logger.info("facts.extract.start", doc_id=doc_id, mode=mode, chunks=len(selected))

    providers = _providers()
    if not providers:
        raise RuntimeError("No LLM provider configured for fact extraction.")

    topic_by_slug = {slugify(t): t for t in (known_topics or [])}
    out: List[Dict[str, Any]] = []
    seen: set = set()

    for batch in _batches(selected):
        # Number the chunks so the model's output can be traced back to the page
        # it came from — provenance is the whole point of a fact over a guess.
        body = "\n\n".join(
            f"[{i}] {(c.get('document') or c.get('text') or '').strip()}"
            for i, c in enumerate(batch)
        )
        # No local retry: an exhausted quota or a bad key fails identically on
        # every batch, so a 57-page document would burn minutes of retries and
        # still return nothing. Fail loudly on the first batch that no provider
        # can serve — "0 facts found" and "you are out of credit" need
        # completely different actions from the user.
        content, providers = await _complete(providers, body)

        meta0 = (batch[0].get("metadata") or {})
        for f in _parse(content):
            subject = str(f.get("subject") or "").strip()
            label   = str(f.get("label") or "").strip()
            value   = str(f.get("value") or "").strip()
            if not (subject and label and value) or not _is_answer(value):
                continue
            key = (subject.lower(), label.lower())
            if key in seen:
                continue
            seen.add(key)

            # Attribute the fact to the chunk whose text actually contains its
            # value, so source_page points at the right page rather than the
            # first page of the batch.
            src = next(
                (c for c in batch if value in (c.get("document") or c.get("text") or "")),
                batch[0],
            )
            meta = (src.get("metadata") or meta0)
            out.append({
                "subject": subject[:200],
                "label":   label[:200],
                "value":   value,
                "note":    str(f.get("note") or "").strip() or None,
                "topic":   topic_by_slug.get(slugify(subject)),
                "source_doc_id":   doc_id,
                "source_filename": meta.get("filename") or meta.get("doc_name") or "",
                "source_page":     meta.get("page"),
            })

    logger.info("facts.extract.done", doc_id=doc_id, mode=mode, facts=len(out))
    return out
