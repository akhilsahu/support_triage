import sys
import json
import uuid
import asyncio
from typing import List, Optional, Any, Dict, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.config import settings

from app.yullo.services.spaces.creation import create_or_resolve_yullo_space
from app.yullo.services.sources.contracts import TextSourceInput, FileSourceInput, UrlSourceInput
from app.yullo.services.sources.service import SourceService
from app.yullo.services.entities.contracts import EntityCommand
from app.yullo.services.entities.service import create_owner_entity
from app.yullo.services.spaces.publication import publish_space, validate_publication_readiness
from app.yullo.services.spaces.handles import validate_handle_format_and_availability
from app.orchestra.ai.ingestion.storage import put as storage_put
from app.models.ingestion_job import IngestionJob

NAMESPACE_YULLO_BOOTSTRAP = uuid.UUID("a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d")

class BootstrapError(Exception):
    pass

class OwnerSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Optional[str] = None
    phone: Optional[str] = None

    @model_validator(mode='after')
    def validate_identifier(self) -> 'OwnerSpec':
        if not self.email and not self.phone:
            raise ValueError("Must provide email or phone")
        return self

class SourceSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_key: str
    type: Literal['text', 'url', 'fixture']
    title: str
    body: Optional[str] = None
    url: Optional[str] = None
    fixtureKind: Optional[Literal['malformed_pdf']] = None
    expectedOutcome: Optional[Literal['done', 'failed']] = None

    @model_validator(mode='after')
    def validate_type_requirements(self) -> 'SourceSpec':
        if self.type == 'text' and not self.body:
            raise ValueError("Text source must have a body")
        if self.type == 'url' and not self.url:
            raise ValueError("URL source must have a url")
        if self.type == 'fixture' and not self.fixtureKind:
            raise ValueError("Fixture source must specify fixtureKind")
        if self.fixtureKind == 'malformed_pdf' and settings.ENVIRONMENT == 'production':
            raise ValueError("malformed_pdf fixture is not allowed in production environment")
        return self

class EntitySpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity_key: str
    entity_type: Literal['offering', 'location', 'portfolio_item', 'contact', 'contact_channel', 'person', 'event', 'action']
    payload_json: Dict[str, Any]
    is_public: bool = True

class SpaceSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str
    display_name: Optional[str] = None
    purpose: str
    description_source_title: Optional[str] = None
    sources: List[SourceSpec] = []
    entities: List[EntitySpec] = []
    launch: bool = False

class BootstrapPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    config_version: str
    owner: OwnerSpec
    spaces: List[SpaceSpec]
    wait_timeout_seconds: Optional[int] = 300
    poll_interval_seconds: Optional[int] = 2

def validate_bootstrap_payload(payload: dict) -> BootstrapPayload:
    return BootstrapPayload.model_validate(payload)

class BootstrapReport(BaseModel):
    owner_email: str
    owner_id: str
    spaces: List[dict]

def build_malformed_pdf_fixture() -> bytes:
    """Returns a deterministic internal fixture for a malformed PDF."""
    return b"%PDF-1.7\nmalformed-demo-payload\n%%EOF"

async def preflight_bootstrap(config: BootstrapPayload) -> User:
    space_slugs = set()
    for space_spec in config.spaces:
        if space_spec.slug in space_slugs:
            raise ValueError(f"Duplicate space slug '{space_spec.slug}' in payload")
        space_slugs.add(space_spec.slug)
        
        source_keys = set()
        for src in space_spec.sources:
            if src.source_key in source_keys:
                raise ValueError(f"Duplicate source_key '{src.source_key}' in space '{space_spec.slug}'")
            source_keys.add(src.source_key)
            
        entity_keys = set()
        for ent in space_spec.entities:
            if ent.entity_key in entity_keys:
                raise ValueError(f"Duplicate entity_key '{ent.entity_key}' in space '{space_spec.slug}'")
            entity_keys.add(ent.entity_key)
            
    async with AsyncSessionLocal() as db:
        if config.owner.email and config.owner.phone:
            stmt = select(User).where(User.email == config.owner.email, User.phone == config.owner.phone)
            user = (await db.execute(stmt)).scalars().first()
            if not user:
                raise BootstrapError("Target owner email and phone provided do not resolve to the same user.")
        elif config.owner.email:
            stmt = select(User).where(User.email == config.owner.email)
            user = (await db.execute(stmt)).scalars().first()
        else:
            stmt = select(User).where(User.phone == config.owner.phone)
            user = (await db.execute(stmt)).scalars().first()
            
        if not user:
            identifier = config.owner.email or config.owner.phone
            raise BootstrapError(f"Target owner '{identifier}' not found.")
            
        # Validate handles
        for space_spec in config.spaces:
            val_res = await validate_handle_format_and_availability(db, space_spec.slug, user.id)
            if not val_res["valid"]:
                raise BootstrapError(f"Invalid slug '{space_spec.slug}': {val_res['reason']}")
            
    return user

