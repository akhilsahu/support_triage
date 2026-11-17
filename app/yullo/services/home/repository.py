import uuid
import zoneinfo
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, func, text, case

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_user_preference import YulloUserPreference
from app.models.conversation_turn import ConversationTurn
from app.models.conversation_event import ConversationEvent
from app.models.knowledge_base import KnowledgeBaseItem
from app.models.ingestion_job import IngestionJob
from app.models.yullo_space_entity import YulloSpaceEntity, YulloSpaceEntityEvidence
from app.models.kb_fact import KBFact
from app.models.yullo_home_event import YulloHomeEvent


class SpaceRecord(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    product: str
    created_at: datetime
    is_active: bool
    description: str | None = None
    logo_url: str | None = None
    status: str = "draft"
    parent_space_id: uuid.UUID | None = None

class SessionMetrics(BaseModel):
    space_id: uuid.UUID
    active_now_count: int
    today_count: int
    last_7d_count: int
    last_30d_count: int

class SourceMetrics(BaseModel):
    space_id: uuid.UUID
    total_items: int
    failed_items: int
    processing_items: int

class CapabilitySet(BaseModel):
    space_id: uuid.UUID
    entities_count: int
    evidence_count: int
    has_booking_action: bool = False

class IntentWindow(BaseModel):
    space_id: uuid.UUID
    intent: str
    last_7d_count: int
    prev_7d_count: int
    last_30d_count: int

class EventRecord(BaseModel):
    id: str
    space_id: uuid.UUID
    event_type: str
    occurred_at: datetime
    metadata: dict

    @field_validator("occurred_at")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        # Conversation timestamps are naive UTC; Home events are timezone-aware.
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class PreferenceSnapshot(BaseModel):
    app_theme: str = "system"

class HomeSnapshot(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    user_id: uuid.UUID
    snapshot_time: datetime
    timezone: str
    local_day_start: datetime
    preferences: PreferenceSnapshot
    
    spaces: List[SpaceRecord]
    session_metrics: Dict[uuid.UUID, SessionMetrics]
    source_metrics: Dict[uuid.UUID, SourceMetrics]
    capabilities: Dict[uuid.UUID, CapabilitySet]
    fact_review_counts: Dict[uuid.UUID, int]
    intent_windows: List[IntentWindow]
    recent_events: List[EventRecord]


class HomeSnapshotRepository:
    """Reads factual Home state using a consistent snapshot transaction."""

    @staticmethod
    async def load_home_snapshot(
        engine,
        user_id: uuid.UUID,
        now: datetime,
        config: dict
    ) -> HomeSnapshot:
        """
        Loads the home snapshot. Takes an async engine to manage
        a distinct REPEATABLE READ transaction.
        """
        async with engine.connect() as conn:
            await conn.execution_options(isolation_level="REPEATABLE READ")
            async with conn.begin():
                def _sync_load(sync_conn):
                    with Session(bind=sync_conn) as db:
                        return HomeSnapshotRepository._build_snapshot(db, user_id, now, config)
                        
                return await conn.run_sync(_sync_load)

    @staticmethod
    def _build_snapshot(db: Session, user_id: uuid.UUID, now: datetime, config: dict) -> HomeSnapshot:
        preferences = HomeSnapshotRepository._load_preferences(db, user_id)
        tz_str = (preferences.timezone if preferences else None) or "UTC"
        try:
            tz = zoneinfo.ZoneInfo(tz_str)
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            tz = zoneinfo.ZoneInfo("UTC")
            tz_str = "UTC"
            # TODO: Log invalid timezone
            
        if now.tzinfo is None:
            now = now.replace(tzinfo=zoneinfo.ZoneInfo("UTC"))
        local_now = now.astimezone(tz)
        local_day_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(zoneinfo.ZoneInfo("UTC"))
        
        # Convert to naive for SQLAlchemy to compare with naive DateTime columns
        now_naive = now.replace(tzinfo=None)
        local_day_start_naive = local_day_start.replace(tzinfo=None)

        spaces = HomeSnapshotRepository._load_owned_spaces(db, user_id)
        space_ids = [s.id for s in spaces]

        snapshot = HomeSnapshot(
            user_id=user_id,
            snapshot_time=now,
            timezone=tz_str,
            local_day_start=local_day_start,
            preferences=PreferenceSnapshot(app_theme=preferences.app_theme if preferences and hasattr(preferences, 'app_theme') else "system"),
            spaces=spaces,
            session_metrics=HomeSnapshotRepository._load_session_metrics(db, space_ids, now_naive, local_day_start_naive),
            source_metrics=HomeSnapshotRepository._load_source_states(db, space_ids),
            capabilities=HomeSnapshotRepository._load_entity_capabilities(db, space_ids),
            fact_review_counts=HomeSnapshotRepository._load_fact_review_counts(db, space_ids, now_naive),
            intent_windows=HomeSnapshotRepository._load_intent_windows(db, space_ids, now_naive),
            recent_events=HomeSnapshotRepository._load_recent_events(db, space_ids, now_naive, limit=50)
        )
        return snapshot

    @staticmethod
    def _load_owned_spaces(db: Session, user_id: uuid.UUID) -> List[SpaceRecord]:
        stmt = (
            select(Space, YulloSpace.parent_space_id)
            .outerjoin(YulloSpace, YulloSpace.space_id == Space.id)
            .where(
                Space.owner_user_id == user_id,
                Space.product == 'yullo',
                Space.status != 'archived'
            )
        )
        records = []
        for space, parent_space_id in db.execute(stmt).all():
            records.append(SpaceRecord(
                id=space.id,
                slug=space.slug,
                name=space.display_name,
                product=space.product,
                created_at=space.created_at,
                is_active=space.active,
                description=getattr(space, 'description', None),
                logo_url=space.logo_url,
                parent_space_id=parent_space_id,
                status=space.status
            ))
        return records

    @staticmethod
    def _load_preferences(db: Session, user_id: uuid.UUID) -> Optional[YulloUserPreference]:
        return db.scalar(select(YulloUserPreference).where(YulloUserPreference.user_id == user_id))

    @staticmethod
    def _load_session_metrics(db: Session, space_ids: List[uuid.UUID], now: datetime, local_day_start: datetime) -> Dict[uuid.UUID, SessionMetrics]:
        if not space_ids:
            return {}
            
        fifteen_mins_ago = now - timedelta(minutes=15)
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)
        
        stmt = (
            select(
                ConversationTurn.space_id,
                func.count(ConversationTurn.session_id.distinct()).filter(ConversationTurn.started_at >= fifteen_mins_ago).label("active_now"),
                func.count(ConversationTurn.session_id.distinct()).filter(ConversationTurn.started_at >= local_day_start).label("today"),
                func.count(ConversationTurn.session_id.distinct()).filter(ConversationTurn.started_at >= seven_days_ago).label("last_7d"),
                func.count(ConversationTurn.session_id.distinct()).filter(ConversationTurn.started_at >= thirty_days_ago).label("last_30d"),
            )
            .where(ConversationTurn.space_id.in_(space_ids))
            .where(ConversationTurn.started_at >= thirty_days_ago)
            .group_by(ConversationTurn.space_id)
        )
        
        metrics = {sid: SessionMetrics(space_id=sid, active_now_count=0, today_count=0, last_7d_count=0, last_30d_count=0) for sid in space_ids}
        for row in db.execute(stmt):
            metrics[row.space_id] = SessionMetrics(
                space_id=row.space_id,
                active_now_count=row.active_now,
                today_count=row.today,
                last_7d_count=row.last_7d,
                last_30d_count=row.last_30d
            )
        return metrics

    @staticmethod
    def _load_source_states(db: Session, space_ids: List[uuid.UUID]) -> Dict[uuid.UUID, SourceMetrics]:
        if not space_ids:
            return {}
            
        # We need to count items, and specifically join with IngestionJob to find failing/processing ones
        # A knowledge base item might have multiple jobs, we care about the latest status.
        stmt = (
            select(
                KnowledgeBaseItem.space_id,
                func.count(KnowledgeBaseItem.id).label("total"),
                func.count(KnowledgeBaseItem.id).filter(KnowledgeBaseItem.ingestion_status == 'failed').label("failed"),
                func.count(KnowledgeBaseItem.id).filter(KnowledgeBaseItem.ingestion_status.in_(['pending', 'processing'])).label("processing")
            )
            .where(KnowledgeBaseItem.space_id.in_(space_ids))
            .group_by(KnowledgeBaseItem.space_id)
        )
        
        metrics = {sid: SourceMetrics(space_id=sid, total_items=0, failed_items=0, processing_items=0) for sid in space_ids}
        for row in db.execute(stmt):
            metrics[row.space_id] = SourceMetrics(
                space_id=row.space_id,
                total_items=row.total,
                failed_items=row.failed,
                processing_items=row.processing
            )
        return metrics

    @staticmethod
    def _load_entity_capabilities(db: Session, space_ids: List[uuid.UUID]) -> Dict[uuid.UUID, CapabilitySet]:
        if not space_ids:
            return {}
            
        stmt_entities = (
            select(
                YulloSpaceEntity.space_id,
                func.count(YulloSpaceEntity.id).label("count"),
                func.count(
                    case(
                        (
                            and_(
                                YulloSpaceEntity.entity_type == 'action',
                                YulloSpaceEntity.payload_json['action_kind'].astext == 'booking'
                            ),
                            1
                        ),
                        else_=None
                    )
                ).label("booking_count")
            )
            .where(and_(YulloSpaceEntity.space_id.in_(space_ids), YulloSpaceEntity.is_active == True))
            .group_by(YulloSpaceEntity.space_id)
        )
        
        stmt_evidence = (
            select(YulloSpaceEntityEvidence.space_id, func.count(YulloSpaceEntityEvidence.id).label("count"))
            .where(YulloSpaceEntityEvidence.space_id.in_(space_ids))
            .group_by(YulloSpaceEntityEvidence.space_id)
        )
        
        caps = {sid: CapabilitySet(space_id=sid, entities_count=0, evidence_count=0) for sid in space_ids}
        # Combine results
        for row in db.execute(stmt_entities):
            caps[row.space_id] = CapabilitySet(
                space_id=row.space_id, 
                entities_count=row.count, 
                evidence_count=0,
                has_booking_action=row.booking_count > 0
            )           
        for row in db.execute(stmt_evidence):
            caps[row.space_id].evidence_count = row.count
            
        return caps

    @staticmethod
    def _load_fact_review_counts(db: Session, space_ids: List[uuid.UUID], now: datetime) -> Dict[uuid.UUID, int]:
        if not space_ids:
            return {}
            
        stmt = (
            select(KBFact.space_id, func.count(KBFact.id).label("count"))
            .where(
                KBFact.space_id.in_(space_ids),
                KBFact.review_status == 'extracted' # Only ones needing review
            )
            .group_by(KBFact.space_id)
        )
        
        counts = {sid: 0 for sid in space_ids}
        for row in db.execute(stmt):
            counts[row.space_id] = row.count
        return counts

    @staticmethod
    def _load_intent_windows(db: Session, space_ids: List[uuid.UUID], now: datetime) -> List[IntentWindow]:
        if not space_ids:
            return []
            
        seven_days_ago = now - timedelta(days=7)
        fourteen_days_ago = now - timedelta(days=14)
        thirty_days_ago = now - timedelta(days=30)
        
        stmt = (
            select(
                ConversationEvent.space_id,
                ConversationEvent.intent,
                func.count(ConversationEvent.id).filter(ConversationEvent.created_at >= seven_days_ago).label("last_7d"),
                func.count(ConversationEvent.id).filter(
                    ConversationEvent.created_at >= fourteen_days_ago,
                    ConversationEvent.created_at < seven_days_ago
                ).label("prev_7d"),
                func.count(ConversationEvent.id).filter(ConversationEvent.created_at >= thirty_days_ago).label("last_30d")
            )
            .where(
                ConversationEvent.space_id.in_(space_ids),
                ConversationEvent.event_type == 'intent.classified',
                ConversationEvent.intent.is_not(None),
                ConversationEvent.created_at >= thirty_days_ago
            )
            .group_by(ConversationEvent.space_id, ConversationEvent.intent)
        )
        
        windows = []
        for row in db.execute(stmt):
            windows.append(IntentWindow(
                space_id=row.space_id,
                intent=row.intent,
                last_7d_count=row.last_7d,
                prev_7d_count=row.prev_7d,
                last_30d_count=row.last_30d
            ))
        return windows

    @staticmethod
    def _load_recent_events(db: Session, space_ids: List[uuid.UUID], now: datetime, limit: int = 50) -> List[EventRecord]:
        if not space_ids:
            return []
            
        # We need domain events (YulloHomeEvent) AND aura events (ConversationEvent)
        # We can union them or just query both and merge-sort. Merge-sort in Python is fine since we limit per space.
        # It's cleaner to query them separately, order by created_at DESC, limit, and then merge.
        
        domain_stmt = (
            select(YulloHomeEvent)
            .where(YulloHomeEvent.space_id.in_(space_ids))
            .order_by(YulloHomeEvent.occurred_at.desc())
            .limit(limit)
        )
        domain_events = db.scalars(domain_stmt).all()
        
        aura_stmt = (
            select(ConversationEvent)
            .where(ConversationEvent.space_id.in_(space_ids))
            .order_by(ConversationEvent.created_at.desc())
            .limit(limit)
        )
        aura_events = db.scalars(aura_stmt).all()
        
        merged = []
        for e in domain_events:
            merged.append(EventRecord(
                id=str(e.id),
                space_id=e.space_id,
                event_type=e.event_type,
                occurred_at=e.occurred_at,
                metadata=e.event_metadata or {}
            ))
            
        for e in aura_events:
            merged.append(EventRecord(
                id=str(e.id),
                space_id=e.space_id,
                event_type=e.event_type,
                occurred_at=e.created_at,
                metadata={"session_id": str(e.session_id), "intent": e.intent, **(e.event_metadata or {})}
            ))
            
        merged.sort(key=lambda x: x.occurred_at, reverse=True)
        return merged[:limit]
