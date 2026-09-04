"""AI usage/cost aggregation for the owning space.

Backs the dashboard "AI Cost" card. Every row in ai_usage_events was written
fail-open by app/services/ai_usage.py; this endpoint only reads.
"""
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
from app.models.ai_usage import AiUsageEvent
from app.models.space import Space

logger = structlog.get_logger()
router = APIRouter(prefix="/usage", tags=["AI Usage"])


@router.get("/summary")
async def usage_summary(
    days: int = Query(30, ge=1, le=365),
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Token/call totals for the caller's space, grouped by kind and model.

    cost_usd is summed when pricing data has been backfilled into the rows
    (pricing is wired per-model later; today rows carry estimated token counts).
    """
    since = datetime.utcnow() - timedelta(days=days)

    by_kind_model = (await db.execute(
        select(
            AiUsageEvent.kind,
            AiUsageEvent.model,
            func.count().label("calls"),
            func.coalesce(func.sum(AiUsageEvent.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(AiUsageEvent.cost_usd), 0).label("cost_usd"),
        )
        .where(AiUsageEvent.space_id == space.id, AiUsageEvent.created_at >= since)
        .group_by(AiUsageEvent.kind, AiUsageEvent.model)
        .order_by(func.sum(AiUsageEvent.total_tokens).desc())
    )).all()

    daily = (await db.execute(
        select(
            func.date(AiUsageEvent.created_at).label("day"),
            func.coalesce(func.sum(AiUsageEvent.total_tokens), 0).label("total_tokens"),
            func.count().label("calls"),
        )
        .where(AiUsageEvent.space_id == space.id, AiUsageEvent.created_at >= since)
        .group_by(func.date(AiUsageEvent.created_at))
        .order_by(func.date(AiUsageEvent.created_at))
    )).all()

    failures = (await db.execute(
        select(func.count()).select_from(AiUsageEvent)
        .where(AiUsageEvent.space_id == space.id,
               AiUsageEvent.created_at >= since,
               AiUsageEvent.ok == False)  # noqa: E712 — SQLAlchemy column compare
    )).scalar() or 0

    return {
        "days": days,
        "total_tokens": int(sum(r.total_tokens for r in by_kind_model)),
        "total_calls": int(sum(r.calls for r in by_kind_model)),
        "failures": int(failures),
        "by_kind_model": [
            {"kind": r.kind, "model": r.model, "calls": int(r.calls),
             "total_tokens": int(r.total_tokens), "cost_usd": float(r.cost_usd or 0)}
            for r in by_kind_model
        ],
        "daily": [
            {"day": str(r.day), "total_tokens": int(r.total_tokens), "calls": int(r.calls)}
            for r in daily
        ],
    }
