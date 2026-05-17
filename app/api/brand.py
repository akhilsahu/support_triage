"""Serve brand dashboard HTML pages."""

from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse

router = APIRouter(prefix="/org", tags=["Brand UI"])

_UI_DIR = Path(__file__).parent.parent / "brand_ui"


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
