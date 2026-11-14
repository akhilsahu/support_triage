from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine

from app.models.user import User
from app.schemas.yullo_home import (
    YulloHomeResponse,
    YulloAccountInfo,
    YulloPreferenceResponse,
    YulloHomeSpace
)

from app.yullo.services.home.repository import HomeSnapshotRepository
from app.yullo.services.home.status import calculate_space_status
from app.yullo.services.home import attention, activity, metrics
from app.yullo.services.home.signals.service import select_home_signals
from app.yullo.services.home.orbit.service import build_orbit
from app.schemas.yullo_home import YulloHomeOrbit, YulloHomeOrbitCandidate

def _get_initials(name: str) -> str:
    if not name:
        return "?"
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[-1][0]}".upper()
    return name[0:2].upper()

async def get_yullo_home(db: AsyncSession, user: User, now: datetime) -> YulloHomeResponse:
    # 1. Load the unified factual snapshot via a standalone REPEATABLE READ transaction
    snapshot = await HomeSnapshotRepository.load_home_snapshot(
        engine=engine,
        user_id=user.id,
        now=now,
        config={}
    )
    
    # 2. Build the output view from pure generation modules
    home_spaces = []
    
    for space in snapshot.spaces:
        # Children remain in the snapshot for metrics, but are opened through their parent.
        if space.parent_space_id is not None:
            continue
        # Re-derive space status from snapshot capabilities & source states
        caps = snapshot.capabilities.get(space.id)
        source_metrics = snapshot.source_metrics.get(space.id)
        
        has_active_jobs = source_metrics.processing_items > 0 if source_metrics else False
        has_failed_sources = source_metrics.failed_items > 0 if source_metrics else False
        review_count = snapshot.fact_review_counts.get(space.id, 0)
        has_conflicts = review_count > 0
        
        # We need a dummy Space model to use the existing `calculate_space_status` helper, 
        # or rewrite the helper to take primitive values.
        # Let's create a dummy Space object just for the status logic since it reads `status` and `is_active`.
        from app.models.space import Space
        dummy_space = Space(
            id=space.id,
            status=space.status,
            active=space.is_active
        )
        
        status = calculate_space_status(
            dummy_space, 
            has_active_jobs=has_active_jobs, 
            has_failed_sources=has_failed_sources, 
            has_conflicts=has_conflicts
        )
        
        # Calculate session metrics for this space
        sm = snapshot.session_metrics.get(space.id)
        convs_today = sm.today_count if sm else 0
        
        # Get attention items explicitly for this space to count them
        space_attention = [a for a in attention.build_attention(snapshot) if a.spaceId == space.id]
        
        space_events = [e for e in snapshot.recent_events if e.space_id == space.id]
        last_activity_at = space_events[0].occurred_at if space_events else space.created_at
        
        home_spaces.append(YulloHomeSpace(
            id=space.id,
            name=space.name,
            slug=space.slug, 
            description=space.description,
            logoUrl=space.logo_url,
            lifecycle=space.status,
            auraStatus=status,
            conversationCountToday=convs_today,
            newConversationCount=sm.active_now_count if sm else 0,
            attentionCount=len(space_attention),
            lastActivityAt=last_activity_at
        ))
        
    suggestion, pattern = select_home_signals(snapshot, config={}, now=now)
    orbit_comp = build_orbit(snapshot, config={}, now=now)
    
    yullo_orbit = None
    if orbit_comp:
        yullo_orbit = YulloHomeOrbit(
            dominant=YulloHomeOrbitCandidate(
                id=orbit_comp.dominant.id,
                kind=orbit_comp.dominant.kind,
                metric=orbit_comp.dominant.metric,
                spaceId=orbit_comp.dominant.spaceId,
                spaceName=orbit_comp.dominant.spaceName,
                title=orbit_comp.dominant.title,
                role=orbit_comp.dominant.role,
                evidence=orbit_comp.dominant.evidence.model_dump(mode="json") if orbit_comp.dominant.evidence else None,
                actionKind=orbit_comp.dominant.action.kind if orbit_comp.dominant.action else None,
                actionTargetId=str(orbit_comp.dominant.action.targetId) if orbit_comp.dominant.action and orbit_comp.dominant.action.targetId else None
            ),
            supporting=[
                YulloHomeOrbitCandidate(
                    id=c.id,
                    kind=c.kind,
                    metric=c.metric,
                    spaceId=c.spaceId,
                    spaceName=c.spaceName,
                    title=c.title,
                    role=c.role,
                    evidence=c.evidence.model_dump(mode="json") if c.evidence else None,
                    actionKind=c.action.kind if c.action else None,
                    actionTargetId=str(c.action.targetId) if c.action and c.action.targetId else None
                ) for c in orbit_comp.supporting
            ]
        )
        
    return YulloHomeResponse(
        account=YulloAccountInfo(
            id=user.id,
            displayName=user.full_name or user.email or "Owner",
            initials=_get_initials(user.full_name or user.email or "?")
        ),
        preference=YulloPreferenceResponse(appTheme=snapshot.preferences.app_theme),
        spaces=home_spaces,
        attention=attention.build_attention(snapshot),
        recent=activity.build_recent(snapshot),
        suggestion=suggestion,
        pattern=pattern,
        orbit=yullo_orbit,
        generatedAt=snapshot.snapshot_time
    )
