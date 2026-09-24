import uuid
import hashlib
import json
from typing import List, Protocol, Optional, Dict, Any

from fastapi import HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBaseItem
from app.models.yullo_space_entity import YulloSpaceEntity, YulloSpaceEntityEvidence
from app.yullo.services.entities.contracts import ValidatedEntityCandidate
from app.yullo.services.entities.payloads import validate_entity_payload

class EntityExtractionProvider(Protocol):
    async def extract(self, *, source_text: str, allowed_types: List[str]) -> List[dict]: ...

async def extract_entity_candidates(
    *, source_item_id: uuid.UUID, source_version: int, provider: EntityExtractionProvider, source_text: str = ""
) -> List[ValidatedEntityCandidate]:
    """
    The model call runs outside a transaction and returns bounded structured candidates only.
    """
    allowed_types = ['offering', 'location', 'portfolio_item', 'contact_channel', 'person', 'event', 'action']
    if not source_text:
        return []
    
    raw_candidates = await provider.extract(source_text=source_text, allowed_types=allowed_types)
    validated_candidates = []
    
    for raw in raw_candidates:
        entity_type = raw.get("entity_type")
        schema_version = raw.get("schema_version", 1)
        payload_json = raw.get("payload_json", {})
        evidence_locators = raw.get("evidence_locators", [])
        
        if entity_type in allowed_types:
            try:
                norm = validate_entity_payload(entity_type, schema_version, payload_json)
                validated_candidates.append(
                    ValidatedEntityCandidate(
                        entity_type=entity_type,
                        schema_version=schema_version,
                        payload_json=norm,
                        evidence_locators=evidence_locators
                    )
                )
            except ValueError:
                continue
                
    return validated_candidates

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
    
    for cand in candidates:
        try:
            normalized_payload = validate_entity_payload(cand.entity_type, cand.schema_version, cand.payload_json)
        except ValueError:
            continue  # Skip invalid extraction candidates
            
        # Compute deterministic identity key to avoid duplicate insertions on retry
        payload_str = json.dumps(normalized_payload, sort_keys=True)
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

        # Add verified evidence
        for loc in cand.evidence_locators:
            if not isinstance(loc, dict):
                continue
            evidence = YulloSpaceEntityEvidence(
                entity_id=entity_id,
                space_id=space_id,
                source_item_id=source_item_id,
                source_kb_id=source_kb_id,
                source_version=source_version,
                locator_metadata=loc
            )
            db.add(evidence)
            
        inserted_ids.append(entity_id)
        
    await db.flush()
    return inserted_ids

