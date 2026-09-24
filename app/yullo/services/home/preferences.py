from uuid import UUID
from datetime import datetime, timezone
from typing import Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert
from fastapi import HTTPException, status

from app.models.yullo_user_preference import YulloUserPreference
from app.schemas.yullo_home import HomePreferencePatch

DEFAULT_SECTIONS = [
    {"id": "pulse", "enabled": True, "order": 10},
    {"id": "rightNow", "enabled": True, "order": 20},
    {"id": "attention", "enabled": True, "order": 30},
    {"id": "forYou", "enabled": True, "order": 40},
    {"id": "spaces", "enabled": True, "order": 50},
    {"id": "quickInsight", "enabled": True, "order": 60},
    {"id": "orbit", "enabled": True, "order": 70},
    {"id": "recent", "enabled": True, "order": 80},
    {"id": "suggestion", "enabled": True, "order": 85},
    {"id": "pattern", "enabled": True, "order": 90},
]

VALID_IDS = {s["id"] for s in DEFAULT_SECTIONS}

def normalize_sections(sections_dict: Dict[str, Any]) -> list[Dict[str, Any]]:
    """
    Merge the supplied sections with defaults.
    Resolve equal supplied orders by canonical order, then normalize multiples of 10.
    """
    merged = []
    for d_sec in DEFAULT_SECTIONS:
        sec_id = d_sec["id"]
        if sec_id in sections_dict:
            merged.append({
                "id": sec_id,
                "enabled": bool(sections_dict[sec_id]["enabled"]),
                "order": int(sections_dict[sec_id]["order"])
            })
        else:
            merged.append(d_sec.copy())
            
    # Sort by order, then by canonical index in DEFAULT_SECTIONS
    def sort_key(item):
        canonical_idx = next((i for i, d in enumerate(DEFAULT_SECTIONS) if d["id"] == item["id"]), 999)
        return (item["order"], canonical_idx)
        
    merged.sort(key=sort_key)
    
    # Normalize multiples of 10
    for i, item in enumerate(merged):
        item["order"] = (i + 1) * 10
        
    return merged

async def update_home_preferences(db: AsyncSession, user_id: UUID, patch: HomePreferencePatch) -> list[Dict[str, Any]]:
    if patch.sections is not None and patch.resetToDefaults:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot provide both sections and resetToDefaults=true"
        )
        
    # Ensure row exists
    insert_stmt = insert(YulloUserPreference).values(
        user_id=user_id,
        app_theme="system",
        home_sections=[]
    ).on_conflict_do_nothing(index_elements=["user_id"])
    await db.execute(insert_stmt)
    
    # Lock for update
    stmt = select(YulloUserPreference).filter(YulloUserPreference.user_id == user_id).with_for_update()
    result = await db.execute(stmt)
    pref = result.scalars().first()
    
    if not pref:
        raise HTTPException(status_code=500, detail="Failed to lock preferences")
        
    if patch.resetToDefaults:
        pref.home_sections = []
        pref.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return DEFAULT_SECTIONS.copy()
        
    # Process partial patch
    current_overrides = {s["id"]: s for s in (pref.home_sections or []) if s.get("id") in VALID_IDS}
    
    if patch.sections:
        for s_patch in patch.sections:
            if s_patch.id in VALID_IDS:
                current_overrides[s_patch.id] = {
                    "id": s_patch.id,
                    "enabled": s_patch.enabled,
                    "order": max(0, min(1000, s_patch.order))
                }
                
    normalized = normalize_sections(current_overrides)
    
    # Store the actual overrides
    pref.home_sections = normalized
    pref.updated_at = datetime.now(timezone.utc)
    await db.commit()
    
    return normalized

async def get_effective_home_sections(db: AsyncSession, user_id: UUID) -> list[Dict[str, Any]]:
    stmt = select(YulloUserPreference).filter(YulloUserPreference.user_id == user_id)
    result = await db.execute(stmt)
    pref = result.scalars().first()
    current_overrides = {s["id"]: s for s in (pref.home_sections or []) if s.get("id") in VALID_IDS} if pref else {}
    return normalize_sections(current_overrides)
