"""Serve brand dashboard HTML pages and public org info."""

from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select

router = APIRouter(prefix="/org", tags=["Brand UI"])

_UI_DIR = Path(__file__).parent.parent / "org_ui"


def _html(name: str) -> HTMLResponse:
    return HTMLResponse((_UI_DIR / name).read_text())


@router.get("/login", response_class=HTMLResponse)
async def brand_login():
    return _html("login.html")


@router.get("/dashboard", response_class=HTMLResponse)
async def brand_dashboard():
    return _html("dashboard.html")


@router.get("/", response_class=RedirectResponse)
async def brand_root():
    return RedirectResponse("/org/login")


@router.get("/search")
async def org_search(q: str = ""):
    """Public org search — returns matching active orgs by name or slug."""
    from app.core.database import AsyncSessionLocal
    from app.models.space import Space
    from sqlalchemy import or_, func
    if not q or len(q.strip()) < 1:
        return {"results": []}
    db = AsyncSessionLocal()
    try:
        term = f"%{q.strip().lower()}%"
        result = await db.execute(
            select(Space)
            .where(
                Space.active == True,
                or_(
                    func.lower(Space.display_name).like(term),
                    func.lower(Space.slug).like(term),
                )
            )
            .limit(6)
        )
        orgs = result.scalars().all()
        return {"results": [
            {"name": o.display_name, "slug": o.slug, "logo_url": o.logo_url, "theme_color": o.theme_color or "#4f46e5"}
            for o in orgs
        ]}
    finally:
        await db.close()


@router.get("/public/{slug}")
async def org_public_info(slug: str):
    """Public org branding info for the customer chat UI."""
    from app.core.database import AsyncSessionLocal
    from app.models.space import Space
    db = AsyncSessionLocal()
    try:
        result = await db.execute(
            select(Space).where(Space.slug == slug, Space.active == True)
        )
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Not found")
        return {
            "name":        org.display_name,
            "slug":        org.slug,
            "logo_url":    org.logo_url,
            "theme_color": org.theme_color or "#4f46e5",
        }
    finally:
        await db.close()
