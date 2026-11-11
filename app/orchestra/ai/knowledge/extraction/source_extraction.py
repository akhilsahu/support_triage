"""Shared source extraction; product prompts, limits and entity validation are injected."""
from __future__ import annotations

import asyncio
import json
import inspect
import time
from dataclasses import dataclass

import structlog

from app.core.llm_provider import get_async_openai_clients
from app.orchestra.ai.knowledge.vector_store import get_vector_store
from app.orchestra.ai.knowledge.extraction.common import batch_chunks, complete_extraction
from app.orchestra.ai.knowledge.extraction.facts.extractor import (
    FactExtractionResult, fact_key, validated_fact_candidates,
    _select_chunks, _source_text,
)

logger = structlog.get_logger(__name__)


@dataclass
class SourceKnowledgeResult:
    facts: FactExtractionResult | None
    entities: list | None
    fact_error: str | None = None
    entity_error: str | None = None


def _batches(chunks: list[dict], *, config) -> list[list[dict]]:
    return batch_chunks(chunks, max_characters=config["batch_characters"],
                        max_chunks=config["batch_chunks"],
                        text_of=_source_text, split_oversized=True)


async def _complete(body: str, space_name: str, *, config, providers=None, log_context=None) -> dict:
    entities_enabled = config['entities_enabled']
    prompt = config['prompt']
    def parse_output(raw):
        raw = raw.strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[-1].rsplit('```', 1)[0]
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError('Expected extraction object')
        return data

    if providers is None:
        providers = get_async_openai_clients(override_model=config["model"], max_retries=0)
    result, ordered_providers = await complete_extraction(
        providers,
        [{'role': 'system', 'content': prompt},
         {'role': 'user', 'content': f'Space identity: {space_name}\nFact extraction enabled: {config["facts_enabled"]}\nEntity extraction enabled: {entities_enabled}\nSource chunks:\n{body}'}],
        max_tokens=config["max_tokens"],
        timeout=config["timeout"],
        reasoning_tokens=True, require_complete=True, parse=parse_output,
        log_context=log_context,
    )
    # Keep the last successful provider first, retaining every fallback for this job.
    providers[:] = ordered_providers
    return result


def _validate_batch(data: dict, chunks: list[dict], doc_id: str, space_name: str = "", *, config) -> SourceKnowledgeResult:
    facts = FactExtractionResult()
    entities = []
    fact_error = entity_error = None
    seen = set()
    if not isinstance(data.get('facts'), list):
        fact_error = 'invalid_facts_response'
    else:
        for fact, raw, chunk, _ in validated_fact_candidates(
            data['facts'], chunks, seen=seen, diagnostics=facts.diagnostics,
        ):
            meta = chunk.get('metadata') or {}
            facts.append({**fact, 'topic': None, 'source_doc_id': doc_id,
                          'evidence_excerpt': str(raw.get('evidence_excerpt') or '').strip(),
                          'source_filename': meta.get('filename', ''),
                          'source_page': meta.get('page', chunk.get('page'))})
    if not isinstance(data.get('entities'), list):
        entity_error = 'invalid_entities_response'
    else:
        for raw in data['entities']:
            if not isinstance(raw, dict):
                continue
            index = raw.get('chunk_index')
            if type(index) is not int or not 0 <= index < len(chunks):
                continue
            chunk = chunks[index]
            candidate = config["validate_entity"](raw, _source_text(chunk), space_name=space_name)
            if candidate is None:
                continue
            meta = chunk.get('metadata') or {}
            for loc in candidate.evidence_locators:
                loc.update(source_chunk_id=chunk.get('id'), page=meta.get('page', chunk.get('page')),
                           section=meta.get('section', chunk.get('section')))
            entities.append(candidate)
    return SourceKnowledgeResult(None if fact_error else facts, None if entity_error else entities, fact_error, entity_error)


async def extract_source_knowledge(*, space_id: str, doc_id: str, space_name: str, config, progress_cb=None) -> SourceKnowledgeResult:
    facts_enabled = config['facts_enabled']
    entities_enabled = config['entities_enabled']
    if not facts_enabled and not entities_enabled:
        return SourceKnowledgeResult(None, None, 'disabled', 'disabled')
    chunks = await asyncio.to_thread(get_vector_store().get_doc_chunks, space_id, doc_id)
    if not chunks:
        raise RuntimeError('No indexed source chunks available')
    return await extract_chunk_knowledge(chunks=chunks, doc_id=doc_id, space_name=space_name,
                                         config=config, progress_cb=progress_cb)


