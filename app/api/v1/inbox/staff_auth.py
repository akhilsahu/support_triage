"""
Staff authentication and presence.

POST /inbox/staff/login      — staff login → JWT
POST /inbox/staff/logout     — go offline
POST /inbox/staff/heartbeat  — stay online (every 30s)
PATCH /inbox/staff/presence  — manually go online/offline
PATCH /inbox/staff/pause     — toggle service_paused
GET  /inbox/staff            — list all staff for this space (owner only)
POST /inbox/staff            — create staff member (owner only)
"""

from __future__ import annotations

import structlog
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import current_space
from app.models.space import Space
from app.models.staff import StaffMember
from app.services.inbox.queue_service import trigger_queue_for_space

logger = structlog.get_logger()
router = APIRouter(prefix="/inbox/staff", tags=["Inbox — Staff"])


# ── JWT helpers ───────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    import bcrypt
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_staff_token(staff_id: str, space_id: str) -> str:
    from jose import jwt
    from app.config import settings
    payload = {
        "sub":      staff_id,
        "space_id": space_id,
        "role":     "staff",
        "exp":      datetime.utcnow() + timedelta(hours=12),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


async def current_staff(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(lambda: None),  # placeholder — replaced below
) -> StaffMember:
    raise NotImplementedError


# ── Proper staff JWT dependency ───────────────────────────────────────────────

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Security

_bearer = HTTPBearer(auto_error=False)


async def get_current_staff(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    db: AsyncSession = Depends(get_db),
) -> StaffMember:
    from jose import jwt
    from app.config import settings

    if not credentials:
        raise HTTPException(401, "Staff token required.")
    from jose import JWTError
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError as e:
        raise HTTPException(401, f"Invalid or expired staff token: {e}")
    if payload.get("role") != "staff":
        raise HTTPException(403, "Not a staff token.")
    staff_id = payload["sub"]

    result = await db.execute(select(StaffMember).where(StaffMember.id == UUID(staff_id)))
    staff = result.scalar_one_or_none()
    if not staff or not staff.active:
        raise HTTPException(401, "Staff not found or inactive.")
    return staff


# ── Endpoints ─────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def staff_login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StaffMember).where(StaffMember.email == req.email, StaffMember.active == True)
    )
    staff = result.scalar_one_or_none()
    if not staff or not _verify_password(req.password, staff.password_hash):
        raise HTTPException(401, "Invalid credentials.")

    staff.presence    = "online"
    staff.last_seen_at = datetime.utcnow()
    await db.commit()

    token = _create_staff_token(str(staff.id), str(staff.space_id))
    return {"token": token, "staff": staff.to_dict()}


@router.post("/logout")
async def staff_logout(
    staff: StaffMember = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    staff.presence = "offline"
    await db.commit()
    return {"ok": True}


@router.post("/heartbeat")
async def staff_heartbeat(
    staff: StaffMember = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    """Called every 30s by the staff inbox. Updates last_seen_at."""
    was_offline = staff.presence != "online"
    staff.presence     = "online"
    staff.last_seen_at = datetime.utcnow()
    await db.commit()

    # If staff just came back online, try to drain the queue
    if was_offline:
        await trigger_queue_for_space(db, staff.space_id)

    return {"ok": True}


class PresenceRequest(BaseModel):
    presence: str   # "online" | "offline"


@router.patch("/presence")
async def update_presence(
    req: PresenceRequest,
    staff: StaffMember = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    if req.presence not in ("online", "offline"):
        raise HTTPException(400, "presence must be 'online' or 'offline'.")
    was_offline = staff.presence != "online"
    staff.presence = req.presence
    await db.commit()

    if req.presence == "online" and was_offline:
        await trigger_queue_for_space(db, staff.space_id)

    return staff.to_dict()


@router.patch("/pause")
async def toggle_pause(
    staff: StaffMember = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    """Toggle service_paused. When unpaused, try to drain the queue."""
    staff.service_paused = not staff.service_paused
    await db.commit()

    if not staff.service_paused:
        await trigger_queue_for_space(db, staff.space_id)

    return staff.to_dict()


# ── Space owner: manage staff ─────────────────────────────────────────────────

class CreateStaffRequest(BaseModel):
    email: str
    name: str
    password: str
    description: Optional[str] = None
    max_concurrent_chats: int = 3
    service_hours_start: Optional[str] = None
    service_hours_end: Optional[str] = None
    timezone: str = "UTC"


@router.get("")
async def list_staff(
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaffMember).where(StaffMember.space_id == org.id, StaffMember.active == True)
    )
    return [s.to_dict() for s in result.scalars().all()]


@router.post("", status_code=201)
async def create_staff(
    req: CreateStaffRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(StaffMember).where(StaffMember.email == req.email, StaffMember.space_id == org.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "A staff member with this email already exists.")

    staff = StaffMember(
        space_id=org.id,
        email=req.email,
        name=req.name,
        password_hash=_hash_password(req.password),
        description=req.description,
        max_concurrent_chats=req.max_concurrent_chats,
        service_hours_start=req.service_hours_start,
        service_hours_end=req.service_hours_end,
        timezone=req.timezone,
    )
    db.add(staff)
    await db.commit()
    await db.refresh(staff)
    return staff.to_dict()


@router.delete("/{staff_id}", status_code=204)
async def delete_staff(
    staff_id: UUID,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaffMember).where(StaffMember.id == staff_id, StaffMember.space_id == org.id)
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(404, "Staff member not found.")
    staff.active = False
    await db.commit()
