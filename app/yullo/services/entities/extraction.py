import uuid
import hashlib
import json
import re
from html import unescape
from urllib.parse import urlsplit
from typing import List

from fastapi import HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBaseItem
from app.models.yullo_space_entity import YulloSpaceEntity, YulloSpaceEntityEvidence
from app.yullo.services.entities.contracts import ValidatedEntityCandidate
from app.yullo.services.entities.payloads import validate_entity_payload

_CTA_KIND_PATTERNS = (
    ("booking", re.compile(r"^(book|reserve|schedule)\b", re.IGNORECASE)),
    ("enquiry", re.compile(r"^(contact|enquire|inquire|request)\b", re.IGNORECASE)),
    (
        "external_link",
        re.compile(
            r"^(order|buy|shop|join|apply|register|download|get started|learn more|view|explore)\b",
            re.IGNORECASE,
        ),
    ),
)


def _normalize_candidate_type(raw: dict) -> dict:
    """Correct an explicit linked CTA that a provider mislabeled as a website."""
    if raw.get("entity_type") != "contact_channel":
        return raw
    payload = raw.get("payload_json")
    if not isinstance(payload, dict) or payload.get("channel") != "website":
        return raw

    label = str(payload.get("label") or "").strip()
    destination_url = str(payload.get("value") or "").strip()
    quotes = ' '.join(str(loc.get('evidence_excerpt') or '') for loc in raw.get('evidence_locators', []) if isinstance(loc, dict)) if isinstance(raw.get('evidence_locators'), list) else ''
    purpose = str(payload.get('purpose') or '').strip()
    # Model-supplied purpose participates only when its phrase is evidenced.
    if purpose and not _is_grounded_excerpt(purpose, quotes):
        purpose = ''
    kind = None
    for candidate_kind, pattern in _CTA_KIND_PATTERNS:
        if pattern.search(label):
            kind = candidate_kind
            break
    if kind is None and purpose:
        if re.search(r"\b(book|booking|reserve|reservation|schedule|scheduling)\b", purpose, re.I):
            kind = 'booking'
        elif re.search(r"\b(enquire|inquire|enquiry|inquiry|request)\b", purpose, re.I):
            kind = 'enquiry'
        elif re.search(r"\b(order|buy|join|apply|register|download|read|learn|explore|view)\b", purpose, re.I):
            kind = 'external_link'
    if kind:
        normalized = dict(raw)
        normalized['entity_type'] = 'action'
        normalized['payload_json'] = {
            'label': label, 'kind': kind, 'destination_url': destination_url,
            **{field: payload[field] for field in ('organization', 'purpose', 'relationship') if field in payload},
        }
        return normalized
    # Ambiguous website candidates remain unconfirmed; URL shape proves no purpose.
    return raw


def _is_grounded_excerpt(excerpt: str, source_text: str) -> bool:
    if not excerpt or not source_text:
        return False
    normalize = lambda value: re.sub(r"\s+", " ", value).strip().casefold()
    return normalize(excerpt) in normalize(source_text)


def _has_grounded_url(value: str, source_text: str) -> bool:
    """Match complete source URLs, preserving path case and rejecting prefix matches."""
    def canonical(url: str) -> tuple:
        parsed = urlsplit(unescape(url))
        return (parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or '/', parsed.query, parsed.fragment)
    target = canonical(value)
    return any(canonical(token.rstrip('.,;')) == target for token in re.findall(r'https://[^\s<>"\]\)]+', unescape(source_text)))


def validate_link_context(entity_type: str, payload: dict, source_text: str, locators: list[dict], space_name: str = '') -> dict | None:
    """Evidence boundary for source-grounded contact and action candidates."""
    if entity_type not in ('contact_channel', 'action'):
        return payload
    quotes = ' '.join(str(loc.get('evidence_excerpt') or '') for loc in locators)
    value = str(payload.get('destination_url' if entity_type == 'action' else 'value') or '')
    if entity_type == 'action' or payload.get('channel') == 'website':
        if not _has_grounded_url(value, source_text):
            return None
    elif not _is_grounded_excerpt(value, quotes):
        return None
    payload = dict(payload)
    for field in ('organization', 'purpose'):
        if payload.get(field) and not _is_grounded_excerpt(payload[field], quotes):
            payload[field] = None
    if not payload.get('organization'):
        payload['relationship'] = 'unknown'
    elif payload.get('relationship') == 'space_owner' and (
        not space_name or payload['organization'].strip().casefold() != space_name.strip().casefold()
    ):
        payload['relationship'] = 'unknown'
    return payload

def validate_entity_candidate(raw: dict, source_text: str, *, space_name: str = '') -> ValidatedEntityCandidate | None:
    """Validate one source-grounded candidate without invoking a model or writing data."""
    if not isinstance(raw, dict):
        return None
    raw = _normalize_candidate_type(raw)
    raw_locators = raw.get('evidence_locators')
    if not isinstance(raw_locators, list):
        return None
    locators = [loc for loc in raw_locators if isinstance(loc, dict)
                and _is_grounded_excerpt(str(loc.get('evidence_excerpt') or ''), source_text)]
    if not locators:
        return None
    try:
        payload = validate_entity_payload(raw.get('entity_type'), raw.get('schema_version', 1), raw.get('payload_json', {}))
        payload = validate_link_context(raw['entity_type'], payload, source_text, locators, space_name)
        if payload is None:
            return None
        return ValidatedEntityCandidate(entity_type=raw['entity_type'], schema_version=raw.get('schema_version', 1),
                                        payload_json=payload, evidence_locators=locators)
    except (ValueError, TypeError):
        return None