async def extract_chunk_knowledge(*, chunks: list[dict], doc_id: str, space_name: str,
                                  config, progress_cb=None) -> SourceKnowledgeResult:
    """Extract all supplied source chunks without requiring a published vector index."""
    facts_enabled = config['facts_enabled']
    entities_enabled = config['entities_enabled']
    if not facts_enabled and not entities_enabled:
        return SourceKnowledgeResult(None, None, 'disabled', 'disabled')
    if not chunks:
        raise ValueError('No source chunks available')
    chunks, _ = _select_chunks(chunks)
    batches = _batches(chunks, config=config)
    started = time.monotonic()
    providers = get_async_openai_clients(override_model=config["model"], max_retries=0)
    extraction_logger = logger.bind(doc_id=doc_id, batches=len(batches))
    extraction_logger.info('knowledge.started', chunks=len(chunks), timeout_seconds=config['timeout'])
    facts, entities = FactExtractionResult(), []
    facts.diagnostics.update(chunks=len(chunks), batches=len(batches))
    fact_error = entity_error = None
    seen_facts, seen_entities = set(), {}
    for i, batch in enumerate(batches):
        batch_started = time.monotonic()
        context = dict(doc_id=doc_id, batch=i + 1, batches=len(batches))
        logger.info('knowledge.batch_started', **context, chunks=len(batch))
        if progress_cb:
            progress = progress_cb('understanding', i, len(batches))
            if inspect.isawaitable(progress):
                await progress
        body = '\n\n'.join(f'[{j}] page={(c.get("metadata") or {}).get("page", c.get("page"))} section={(c.get("metadata") or {}).get("section", c.get("section", ""))}\n{_source_text(c)}' for j, c in enumerate(batch))
        data = await _complete(body, space_name, config=config, providers=providers, log_context=context)
        # Disabled features never validate or persist unsolicited model output.
        if not facts_enabled:
            data = {**data, 'facts': []}
        if not entities_enabled:
            data = {**data, 'entities': []}
        result = _validate_batch(data, batch, doc_id, space_name, config=config)
        logger.info('knowledge.batch_completed', **context,
                    elapsed_ms=int((time.monotonic() - batch_started) * 1000),
                    facts=len(result.facts or []), entities=len(result.entities or []),
                    rejected_facts=result.facts.diagnostics['rejected'] if result.facts is not None else None,
                    fact_error=result.fact_error, entity_error=result.entity_error)
        fact_error = fact_error or result.fact_error
        entity_error = entity_error or result.entity_error
        if result.facts is not None:
            for key in ('candidates', 'rejected', 'duplicates'):
                facts.diagnostics[key] += result.facts.diagnostics[key]
            for fact in result.facts:
                key = fact_key(fact['subject'], fact['label'], fact['value'])
                if key not in seen_facts:
                    facts.append(fact)
                    seen_facts.add(key)
            facts.diagnostics['accepted'] = len(facts)
        if result.entities is not None:
            for entity in result.entities:
                key = (entity.entity_type, json.dumps(entity.payload_json, sort_keys=True))
                if key not in seen_entities:
                    entities.append(entity)
                    seen_entities[key] = entity
                else:
                    existing = seen_entities[key]
                    for locator in entity.evidence_locators:
                        if locator not in existing.evidence_locators:
                            existing.evidence_locators.append(locator)
    if progress_cb:
        progress = progress_cb('understanding', len(batches), len(batches))
        if inspect.isawaitable(progress):
            await progress
    extraction_logger.info('knowledge.extracted', chunks=len(chunks), facts=len(facts),
                           entities=len(entities), rejected_facts=facts.diagnostics['rejected'],
                           elapsed_ms=int((time.monotonic() - started) * 1000))
    if not facts_enabled:
        facts, fact_error = None, 'disabled'
    if not entities_enabled:
        entities, entity_error = None, 'disabled'
    return SourceKnowledgeResult(None if fact_error else facts, None if entity_error else entities, fact_error, entity_error)
