"""Shared continuation metadata and bounded exact chunk retrieval with injected source policy."""
import asyncio
import json

import structlog

from app.orchestra.ai.ingestion import count_chunk_tokens

logger = structlog.get_logger()


async def select_records(context, query, pack, entities, *, config):
    """One similarity ranking/budget for already-authorized facts and card records."""
    from app.config import settings
    from app.orchestra.ai.embedding.service import similarity_scores

    records = [('fact', record) for record in pack.structured_facts] + [('card', record) for record in entities]
    texts, candidates = [], []
    for kind, record in records:
        cost = count_chunk_tokens(json.dumps(record, ensure_ascii=False))
        if cost > config.max_record_tokens:
            continue  # Keep facts whole; source chunks can supply longer evidence.
        fields = ('subject', 'label', 'value', 'organization', 'purpose', 'relationship') if kind == 'fact' else ('entity_type', 'title')
        texts.append(' '.join(str(record[key]) for key in fields if record.get(key)))
        candidates.append((kind, record, cost))
    try:
        scores = await similarity_scores(query, texts, scope_id=str(context.space_id),
                                         cache_seconds=config.embedding_cache_seconds,
                                         query_embedding=pack.query_embedding)
        order = sorted(range(len(candidates)), key=lambda index: scores[index], reverse=True)
    except Exception as error:
        logger.warning('knowledge.record_ranking_unavailable', space_id=str(context.space_id), error_type=type(error).__name__)
        pack.record_ranking_status = 'unavailable'
        order = range(len(candidates))
    facts, cards, tokens = [], [], 0
    for index in order:
        kind, record, cost = candidates[index]
        if len(facts) + len(cards) >= settings.RAG_TOP_K:
            break
        if tokens + cost <= config.max_record_tokens:
            (facts if kind == 'fact' else cards).append(record)
            tokens += cost
    pack.structured_facts = facts
    if not facts and not pack.passages and not pack.links:
        pack.sufficiency = 'missing'
    logger.info('knowledge.records_selected', space_id=str(context.space_id), facts=len(facts),
                cards=len(cards), tokens=tokens, ranking_status=pack.record_ranking_status)
    return cards


SEARCH_KNOWLEDGE_TOOL = {
    'type': 'function', 'function': {
        'name': 'search_space_knowledge',
        'description': 'Search the current Space when supplied evidence is missing or does not match the question. Resolve follow-ups using conversation history and supply a standalone search query before answering. One search per reply; only authorized evidence is returned.',
        'parameters': {
            'type': 'object', 'additionalProperties': False,
            'properties': {'query': {'type': 'string', 'minLength': 1, 'maxLength': 1000}},
            'required': ['query'],
        },
    },
}

