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

  * Format-agnostic. Table rows and prose are both read so mixed documents do
    not silently lose facts. Same endpoint and review flow for every format.
"""

from __future__ import annotations

from app.orchestra.ai.knowledge.extraction.common import batch_chunks, complete_extraction

import json
import re
from functools import lru_cache
from typing import Any, Callable, Dict, List, Optional

import structlog

from app.orchestra.ai.config import build_ingestion_config
from app.orchestra.ai.knowledge.vector_store import get_vector_store

logger = structlog.get_logger()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


@lru_cache(maxsize=1)
def _fact_config():
    """Resolve configurable extraction limits once per process."""
    return build_ingestion_config()


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
    return await complete_extraction(providers, [
        {'role': 'system', 'content': _SYSTEM},
        {'role': 'user', 'content': f'{body}\n\nExtract the facts as JSON.'},
    ], max_tokens=max(256, _fact_config().fact_max_output_tokens), timeout=60.0)

# Batching trades LLM round-trips against the risk of a long input degrading
# extraction. Rows are short, so a reasonably large batch is still well inside
# a comfortable context.
_SYSTEM = (
    "You extract LOOKUP FACTS from documents — the specific "
    "values a user asks for by name and a system must never guess.\n"
    "Return JSON: {\"facts\": [{\"subject\": str, \"label\": str, \"value\": str, "
    "\"note\": str, \"chunk_index\": int, \"evidence_excerpt\": str}]}\n"
    "- subject: the product, person, location, policy, or entity the fact is about, copied EXACTLY as "
    "written in the source. Never merge or normalise two similar names — "
    "'X MILES PRIME' and 'X PRIME' are different subjects.\n"
    "- label: the attribute name in Title Case, e.g. 'Annual Fee', 'Role', 'Email', "
    "'Location'. Use the shortest natural name; do not repeat the subject "
    "inside the label.\n"
    "- value: the value exactly as written.\n"
    "- note: any qualifying condition. \"\" if none.\n"
    "- chunk_index: the integer [N] prefixed to the chunk where this fact was found.\n"
    "- evidence_excerpt: REQUIRED. Copy the smallest verbatim source passage that contains both "
    "the value and, whenever present in that passage, the subject. For a table, copy only the atomic row containing the subject, attribute, "
    "and value; never cite the whole table.\n"
    "\n"
    "INCLUDE specific attributes about:\n"
    "1. Yullo Offerings & Portfolio Items (features, tiers, capabilities)\n"
    "2. People & Contacts (roles, emails, phones, social links)\n"
    "3. Locations (addresses, coordinates, regions)\n"
    "4. Events & Actions (dates, deadlines, milestones)\n"
    "5. Quantitative/Contractual specs (fees, rates, limits, validities)\n"
    "\n"
    "ALSO INCLUDE explicit descriptive facts in prose: what a named organisation does, "
    "what its named products are, what systems carry or provide, destinations, uses, "
    "and explicitly stated historical milestones. Facts need not contain numbers. "
    "For example, a named spacecraft carrying crew and cargo is a Capability fact. "
    "Split distinct supported attributes into separate facts.\n"
    "For prose, evidence may span adjacent sentences or a heading plus paragraph "
    "within the SAME chunk. If the subject appears separately, return an additional "
    "subject_evidence_excerpt copied verbatim from that same chunk. It must contain "
    "the subject; evidence_excerpt must contain the value. Never use another chunk "
    "to infer ownership, and never bind values from different table rows.\n"
    "EXCLUDE unsupported superlatives, generic marketing claims and vague benefit lists.\n"
    "\n"
    "Inspect every supplied chunk and return every distinct eligible fact; do not "
    "arbitrarily limit the number of facts. Keep each fact atomic and precise. "
    "Extract only what is explicitly stated. Never infer or calculate. Prefer "
    "returning nothing over returning something vague. If the text states no "
    "concrete values, return {\"facts\": []}."
)


def _select_chunks(chunks: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], str]:
    """Return table rows AND prose chunks. Both must be extracted for mixed documents.

    Previously this returned table rows OR prose — mixed documents (with both tables
    and prose) lost all prose facts because table rows were found first. Now both
    are returned, deduplicated by chunk id, so no facts are silently dropped.
    """
    rows = [c for c in chunks if (c.get("metadata") or {}).get("is_table_row")]

    def table_key(chunk):
        meta = chunk.get("metadata") or {}
        if not meta.get("table_id") or not meta.get("doc_id"):
            return None
        return (meta.get("client_id", meta.get("space_id")), meta["doc_id"], meta["table_id"])

    covered_tables = {key for row in rows if (key := table_key(row)) is not None}
    # Skip a whole table only when lookup chunks cover that exact source table.
    # Single-row tables and legacy/unknown identities still need extraction.
    prose = [c for c in chunks if not (c.get("metadata") or {}).get("is_table_row")
             and (not (c.get("metadata") or {}).get("is_table")
                  or table_key(c) not in covered_tables)]

    if rows and prose:
        # Deduplicate by chunk id in case any overlap
        seen_ids: set = set()
        combined = []
        for c in rows + prose:
            cid = c.get("id") or c.get("chunk_id") or id(c)
            if cid not in seen_ids:
                seen_ids.add(cid)
                combined.append(c)
        return combined, "mixed"

    if rows:
        return rows, "table_rows"
    return (prose or chunks), "prose"


def _batches(chunks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    cfg = _fact_config()
    return batch_chunks(chunks, max_chunks=max(1, cfg.fact_batch_chunks),
                        max_characters=max(1_000, cfg.fact_batch_characters),
                        text_of=lambda chunk: chunk.get('document') or chunk.get('text') or '')


def _source_text(chunk: Dict[str, Any]) -> str:
    """Return source-authored text, excluding any generated enrichment prefix."""
    meta = chunk.get("metadata") or {}
    return str(
        meta.get("source_text")
        or chunk.get("document")
        or chunk.get("text")
        or ""
    )


def _normalise_evidence(value: str) -> str:
    """Normalise formatting noise while preserving the words and numbers."""
    return " ".join(re.findall(r"[a-z0-9]+", (value or "").lower()))


def _has_precise_evidence(
    *,
    subject: str,
    label: str,
    value: str,
    evidence: str,
    chunk: Dict[str, Any],
    subject_evidence: str = "",
) -> bool:
    """Require the cited passage to prove this exact subject/value binding."""
    source_norm = _normalise_evidence(_source_text(chunk))
    evidence_norm = _normalise_evidence(evidence)
    subject_norm = _normalise_evidence(subject)
    value_norm = _normalise_evidence(value)
    label_norm = _normalise_evidence(label)
    if not evidence_norm or evidence_norm not in source_norm:
        return False
    if not subject_norm or not value_norm or value_norm not in evidence_norm:
        return False
    if subject_norm not in evidence_norm:
        # A prose heading may identify the subject separately from its paragraph.
        # Both quotes must exist in the same original chunk; table rows stay strict.
        subject_evidence_norm = _normalise_evidence(subject_evidence)
        if ((chunk.get("metadata") or {}).get("is_table_row")
            or not subject_evidence_norm
            or subject_evidence_norm not in source_norm
            or subject_norm not in subject_evidence_norm):
            return False
    # Reconstructed table-row chunks contain an explicit attribute cell. Its
    # presence prevents a correct subject/value pair from being assigned the
    # wrong label.
    if (chunk.get("metadata") or {}).get("is_table_row") and label_norm not in evidence_norm:
        return False
    return True


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
        raise ValueError("Empty fact extraction response")
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Fact extraction response is not JSON")
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError("Malformed fact extraction JSON") from exc
    facts = data.get("facts") if isinstance(data, dict) else None
    if not isinstance(facts, list) or any(not isinstance(f, dict) for f in facts):
        raise ValueError("Fact extraction response must contain a facts array")
    return facts


def fact_key(subject: str, label: str, value: str, *, normalize=str.casefold) -> tuple[str, str, str]:
    """Keep distinct values; let existing callers retain their case normalization."""
    return normalize(subject), normalize(label), normalize(value)


class FactExtractionResult(list):
    """List-compatible result with aggregate diagnostics; no source text in logs."""
    def __init__(self):
        super().__init__()
        self.diagnostics = {"chunks": 0, "batches": 0, "candidates": 0,
                            "rejected": 0, "duplicates": 0, "accepted": 0}


def validated_fact_candidates(candidates, chunks, *, seen, diagnostics,
                              normalize=str.casefold, duplicates_first=False):
    """One grounded fact boundary; callers retain their provenance projection."""
    for raw in candidates:
        diagnostics['candidates'] += 1
        if not isinstance(raw, dict):
            diagnostics['rejected'] += 1
            continue
        subject, label, value = (str(raw.get(k) or '').strip() for k in ('subject', 'label', 'value'))
        if not subject or not label or not _is_answer(value):
            diagnostics['rejected'] += 1
            continue
        key = fact_key(subject, label, value, normalize=normalize)
        if duplicates_first and key in seen:
            diagnostics['duplicates'] += 1
            continue
        index = raw.get('chunk_index')
        if type(index) is not int or not 0 <= index < len(chunks):
            diagnostics['rejected'] += 1
            logger.info('facts.extract.rejected_missing_chunk')
            continue
        chunk = chunks[index]
        if not _has_precise_evidence(
            subject=subject, label=label, value=value,
            evidence=str(raw.get('evidence_excerpt') or ''), chunk=chunk,
            subject_evidence=str(raw.get('subject_evidence_excerpt') or ''),
        ):
            diagnostics['rejected'] += 1
            logger.info('facts.extract.rejected_imprecise_evidence')
            continue
        if not duplicates_first and key in seen:
            diagnostics['duplicates'] += 1
            continue
        seen.add(key)
        diagnostics['accepted'] += 1
        yield dict(subject=subject[:200], label=label[:200], value=value,
                   note=str(raw.get('note') or '').strip() or None,
                   source_chunk_id=chunk.get('id', '')), raw, chunk, subject


async def extract_facts(
    space_id: str,
    doc_id:   str,
    known_topics: Optional[List[str]] = None,
    progress_cb: Optional[Callable[[str, int, int], None]] = None
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
        raise RuntimeError("No indexed chunks available for fact extraction")

    selected, mode = _select_chunks(chunks)
    logger.info("facts.extract.start", doc_id=doc_id, mode=mode, chunks=len(selected))

    providers = _providers()
    if not providers:
        raise RuntimeError("No LLM provider configured for fact extraction.")

    topic_by_slug = {slugify(t): t for t in (known_topics or [])}
    out = FactExtractionResult()
    out.diagnostics["chunks"] = len(selected)
    seen: set = set()

    batches = _batches(selected)
    total_batches = len(batches)
    out.diagnostics["batches"] = total_batches
    for idx, batch in enumerate(batches):
        if progress_cb:
            progress_cb("facts", idx, total_batches)

        # Number the chunks so the model's output can be traced back to the page
        # it came from — provenance is the whole point of a fact over a guess.
        body = "\n\n".join(
            f"[{i}] {_source_text(c).strip()}"
            for i, c in enumerate(batch)
        )
        # No local retry: an exhausted quota or a bad key fails identically on
        # every batch, so a 57-page document would burn minutes of retries and
        # still return nothing. Fail loudly on the first batch that no provider
        # can serve — "0 facts found" and "you are out of credit" need
        # completely different actions from the user.
        content, providers = await _complete(providers, body)

        meta0 = (batch[0].get("metadata") or {})
        for fact, raw, src, subject in validated_fact_candidates(
            _parse(content), batch, seen=seen, diagnostics=out.diagnostics,
            normalize=str.lower, duplicates_first=True,
        ):
            meta = src.get('metadata') or meta0
            out.append({**fact, 'topic': topic_by_slug.get(slugify(subject)),
                        'source_doc_id': doc_id,
                        'source_filename': meta.get('filename') or meta.get('doc_name') or '',
                        'source_page': meta.get('page')})

    if progress_cb:
        progress_cb("facts", total_batches, total_batches)

    logger.info("facts.extract.done", doc_id=doc_id, mode=mode, **out.diagnostics)
    return out
