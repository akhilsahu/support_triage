"""Request-local citation events and validated response tools from authorized evidence."""
import asyncio
import json
import structlog

from app.orchestra.ai.ui_render.entity_cards import SHOW_UI_CARD_TOOL, build_validated_ui_node
from app.orchestra.ai.ui_render.source_images import SHOW_SOURCE_IMAGES_TOOL, validated_image_node
from app.orchestra.ai.knowledge.retrieval.retrieve_chunks import EXPAND_CHUNKS_TOOL, SEARCH_KNOWLEDGE_TOOL, passage_context

logger = structlog.get_logger()


def prepare_response_tools(available_entities, retrieved, *, expand, gallery_limit, search=None,
                           format_passage=passage_context, references=None):
    """Build UI/continuation callbacks; callers own authorization of the supplied evidence."""
    from agno.tools.function import Function
    tools = ([SHOW_UI_CARD_TOOL] if available_entities or search else []) + (
        [SHOW_SOURCE_IMAGES_TOOL] if retrieved.images or search else []
    )
    if retrieved.continuations or search:
        tools.append(EXPAND_CHUNKS_TOOL)
    if search:
        tools.append(SEARCH_KNOWLEDGE_TOOL)
    cited = {'fact': set(), 'pass': set()}

    def citations(pack):
        events = []
        for kind, records in (('fact', pack.structured_facts), ('pass', pack.passages)):
            for record in records:
                meta = record.get('meta') or {}
                identity = record if kind == 'fact' else (meta.get('doc_id'), meta.get('chunk_index'), record['content'])
                key = json.dumps(identity, sort_keys=True, default=str)
                if key in cited[kind]:
                    continue
                identifier = f'{kind}_{len(cited[kind])}'
                cited[kind].add(key)
                if kind == 'fact':
                    payload = {'id': identifier, 'label': record['subject'], 'snippet': record['value']}
                else:
                    source_url = meta.get('source_locator') or meta.get('url')
                    payload = {'id': identifier, 'label': meta.get('title') or source_url or 'Document',
                               'snippet': record['content'][:100]}
                    if source_url:
                        payload['sourceUrl'] = source_url
                events.append({'type': 'citation.add', 'citation': payload})
        return events

    initial_events = citations(retrieved)
    pending_events, nodes = ([], set())
    displayed_images = set()
    expansion_used = False
    search_used = False
    retrieval_lock = asyncio.Lock()

    def add_node(node):
        if not node:
            return {"status": "rejected"}
        key = json.dumps(node, sort_keys=True)
        if key not in nodes:
            nodes.add(key)
            displayed_images.update(node.get("imageIds", []))
            pending_events.append({"type": "ui.add", "node": node})
        return {"status": "displayed"}

    async def show_ui_card(card_type: str, entity_ids: list[str]):
        return add_node(build_validated_ui_node(card_type, entity_ids, available_entities))



    async def show_source_images(image_ids: list[str]):
        if references is not None and isinstance(image_ids, list):
            image_ids = [references.image_id(identifier) for identifier in image_ids]
        return add_node(validated_image_node(image_ids, retrieved.images, max_images=gallery_limit))

    async def expand_chunk_context(continuation_ids: list[str]):
        nonlocal expansion_used
        # Both retrieval tools share the request's DB session; serialize their reads.
        async with retrieval_lock:
            if expansion_used:
                return {"status": "expansion_closed", "passages": [], "expansion_closed": True}
            expansion_used = True
            try:
                result = await expand(continuation_ids)
            except Exception as error:
                logger.warning("ui.expansion_failed", error_type=type(error).__name__)
                return {"status": "retrieval_failed", "passages": [], "expansion_closed": True}
            for passage in result["passages"]:
                retrieved.passages.append(passage)
            pending_events.extend(citations(retrieved))
            return {**result, "passages": [json.loads(format_passage(p)) for p in result["passages"]]}

    async def search_space_knowledge(query: str):
        nonlocal search_used
        if not isinstance(query, str) or not query.strip() or len(query) > 1000:
            return {'status': 'invalid_query'}
        async with retrieval_lock:
            if search_used:
                return {'status': 'search_closed'}
            search_used = True
            try:
                result, entities = await search(query)
            except Exception as error:
                logger.warning('knowledge.followup_search_unavailable', error_type=type(error).__name__)
                return {'status': 'unavailable', 'instruction': 'Continue using the authorized evidence already available. Explain uncertainty for details you cannot verify.'}
            available_entities[:] = entities
            # Keep shared list identities so streaming/image tools see refreshed evidence.
            for field in ('structured_facts', 'passages', 'images', 'links', 'continuations'):
                getattr(retrieved, field)[:] = getattr(result, field)
            retrieved.retrieval_status = result.retrieval_status
            retrieved.record_ranking_status = result.record_ranking_status
            retrieved.sufficiency = result.sufficiency
            retrieved.query_embedding = result.query_embedding
            if expansion_used:
                retrieved.continuations.clear()
                for passage in retrieved.passages:
                    passage['continuation'] = {'status': 'expansion_closed', 'previous': None, 'next': None}
            pending_events.extend(citations(retrieved))
            payload = {
                'status': retrieved.retrieval_status,
                'facts': retrieved.structured_facts,
                'passages': [json.loads(format_passage(p)) for p in retrieved.passages],
                'links': retrieved.links,
                'entities': available_entities,
                'images': [{key: image[key] for key in ('id', 'caption', 'sourceTitle')} for image in retrieved.images],
                'instruction': 'Answer using supporting authorized evidence. If a requested detail is unsupported, explain what you cannot verify and offer a useful next step.',
            }
            return references.compact(payload) if references is not None else payload

    handlers = {
        "show_ui_card": show_ui_card,
        "show_source_images": show_source_images,
        "expand_chunk_context": expand_chunk_context,
        "search_space_knowledge": search_space_knowledge,
    }
    functions = [
        Function(
            **tool["function"],
            entrypoint=handlers[tool["function"]["name"]],
            skip_entrypoint_processing=True,
        )
        for tool in tools
    ]

    def reset_buffer_on_event(kind, value):
        return kind == "tool.start" and getattr(value, "tool_name", None) in ('expand_chunk_context', 'search_space_knowledge')

    return dict(
        tools=functions, initial_events=initial_events, images=retrieved.images,
        gallery_limit=gallery_limit, pending_events=pending_events, nodes=nodes,
        displayed_images=displayed_images, add_node=add_node,
        deferred=lambda: bool(retrieved.continuations), reset_buffer_on_event=reset_buffer_on_event,
        references=references,
    )