async def bootstrap_from_payload(payload: dict) -> BootstrapReport:
    config = validate_bootstrap_payload(payload)
    user = await preflight_bootstrap(config)
    
    report = BootstrapReport(
        owner_email=user.email or user.phone or "",
        owner_id=str(user.id),
        spaces=[]
    )
    
    import time
    for space_spec in config.spaces:
        space_report = {"slug": space_spec.slug, "sources": [], "entities": [], "published": False, "error": None}
        try:
            async with AsyncSessionLocal() as db:
                created = await create_or_resolve_yullo_space(
                    db, 
                    owner_user_id=user.id, 
                    slug=space_spec.slug, 
                    purpose=space_spec.purpose,
                    title=space_spec.display_name or space_spec.slug.capitalize()
                )
                space_id = created.space.id
                await db.commit()
    
            # Sources
            jobs_to_process = []
            source_service = SourceService()
            for src in space_spec.sources:
                idempotency_str = f"{config.config_version}:{user.id}:{space_spec.slug}:src:{src.source_key}"
                dedupe_id = uuid.uuid5(NAMESPACE_YULLO_BOOTSTRAP, idempotency_str)
                
                async with AsyncSessionLocal() as db:
                    if src.type == 'text':
                        input_obj = TextSourceInput(title=src.title, text=src.body)
                    elif src.type == 'url':
                        input_obj = UrlSourceInput(url=src.url)
                    elif src.type == 'fixture' and src.fixtureKind == 'malformed_pdf':
                        fixture_bytes = build_malformed_pdf_fixture()
                        blob_key = await storage_put(space_id=space_id, key=f"bootstrap_{src.source_key}", body=fixture_bytes, content_type="application/pdf")
                        input_obj = FileSourceInput(title=src.title, blob_key=blob_key, mime_type="application/pdf")
                    else:
                        raise ValueError(f"Invalid source type or fixture kind")
    
                    accepted = await source_service.accept_source(db, user_id=user.id, space_id=space_id, command=input_obj, idempotency_key=dedupe_id)
                    await db.commit()
                    jobs_to_process.append((accepted.job_id, src.expectedOutcome or ('done' if src.type in ('text', 'url') else 'failed')))
                        
            # Asynchronous processing with polling
            timeout = config.wait_timeout_seconds or 300
            poll_interval = config.poll_interval_seconds or 2
            start_time = time.time()
            
            while jobs_to_process:
                if time.time() - start_time > timeout:
                    raise BootstrapError("Timeout waiting for background ingestion jobs to complete")
                    
                still_processing = []
                for job_id, expected in jobs_to_process:
                    async with AsyncSessionLocal() as db:
                        job = (await db.execute(select(IngestionJob).where(IngestionJob.id == job_id))).scalars().first()
                        if not job:
                            raise BootstrapError(f"Job {job_id} not found after processing")
                            
                        if job.status in ('DONE', 'FAILED'):
                            if (job.status == 'DONE' and expected == 'done') or (job.status == 'FAILED' and expected == 'failed'):
                                space_report["sources"].append({"job_id": str(job_id), "status": job.status, "matched_expected": True})
                            else:
                                space_report["sources"].append({"job_id": str(job_id), "status": job.status, "matched_expected": False})
                                raise BootstrapError(f"Job {job_id} finished as {job.status}, expected {expected}")
                        else:
                            still_processing.append((job_id, expected))
                
                jobs_to_process = still_processing
                if jobs_to_process:
                    await asyncio.sleep(poll_interval)
                        
            # Entities
            for ent in space_spec.entities:
                async with AsyncSessionLocal() as db:
                    ent_type = ent.entity_type
                    ent_payload = dict(ent.payload_json)
                    if ent_type == 'contact':
                        ent_type = 'contact_channel'
                        if 'channel' not in ent_payload and ('email' in ent_payload or 'phone' in ent_payload or 'website' in ent_payload):
                            if 'email' in ent_payload:
                                ent_payload = {"label": "Email", "channel": "email", "value": ent_payload['email']}
                            elif 'phone' in ent_payload:
                                ent_payload = {"label": "Phone", "channel": "phone", "value": ent_payload['phone']}
                            elif 'website' in ent_payload:
                                ent_payload = {"label": "Website", "channel": "website", "value": ent_payload['website']}
                    
                    cmd = EntityCommand(
                        identity_key=ent.entity_key,
                        entity_type=ent_type, 
                        payload_json=ent_payload, 
                        schema_version=1,
                        is_public=ent.is_public
                    )
                    await create_owner_entity(db, user_id=user.id, space_id=space_id, command=cmd)
                    await db.commit()
                    space_report["entities"].append({"identity_key": ent.entity_key, "type": ent_type})
                    
            # Publication
            if space_spec.launch:
                async with AsyncSessionLocal() as db:
                    if await validate_publication_readiness(db, space_id=space_id, owner_user_id=user.id):
                        await publish_space(db, space_id=space_id, owner_user_id=user.id)
                        space_report["published"] = True
                        
                        # Complete onboarding
                        db_user = (await db.execute(select(User).where(User.id == user.id))).scalars().first()
                        if db_user:
                            db_user.onboarding_completed = True
                    else:
                        raise BootstrapError(f"Space {space_spec.slug} failed publication readiness")
                    await db.commit()
                    
            report.spaces.append(space_report)
        except Exception as e:
            space_report["error"] = str(e)
            report.spaces.append(space_report)
            break

    # Post-run Home verification
    from datetime import datetime
    from app.yullo.services.home.service import get_yullo_home
    async with AsyncSessionLocal() as db:
        home_res = await get_yullo_home(db, user, datetime.utcnow())
        if not home_res:
            raise BootstrapError("Post-run Home verification failed: Home response is empty")
            
        home_slugs = {s.slug: s for s in home_res.spaces}
        for space_spec in config.spaces:
            if space_spec.slug not in home_slugs:
                if any(r.get("error") for r in report.spaces if r["slug"] == space_spec.slug):
                    continue
                raise BootstrapError(f"Space {space_spec.slug} not found in Home response")
                
            h_space = home_slugs[space_spec.slug]
            if space_spec.launch and h_space.lifecycle_status != 'live':
                raise BootstrapError(f"Space {space_spec.slug} should be live but is {h_space.lifecycle_status}")


    return report

async def bootstrap_from_file(path: str) -> BootstrapReport:
    with open(path, "r") as f:
        payload = json.load(f)
    return await bootstrap_from_payload(payload)