EXPAND_CHUNKS_TOOL = {
    "type": "function",
    "function": {
        "name": "expand_chunk_context",
        "description": "Fetch advertised continuation IDs only if a retrieved fragment lacks evidence needed for this question. One expansion round only. Answer directly if evidence is sufficient; never search for an absent continuation.",
        "parameters": {
            "type": "object",
            "properties": {"continuation_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 4}},
            "required": ["continuation_ids"], "additionalProperties": False,
        },
    },
}


def _integer(meta, key):
    value = meta.get(key)
    return value if type(value) is int else None


def _linked(seed, target, direction, space):
    """Require reciprocal, adjacent fragments in the same published group."""
    keys = ("chunk_index", "group_index", "fragment_index", "fragment_count")
    if any(_integer(meta, key) is None for meta in (seed, target) for key in keys):
        return False
    step = -1 if direction == "previous" else 1
    reverse = "next" if step == -1 else "previous"
    return (
        all(str(meta.get("client_id", "")) == str(space) for meta in (seed, target))
        and bool(seed.get("doc_id")) and seed["doc_id"] == target.get("doc_id")
        and seed["group_index"] >= 0 and seed["group_index"] == target["group_index"]
        and seed["fragment_count"] == target["fragment_count"] > 1
        and 0 <= seed["fragment_index"] < seed["fragment_count"]
        and 0 <= target["fragment_index"] < target["fragment_count"]
        and target["fragment_index"] == seed["fragment_index"] + step
        and target["chunk_index"] == seed["chunk_index"] + step
        and seed.get(f"{direction}_chunk_index") == target["chunk_index"]
        and target.get(f"{reverse}_chunk_index") == seed["chunk_index"]
    )


def prepare_continuations(context, pack):
    """Advertise stored neighbor links without any database or backend reads."""
    pack.continuations = []
    seen = {(p["meta"].get("doc_id"), p["meta"].get("chunk_index")): p["meta"] for p in pack.passages}
    for number, passage in enumerate(pack.passages):
        meta = passage["meta"]
        passage["continuation"] = {"status": "unknown", "previous": None, "next": None}
        chunk_index = _integer(meta, "chunk_index")
        group_index = _integer(meta, "group_index")
        if (chunk_index is None or chunk_index < 0 or group_index is None or group_index < 0
                or not meta.get("doc_id") or str(meta.get("client_id", "")) != str(context.space_id)):
            continue
        passage["continuation"].update(chunk_index=chunk_index, group_index=group_index)
        count = _integer(meta, "fragment_count")
        fragment = _integer(meta, "fragment_index")
        if count == 1 and fragment == 0:
            passage["continuation"]["status"] = "standalone"
            continue
        if count is None or count < 2 or fragment is None or not 0 <= fragment < count:
            continue
        passage["continuation"].update(status="fragment", fragment_index=fragment, fragment_count=count)
        for direction in ("previous", "next"):
            index = _integer(meta, f"{direction}_chunk_index")
            step = -1 if direction == "previous" else 1
            if (index is None or index < 0 or index != chunk_index + step
                    or not 0 <= fragment + step < count):
                continue
            if (meta.get("doc_id"), index) in seen:
                if _linked(meta, seen[(meta.get("doc_id"), index)], direction, context.space_id):
                    passage["continuation"][direction] = "already_in_context"
                continue
            identifier = f"continuation_{number}_{direction}"
            pack.continuations.append({"id": identifier, "seed": dict(meta), "direction": direction, "chunk_index": index})
            passage["continuation"][direction] = identifier


# Storage/routing fields do not describe the source's content.
_INTERNAL_PASSAGE_METADATA = {
    'client_id', 'space_id', 'tenant_id', 'owner_user_id', 'user_id', 'session_id',
    'doc_id', 'kb_id', 'chunk_id', 'uploaded_at', 'expires_at', 'strategy',
    'tokenizer', 'token_count', 'previous_chunk_index', 'next_chunk_index',
}


def passage_context(passage, *, asset_visible=None):
    """Keep nonempty content metadata beside its passage; callers own asset disclosure."""
    from app.orchestra.ai.knowledge.retrieval.images_retrieval import safe_image_url

    meta = passage.get("meta") or {}
    structure = {key: meta[key] for key in (
        "block_type", "split_mode", "continues_previous", "continues_next",
        "table_id", "table_header_unknown", "repeated_header", "repeated_header_omitted",
        "row_start", "row_end", "row_boundary_source",
    ) if key in meta}
    metadata = {}
    for key, value in meta.items():
        if (key in _INTERNAL_PASSAGE_METADATA or key in structure
                or key.startswith(('_', 'chroma:'))):
            continue
        name = key
        if key.endswith('_json') and isinstance(value, str):
            try:
                value = json.loads(value)
                name = key[:-5]
            except (TypeError, ValueError):
                # Legacy malformed fields must not interrupt the whole reply.
                pass
        if name in _INTERNAL_PASSAGE_METADATA or name.startswith('_'):
            continue
        if name in ('links', 'images'):
            value = [asset for asset in value
                     if isinstance(asset, dict) and safe_image_url(asset.get('url'))
                     and (asset_visible is None or asset_visible(asset))] if isinstance(value, list) else []
        # Keep meaningful zero/False values, such as a price or a split flag.
        if value is not None and value != '' and value != [] and value != {}:
            metadata[name] = value
    return json.dumps({
        "content": passage["content"], "metadata": metadata, "structure": structure,
        "continuation": passage.get("continuation", {"status": "unknown", "previous": None, "next": None}),
    }, ensure_ascii=False)


async def expand_continuations(backend, context, pack, requested, *, config, load_sources,
                               format_passage=passage_context):
    """Fetch advertised chunks; load_sources must revalidate current source authorization."""
    result = {"passages": [], "status": "unavailable", "expansion_closed": True}
    if not config.chunks_enabled or not config.continuations_enabled:
        return result
    if not isinstance(requested, list) or not requested or len(requested) > 4 or any(not isinstance(key, str) for key in requested):
        result["status"] = "invalid_request"
        return result
    allowed = {entry["id"]: entry for entry in pack.continuations}
    # The allowlist is single-use even if this function is invoked again.
    pack.continuations = []
    if any(key not in allowed for key in requested):
        result["status"] = "invalid_request"
        return result
    _, sources = await load_sources(context, refresh=True)
    seen = {(p["meta"].get("doc_id"), p["meta"].get("chunk_index")) for p in pack.passages}
    # Cap complete evidence payloads, including metadata, in the ingestion tokenizer.
    budget = 0
    for key in dict.fromkeys(requested):
        entry = allowed[key]
        seed = entry["seed"]
        doc_id = seed.get("doc_id")
        identity = (doc_id, entry["chunk_index"])
        if doc_id not in sources or identity in seen:
            continue
        if len(result["passages"]) >= config.max_expansion_chunks:
            result["status"] = "budget_exhausted"
            break
        try:
            rows = await asyncio.to_thread(backend.read_chunks, str(context.space_id), doc_id, [entry["chunk_index"]])
            for row in rows:
                meta = row["metadata"]
                if not _linked(seed, meta, entry["direction"], context.space_id) or not row.get("text"):
                    continue
                source = sources[doc_id]
                passage = {"content": row["text"], "meta": {**meta, "title": source.title or meta.get("title"), "source_locator": source.source_locator}, "continuation": {"status": "expansion_closed", "previous": None, "next": None}}
                size = count_chunk_tokens(format_passage(passage))
                if budget + size > config.max_expansion_tokens:
                    result["status"] = "budget_exhausted"
                    continue
                budget += size
                seen.add(identity)
                result["passages"].append(passage)
                break
        except Exception as exc:
            logger.warning("knowledge.continuation_fetch_failed", space_id=str(context.space_id), error_type=type(exc).__name__)
            result["status"] = "retrieval_failed"
    if result["passages"] and result["status"] == "unavailable":
        result["status"] = "complete" if len(result["passages"]) == len(set(requested)) else "partial"
    logger.info("knowledge.continuation_expansion", space_id=str(context.space_id), requested_count=len(requested), returned_count=len(result["passages"]), status=result["status"])
    return result


async def retrieve_passages(backend, context, query, limit, sources_by_doc, pack):
    active_doc_ids = list(sources_by_doc)
    if not active_doc_ids:
        return 'empty'
    try:
        if backend.name() == 'null':
            return 'disabled'
        bundle = backend.for_agent(space_id=str(context.space_id), specific_doc_ids=active_doc_ids)
        if not bundle.has_knowledge:
            return 'unavailable'
        from app.config import settings
        reranker = getattr(getattr(bundle.knowledge, 'vector_db', None), 'reranker', None)
        limit = limit or (getattr(reranker, 'top_n', None) if reranker else None) or settings.RAG_TOP_K
        if limit < 1:
            raise ValueError('Retrieval limit must be positive')

        # Capture the query vector on the search worker for fact/card ranking.
        def search():
            docs = bundle.knowledge.search(query=query, filters=bundle.filters,
                                           max_results=max(limit, bundle.knowledge.max_results))
            vector_db = getattr(bundle.knowledge, 'vector_db', None)
            embedding = vector_db.last_query_embedding(query) if hasattr(vector_db, 'last_query_embedding') else None
            return docs, embedding

        docs, pack.query_embedding = await asyncio.to_thread(search)
        for doc in docs:
            meta = getattr(doc, "meta_data", {}) or {}
            # Defend against backends returning stale or incorrectly scoped hits.
            if meta.get('doc_id') not in active_doc_ids:
                continue
            if str(meta.get('client_id', meta.get('space_id', ''))) != str(context.space_id):
                continue
            source = sources_by_doc[meta['doc_id']]
            pack.passages.append({
                "content": doc.content,
                "meta": {**meta, "source_locator": getattr(source, "source_locator", None),
                         "title": source.title or meta.get("title")},
            })
            # Invalid/stale hits must not consume the requested top-N budget.
            if len(pack.passages) >= limit:
                break
        return 'success' if pack.passages else 'empty'
    except Exception as e:
        logger.error("knowledge.search_failed", error_type=type(e).__name__, space_id=str(context.space_id))
    return 'unavailable'


async def retrieve_evidence(context, query, limit=None, *, backend, load_sources, load_facts,
                            attach_assets, config, evidence_factory, refresh=False):
    """Assemble evidence once using injected product authorization and projection."""
    if limit is not None and (isinstance(limit, bool) or not isinstance(limit, int) or limit < 1):
        raise ValueError('Retrieval limit must be positive')
    pack = evidence_factory()
    if not config.chunks_enabled:
        pack.retrieval_status = 'disabled'
    kb_ids, sources_by_doc = await load_sources(context, refresh=True) if refresh else await load_sources(context)
    if not kb_ids:
        return pack
    if config.facts_enabled:
        pack.structured_facts.extend(await load_facts(context, kb_ids))
    if config.chunks_enabled:
        pack.retrieval_status = await retrieve_passages(backend, context, query, limit, sources_by_doc, pack)
        attach_assets(sources_by_doc, query, pack)
        if config.continuations_enabled:
            prepare_continuations(context, pack)
    pack.sufficiency = 'supported' if pack.structured_facts or pack.passages or pack.links else 'missing'
    return pack