async def persist_entity_candidates(db: AsyncSession, *, source_item_id: uuid.UUID, source_version: int, candidates: List[ValidatedEntityCandidate]) -> List[uuid.UUID]:
    """
    Opens a short transaction, locks and revalidates the current same-Space item version,
    validates every entity payload and evidence locator, then inserts or reuses yullo_space_entities
    (review_status='extracted',origin_type='extracted') plus yullo_space_entity_evidence.
    Stale source versions are rejected. Candidate identities are derived deterministically to prevent duplicate entities on retries.
    """
    stmt = select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == source_item_id).with_for_update()
    item = await db.scalar(stmt)
    if not item:
        raise HTTPException(status_code=404, detail="Source item not found")
        
    if item.source_version != source_version:
        raise HTTPException(status_code=409, detail="Stale source version")
        
    space_id = item.space_id
    source_kb_id = item.kb_id
    inserted_ids = []
    # Retire only machine-owned candidates no longer supported by this successful
    # extraction. Other source evidence and owner-confirmed records stay intact.
    prior_res = await db.scalars(
        select(YulloSpaceEntity).join(
            YulloSpaceEntityEvidence,
            and_(YulloSpaceEntityEvidence.entity_id == YulloSpaceEntity.id,
                 YulloSpaceEntityEvidence.space_id == YulloSpaceEntity.space_id),
        ).where(
            YulloSpaceEntity.space_id == space_id,
            YulloSpaceEntity.origin_type == "extracted",
            YulloSpaceEntity.review_status == "extracted",
            YulloSpaceEntityEvidence.source_item_id == source_item_id,
            YulloSpaceEntityEvidence.source_version == source_version,
        )
    )
    prior = prior_res.unique().all()
    
    for cand in candidates:
        try:
            normalized_payload = validate_entity_payload(cand.entity_type, cand.schema_version, cand.payload_json)
        except ValueError:
            continue  # Skip invalid extraction candidates
            
        # Compute deterministic identity key to avoid duplicate insertions on retry
        identity_payload = dict(normalized_payload)
        # Adding optional action context must not duplicate legacy context-free actions.
        if cand.entity_type == 'action' and not identity_payload.get('organization') and not identity_payload.get('purpose') and identity_payload.get('relationship') == 'unknown':
            for field in ('organization', 'purpose', 'relationship'):
                identity_payload.pop(field, None)
        payload_str = json.dumps(identity_payload, sort_keys=True)
        identity_hash = hashlib.sha256(f"{cand.entity_type}:{payload_str}".encode('utf-8')).hexdigest()[:32]
        deterministic_identity_key = f"extracted:{cand.entity_type}:{identity_hash}"

        # Check for existing entity in same space
        stmt_exist = select(YulloSpaceEntity).where(
            and_(
                YulloSpaceEntity.space_id == space_id,
                YulloSpaceEntity.entity_type == cand.entity_type,
                YulloSpaceEntity.identity_key == deterministic_identity_key
            )
        )
        existing_entity = await db.scalar(stmt_exist)
        
        if existing_entity:
            if existing_entity.review_status in ("extracted", "superseded") and not existing_entity.is_active:
                existing_entity.is_active = True
                existing_entity.review_status = "extracted"
                existing_entity.revision += 1
            entity_id = existing_entity.id
        else:
            new_id = uuid.uuid4()
            entity = YulloSpaceEntity(
                id=new_id,
                space_id=space_id,
                identity_key=deterministic_identity_key,
                entity_type=cand.entity_type,
                schema_version=cand.schema_version,
                payload_json=normalized_payload,
                origin_type="extracted",
                review_status="extracted",
                is_active=True,
                is_public=False, # Extracted entities remain unavailable to public Aura until owner confirmation
                revision=1
            )
            db.add(entity)
            await db.flush()
            entity_id = entity.id

        # Preserve every distinct page/chunk locator; retries do not duplicate them.
        existing_rows = await db.scalars(select(YulloSpaceEntityEvidence).where(
            YulloSpaceEntityEvidence.entity_id == entity_id,
            YulloSpaceEntityEvidence.space_id == space_id,
            YulloSpaceEntityEvidence.source_item_id == source_item_id,
            YulloSpaceEntityEvidence.source_version == source_version,
        ))
        seen_locators = {json.dumps(row.locator_metadata or {}, sort_keys=True) for row in existing_rows.all()}
        for loc in cand.evidence_locators:
            if not isinstance(loc, dict):
                continue
            locator_key = json.dumps(loc, sort_keys=True)
            if locator_key in seen_locators:
                continue
            seen_locators.add(locator_key)
            db.add(YulloSpaceEntityEvidence(
                entity_id=entity_id, space_id=space_id, source_item_id=source_item_id,
                source_kb_id=source_kb_id, source_version=source_version, locator_metadata=loc,
            ))

        inserted_ids.append(entity_id)
        
    for entity in prior:
        if entity.id in inserted_ids:
            continue
        other_evidence = await db.scalar(select(YulloSpaceEntityEvidence.id).where(
            YulloSpaceEntityEvidence.entity_id == entity.id,
            YulloSpaceEntityEvidence.space_id == space_id,
            YulloSpaceEntityEvidence.source_item_id != source_item_id,
        ).limit(1))
        if other_evidence is None and entity.is_active:
            entity.is_active = False
            entity.is_public = False
            entity.revision += 1

    await db.flush()
    return inserted_ids
