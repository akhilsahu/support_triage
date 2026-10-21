from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import settings
from app.core.llm_provider import get_async_openai_clients

logger = logging.getLogger(__name__)

from app.yullo.prompts.entities import ENTITY_EXTRACTION_SYSTEM_PROMPT as _SYSTEM_PROMPT


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return {}
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _batches(source_text: str) -> list[str]:
    # Use a conservative 4,500 char limit to guarantee 8B models (e.g. on Modal) stay within context & timeout budgets
    configured_limit = getattr(settings, "YULLO_ENTITY_EXTRACTION_BATCH_CHARACTERS", 4500)
    limit = min(max(1000, configured_limit), 5000)
    source = source_text[: settings.YULLO_ENTITY_EXTRACTION_MAX_SOURCE_CHARACTERS]
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", source) if p.strip()]
    batches: list[str] = []
    current = ""
    for paragraph in paragraphs or [source]:
        if current and len(current) + len(paragraph) + 2 > limit:
            batches.append(current)
            current = ""
        if len(paragraph) > limit:
            if current:
                batches.append(current)
                current = ""
            batches.extend(paragraph[i : i + limit] for i in range(0, len(paragraph), limit))
        else:
            current = f"{current}\n\n{paragraph}".strip()
    if current:
        batches.append(current)
    return batches


class LLMEntityExtractionProvider:
    """Config-driven provider that returns untrusted, review-only candidates."""

    async def extract(self, *, source_text: str, allowed_types: list[str]) -> list[dict]:
        if not settings.YULLO_ENTITY_EXTRACTION_ENABLED:
            return []

        providers = get_async_openai_clients(
            override_model=settings.YULLO_ENTITY_EXTRACTION_MODEL
        )
        if not providers:
            raise RuntimeError("No LLM provider configured for entity extraction")

        candidates: list[dict] = []
        batch_list = _batches(source_text)
        active_provider_idx = 0

        for batch_index, batch in enumerate(batch_list):
            last_error: Exception | None = None
            # Start attempting from the active working provider (sticky fallback)
            for provider_idx in range(active_provider_idx, len(providers)):
                provider_name, client, model_name = providers[provider_idx]
                try:
                    kwargs: dict[str, Any] = {
                        "model": model_name,
                        "messages": [
                            {"role": "system", "content": _SYSTEM_PROMPT},
                            {"role": "user", "content": batch},
                        ],
                        "response_format": {"type": "json_object"},
                        "timeout": settings.YULLO_ENTITY_EXTRACTION_TIMEOUT_SECONDS,
                    }
                    if any(token in model_name.lower() for token in ("gpt-5", "o1", "o3", "o4")):
                        kwargs["max_completion_tokens"] = 2500
                    else:
                        kwargs.update(temperature=0.0, max_tokens=2500)
                    response = await client.chat.completions.create(**kwargs)
                    body = _parse_json_object(response.choices[0].message.content or "")
                    for candidate in body.get("entities", []):
                        if isinstance(candidate, dict) and candidate.get("entity_type") in allowed_types:
                            candidate["_source_batch"] = batch_index
                            candidates.append(candidate)

                    # If we fell back to a new provider and it succeeded, lock onto it for remaining batches
                    if provider_idx != active_provider_idx:
                        logger.info(
                            "yullo.entity_extraction.fallback_locked provider=%s model=%s batch=%d/%d (retained for remaining batches)",
                            provider_name,
                            model_name,
                            batch_index + 1,
                            len(batch_list),
                        )
                        active_provider_idx = provider_idx

                    last_error = None
                    break
                except Exception as exc:  # try configured fallback provider
                    last_error = exc
                    error_msg = getattr(exc, "message", None) or str(exc)
                    if hasattr(exc, "response") and hasattr(exc.response, "text"):
                        error_msg = f"{error_msg} | response: {exc.response.text}"
                    next_target = providers[provider_idx + 1][0] if provider_idx + 1 < len(providers) else "none"
                    logger.warning(
                        "yullo.entity_extraction.provider_failed provider=%s model=%s batch=%d/%d len=%d error=%s message=%s -> falling back to %s",
                        provider_name,
                        model_name,
                        batch_index + 1,
                        len(batch_list),
                        len(batch),
                        type(exc).__name__,
                        error_msg[:300],
                        next_target,
                    )
            if last_error is not None:
                logger.error(
                    "yullo.entity_extraction.all_providers_failed batch=%d/%d len=%d error=%s",
                    batch_index + 1,
                    len(batch_list),
                    len(batch),
                    last_error,
                    exc_info=True,
                )
                raise RuntimeError(f"All entity extraction providers failed for batch {batch_index + 1}: {last_error}") from last_error
        return candidates
