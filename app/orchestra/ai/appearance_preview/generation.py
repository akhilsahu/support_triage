"""Appearance preview generation from injected, authorized product evidence.

No database reads or publication writes. Callers supply schemas, prompt and
support rules; canonical provider utility preserves configured priority.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from app.core.llm_provider import get_async_openai_clients

logger = logging.getLogger(__name__)


@dataclass
class PreviewGenerationContext:
    space_name: str
    space_purpose: str
    space_category: str | None
    space_description: str | None
    has_logo: bool
    entities: list[dict]


def build_preview_fingerprint(context: PreviewGenerationContext, *, prompt_version: str = "v1") -> str:
    fingerprint_data = {
        "identity": {
            "name": context.space_name,
            "purpose": context.space_purpose,
            "category": context.space_category,
            "description": context.space_description,
            "has_logo": context.has_logo,
        },
        "entities": [{"id": e["id"], "rev": e["revision"]} for e in context.entities],
        "prompt_version": prompt_version,
    }
    dumped = json.dumps(fingerprint_data, sort_keys=True)
    return hashlib.sha256(dumped.encode("utf-8")).hexdigest()


def build_deterministic_preview_response(
    entities: list[dict], *, fingerprint: str, policy
) -> Any:
    """Build a safe preview when the optional LLM provider cannot respond."""
    content = policy["build_content"](entities)
    if not content.sections:
        return None
    grounded_ids = sorted(
        {
            item.source_entity_id
            for section in content.sections
            for item in section.items
            if item.source_entity_id
        }
    )
    return policy["response_model"](
        status=policy["status"].ready,
        content=content,
        explanation=f"Built from {len(grounded_ids)} confirmed details",
        groundedEntityIds=grounded_ids,
        inputFingerprint=fingerprint,
    )


async def generate_preview(
    context: PreviewGenerationContext, *, space_id: UUID, request,
    config, facts: list[dict], policy, passages=None, existing_sections=None,
) -> Any:
    """Generate from authorized evidence; caller supplies schema and grounding policy."""
    fingerprint = build_preview_fingerprint(context, prompt_version=config.preview_prompt_version)
    passages = list(passages or [])
    existing_sections = existing_sections or []
    fingerprint = hashlib.sha256((fingerprint + json.dumps({
        'facts': facts, 'passages': passages, 'existingSections': existing_sections,
        'requestedSection': request.section_type,
    }, sort_keys=True)).encode()).hexdigest()
    if request.section_type:
        supported = policy["build_content"](context.entities)
        section_ids = {
            item.source_entity_id
            for section in supported.sections if section.type == request.section_type
            for item in section.items
        }
        context.entities = [entity for entity in context.entities if entity["id"] in section_ids]

    if not config.preview_generation_enabled:
        return policy["response_model"](
            status=policy["status"].unavailable,
            explanation="AI section building is currently unavailable. Your preview is unchanged.",
            inputFingerprint=fingerprint,
        )

    section_label = request.section_type.value.replace('_', ' ') if request.section_type else "this section"
    missing_details = f"Add or confirm details for {section_label} in Knowledge, then build again."
    if not (context.entities or facts or passages):
        return policy["response_model"](
            status=policy["status"].insufficient_context,
            content=None,
            explanation=missing_details,
            groundedEntityIds=[],
            inputFingerprint=fingerprint,
        )

    # Prepare prompt DTOs
    prompt_payload = {
        "space": {
            "name": context.space_name,
            "purpose": context.space_purpose,
            "category": context.space_category,
            "description": context.space_description,
            "hasLogo": context.has_logo,
        },
        "entities": list(context.entities),
        "facts": list(facts),
        "passages": passages,
        "existingSections": existing_sections,
    }
    if request.section_type:
        prompt_payload["requestedSection"] = request.section_type.value
        prompt_payload["instruction"] = (
            "Decide which supplied details to display in this section. Write its heading "
            "and concise item titles and descriptions. Return only the requested section. "
            "Use relevant confirmed facts and retrieved source passages even when no structured offering exists. "
            "Every item must have source='grounded'. For entity-backed items preserve sourceEntityId; "
            "for fact-backed items use sourceFactIds listing the supplied fact UUIDs and leave sourceEntityId null. "
            "For passage-backed items copy the supplied reference objects into sourceChunks; "
            "do not invent entity or fact IDs. Existing sections are exclusions, not source evidence. "
            "Find additional information instead of repeating their items. "
            "Do not infer current commercial availability from a future plan, specification or ambition. "
            "If no distinct evidence supports the requested section, return an empty sections array."
        )
    # Keep every existing item title for exclusion, trimming summaries before evidence.
    prompt_json = json.dumps(prompt_payload, separators=(",", ":"))
    if len(prompt_json) > config.preview_max_context_characters:
        for section in prompt_payload['existingSections']:
            for item in section['items']:
                item.pop('description', None)
        prompt_json = json.dumps(prompt_payload, separators=(",", ":"))
    # Enforce the existing context budget across all evidence kinds.
    while len(prompt_json) > config.preview_max_context_characters and any(prompt_payload[key] for key in ('entities', 'facts', 'passages')):
        # Retain a mix of evidence where the configured budget permits.
        evidence = max((prompt_payload[key] for key in ('entities', 'facts', 'passages')),
                       key=lambda values: len(json.dumps(values)))
        # Keep at least one passage when it fits alongside the exclusion context.
        if evidence is prompt_payload['passages'] and len(evidence) == 1 and len(evidence[0]['content']) > 512:
            evidence[0] = {**evidence[0], 'content': evidence[0]['content'][:512], 'isExcerpt': True}
        else:
            evidence.pop()
        prompt_json = json.dumps(prompt_payload, separators=(",", ":"))
    allowed_ids = {entity["id"] for entity in prompt_payload["entities"]}
    allowed_fact_ids = {fact["id"] for fact in prompt_payload["facts"]}
    chunk_key = policy.get('chunk_key')
    allowed_chunks = {chunk_key(passage['reference']) for passage in prompt_payload['passages']} if chunk_key else set()
    if len(prompt_json) > config.preview_max_context_characters or not (allowed_ids or allowed_fact_ids or allowed_chunks):
        return policy["response_model"](
            status=policy["status"].unavailable,
            content=None,
            explanation="Could not prepare this section from the available details. Your preview is unchanged.",
            groundedEntityIds=[],
            inputFingerprint=fingerprint,
        )

    # An owner-requested rebuild must be immediate and dependable. Recompose the
    # preview from the latest confirmed public entities without relying on an LLM.
    if request.force and not request.section_type:
        forced_preview = build_deterministic_preview_response(
            prompt_payload["entities"], fingerprint=fingerprint, policy=policy
        )
        if forced_preview:
            return forced_preview

    clients = get_async_openai_clients(
        override_model=config.preview_model,
        timeout=config.preview_timeout_seconds,
        max_retries=0,
    )

    if not clients:
        fallback = build_deterministic_preview_response(
            prompt_payload["entities"], fingerprint=fingerprint, policy=policy
        )
        if fallback and not request.section_type:
            return fallback
        return policy["response_model"](
            status=policy["status"].unavailable,
            content=None,
            explanation="Could not rebuild the preview. Your current preview is unchanged.",
            groundedEntityIds=[],
            inputFingerprint=fingerprint,
        )

    start_time = time.monotonic()

    for provider_name, client, model in clients:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": policy["system_prompt"] + "\nOutput JSON schema:\n" + json.dumps(policy["content_model"].model_json_schema(by_alias=True))},
                    {"role": "user", "content": prompt_json},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=1500,
            )

            content_str = response.choices[0].message.content or "{}"
            # Validate JSON matching schema
            content = policy["content_model"].model_validate_json(content_str)

            # Post validation
            used_ids = set()
            used_fact_ids: set[UUID] = set()
            validated_sections = []
            validated_items_so_far = []
            duplicates_skipped = 0

            for section in content.sections:
                if request.section_type and section.type != request.section_type:
                    raise ValueError("Provider returned an unrequested section")
                validated_items = []
                for idx, item in enumerate(section.items[:config.preview_max_items_per_section]):
                    if policy.get('require_grounded') and item.source != 'grounded':
                        raise ValueError('Generated items must cite supplied evidence')
                    support_args = (allowed_ids, allowed_fact_ids)
                    if getattr(item, 'source_chunks', []):
                        support_args += (allowed_chunks,)
                    if not policy["item_supported"](item, *support_args):
                        raise ValueError("Provider returned unsupported source references")
                    is_duplicate = policy.get('item_is_duplicate')
                    if is_duplicate and is_duplicate(item, validated_items_so_far):
                        duplicates_skipped += 1
                        continue
                    if item.source_entity_id:
                        used_ids.add(item.source_entity_id)
                    used_fact_ids.update(item.source_fact_ids)
                    # Assign deterministic keys
                    reference = item.source_entity_id or ':'.join(str(value) for value in item.source_fact_ids)
                    if not reference and chunk_key:
                        reference = hashlib.sha256(json.dumps(sorted(
                            chunk_key(value) for value in item.source_chunks
                        )).encode()).hexdigest()[:24]
                    item.key = f"{section.type.value}:{reference}:{idx}"
                    validated_items.append(item)
                    validated_items_so_far.append(item)

                if validated_items:
                    section.items = validated_items
                    validated_sections.append(section)

            content.sections = validated_sections

            if not validated_sections:
                return policy["response_model"](
                    status=policy["status"].insufficient_context,
                    content=None,
                    explanation=("No distinct information was found for this section. Your existing preview is unchanged."
                                 if duplicates_skipped else
                                 f"The available details do not describe {section_label} clearly enough. {missing_details}"),
                    groundedEntityIds=[],
                    inputFingerprint=fingerprint,
                )

            latency = time.monotonic() - start_time
            logger.info(
                "appearance.preview_generated",
                extra={
                    "space_id": str(space_id),
                    "provider": provider_name,
                    "model": model,
                    "status": "success",
                    "latency_ms": int(latency * 1000),
                    "grounded_count": len(used_ids) + len(used_fact_ids),
                    "chunk_reference_count": len({chunk_key(ref) for section in content.sections
                                                  for item in section.items for ref in getattr(item, 'source_chunks', [])}) if chunk_key else 0,
                    "duplicates_skipped": duplicates_skipped,
                }
            )

            return policy["response_model"](
                status=policy["status"].ready,
                content=content,
                explanation="Draft built from Space knowledge. Review it before applying.",
                groundedEntityIds=list(used_ids),
                groundedFactIds=sorted(used_fact_ids, key=str),
                inputFingerprint=fingerprint,
            )

        except ValidationError:
            # We treat validation errors as provider unavailability (bad response)
            logger.warning(
                "appearance.preview_validation_failed",
                extra={"space_id": str(space_id), "provider": provider_name}
            )
        except Exception as exc:
            logger.warning(
                "appearance.preview_provider_failed",
                extra={"space_id": str(space_id), "provider": provider_name, "error_type": type(exc).__name__}
            )

    # Provider exhaustion
    latency = time.monotonic() - start_time
    logger.info(
        "appearance.preview_generated",
        extra={
            "space_id": str(space_id),
            "status": "exhausted",
            "latency_ms": int(latency * 1000),
        }
    )

    fallback = build_deterministic_preview_response(
        prompt_payload["entities"], fingerprint=fingerprint, policy=policy
    )
    if fallback and not request.section_type:
        return fallback
    return policy["response_model"](
        status=policy["status"].unavailable,
        content=None,
        explanation="Could not rebuild the preview. Your current preview is unchanged.",
        groundedEntityIds=[],
        inputFingerprint=fingerprint,
    )
