"""Prepared-response event streaming shared by product inference adapters."""
import asyncio
import json
import time
import structlog

from app.orchestra.ai.ui_render.source_images import ChatImagePresentation, validated_image_node


logger = structlog.get_logger()

async def stream_prepared_response(
    executor, message, *, cfg, messages, images, gallery_limit,
    pending_events, nodes, displayed_images, add_node, deferred, started,
    reset_buffer_on_event=None,
):
    """Stream text/UI events using request-local state shared with validated tools.

    Completion here means generation finished. The caller must persist the turn
    before forwarding message.done to its public client.
    """
    presentation = ChatImagePresentation(images)
    buffered, generated = '', ''
    success, error_type = False, None
    try:
        async for kind, value in executor.stream(message):
            if reset_buffer_on_event is not None and reset_buffer_on_event(kind, value):
                # The adapter decides which events invalidate buffered text.
                buffered = ''
            elif kind == 'content':
                if (deferred() if callable(deferred) else deferred):
                    buffered += value
                else:
                    visible = presentation.feed(value)
                    generated += visible
                    if visible:
                        yield json.dumps({'type': 'text.delta', 'delta': visible}) + '\n'
            while pending_events:
                yield json.dumps(pending_events.pop(0)) + '\n'
        visible = presentation.feed(buffered, final=True)
        generated += visible
        if visible:
            yield json.dumps({'type': 'text.delta', 'delta': visible}) + '\n'
        remaining = gallery_limit - len(displayed_images)
        allowed_images = {image['id'] for image in images}
        add_node(validated_image_node([key for key in presentation.image_ids
                                     if key not in displayed_images and key in allowed_images][:max(0, remaining)], images, max_images=gallery_limit))
        while pending_events:
            yield json.dumps(pending_events.pop(0)) + '\n'
        if not generated.strip() and not nodes:
            raise RuntimeError('Empty model response')

        success = True
    except Exception as error:
        error_type = type(error).__name__
        raise
    finally:
        from app.services.ai_usage import build_usage_event, estimate_tokens, record_usage_event
        output = executor.last_output
        metrics = getattr(output, 'metrics', None)
        usage = {'prompt_tokens': getattr(metrics, 'input_tokens', 0),
                 'completion_tokens': getattr(metrics, 'output_tokens', 0)}
        if metrics is None:
            usage = {'prompt_tokens': estimate_tokens(json.dumps(messages)),
                     'completion_tokens': estimate_tokens(generated)}
        event = build_usage_event(
            kind='chat', provider=(getattr(output, 'model_provider', None) or cfg.llm_provider).lower(),
            model=getattr(output, 'model', None) or cfg.llm_model, usage=usage,
            latency_ms=int((time.monotonic() - started) * 1000),
            estimated=metrics is None, ok=success, error_type=error_type,
        )
        asyncio.get_running_loop().create_task(record_usage_event(event))
    yield json.dumps({'type': 'message.done'}) + '\n'


async def generate_response(context, message, history, request_model=None, execution=None, *, prepare):
    """Execute a reply using evidence and tools injected by the product adapter."""
    if execution is None:
        raise RuntimeError('Prepared execution context is required')
    import uuid
    from app.orchestra.ai.inference.factory import build_prepared_executor

    prepared = await prepare(context, message, history)
    messages = prepared.pop('messages')
    tools = prepared.pop('tools')
    initial_events = prepared.pop('initial_events')
    message_id = str(uuid.uuid4())
    yield json.dumps({'type': 'message.start', 'messageId': message_id}) + '\n'

    cfg, native = execution['cfg'], execution['history']
    started = time.monotonic()
    executor = build_prepared_executor(
        space_id=context.space_id, session_id=native.session_id, cfg=cfg,
        messages=messages, tools=tools, history_db=native.db,
        user_id=native.user_id, run_id=message_id, model_override=request_model,
    )
    async for event in stream_prepared_response(
        executor, message, cfg=cfg, messages=messages, started=started, **prepared,
    ):
        payload = json.loads(event)
        if payload['type'] == 'citation.add':
            initial_events.append(payload)
            continue
        if payload['type'] == 'message.done':
            # Include search/continuation references after all answer text/UI.
            # The product adapter still persists them before forwarding done.
            for citation in initial_events:
                yield json.dumps(citation) + '\n'
        yield event


async def prepare_response(context, message, history, *, retrieve, expand, load_profile,
                           load_entities, compose, gallery_limit, select_records=None, allow_search=False,
                           format_passage=None):
    """Prepare one response from product callbacks; execute no product-specific queries."""
    from app.orchestra.ai.knowledge.base import prepare_retrieval_query
    from app.orchestra.ai.knowledge.retrieval.retrieve_chunks import passage_context
    from app.orchestra.ai.ui_render.response import prepare_response_tools

    profile = await load_profile(context)

    async def load_context(query, *, refresh=False):
        retrieved = await retrieve(context, query, **({'refresh': True} if refresh else {}))
        entities = await load_entities(context)
        if select_records is not None:
            entities = await select_records(context, query, retrieved, entities)
        return retrieved, entities

    # The existing Agent history resolves follow-ups through the same retrieval tool.
    query = message if allow_search else prepare_retrieval_query(message, [entry for entry in history if entry.role == 'user'])
    retrieved, entities = await load_context(query)
    prepared = prepare_response_tools(
        entities, retrieved, expand=lambda ids: expand(context, retrieved, ids),
        gallery_limit=gallery_limit,
        search=(lambda query: load_context(query, refresh=True)) if allow_search else None,
        format_passage=format_passage or passage_context,
    )
    tool_names = [tool.name for tool in prepared['tools']]
    logger.info('inference.context_prepared', space_id=str(context.space_id), tools=tool_names,
                passages=len(retrieved.passages), source_links=len(retrieved.links),
                images=len(retrieved.images), cards=len(entities), prompt_version='common-v3')
    prepared['messages'] = compose(profile, retrieved, entities, tool_names)
    return prepared
