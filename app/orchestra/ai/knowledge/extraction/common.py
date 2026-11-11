"""Shared extraction mechanics; callers retain prompts, grounding and review policy."""
from __future__ import annotations

import time

import structlog

from app.services.ai_usage import track_usage

logger = structlog.get_logger(__name__)


def batch_chunks(chunks, *, max_characters, max_chunks, text_of, split_oversized=False):
    if max_characters < 1 or max_chunks < 1:
        raise ValueError('Extraction batch budgets must be positive')
    batches, batch, size = [], [], 0
    for chunk in chunks:
        text = text_of(chunk)
        if split_oversized and len(text) > max_characters:
            if batch:
                batches.append(batch)
                batch, size = [], 0
            for start in range(0, len(text), max_characters):
                part = dict(chunk)
                part['metadata'] = {**chunk.get('metadata', {}),
                                    'source_text': text[start:start + max_characters]}
                batches.append([part])
            continue
        if batch and (size + len(text) > max_characters or len(batch) >= max_chunks):
            batches.append(batch)
            batch, size = [], 0
        batch.append(chunk)
        size += len(text)
    if batch:
        batches.append(batch)
    return batches


async def complete_extraction(providers, messages, *, max_tokens, timeout,
                              reasoning_tokens=False, require_complete=False, parse=None,
                              log_context=None):
    event_logger = logger.bind(**(log_context or {}))
    for index, (provider, client, model) in enumerate(providers):
        started = time.monotonic()
        response = None
        try:
            kwargs = dict(model=model, messages=messages, timeout=timeout,
                          response_format={'type': 'json_object'})
            if reasoning_tokens and any(name in model.lower() for name in ('gpt-5', 'o1', 'o3', 'o4')):
                kwargs['max_completion_tokens'] = max_tokens
            else:
                kwargs.update(temperature=0.0, max_tokens=max_tokens)
            response = await client.chat.completions.create(**kwargs)
            usage = getattr(response, 'usage', None)
            track_usage(kind='ingestion', provider=provider, model=model,
                        latency_ms=int((time.monotonic() - started) * 1000),
                        usage=usage)
            choice = response.choices[0]
            if require_complete and choice.finish_reason != 'stop':
                raise ValueError('Incomplete extraction response')
            raw = choice.message.content or ''
            result = parse(raw) if parse else raw
            event_logger.info('extraction.provider_succeeded', provider=provider, model=model,
                              elapsed_ms=int((time.monotonic() - started) * 1000))
            return result, providers[index:] + providers[:index]
        except Exception as error:
            if response is None:
                track_usage(kind='ingestion', provider=provider, model=model,
                            latency_ms=int((time.monotonic() - started) * 1000),
                            ok=False, error_type=type(error).__name__)
            event_logger.warning('extraction.provider_failed', provider=provider, model=model,
                                 error_type=type(error).__name__,
                                 elapsed_ms=int((time.monotonic() - started) * 1000),
                                 next_provider=providers[index + 1][0] if index + 1 < len(providers) else None)
    raise RuntimeError('Extraction providers unavailable or returned invalid output') from None
