"""
Data Source API — org-scoped external API connections with LLM field mapping.

POST   /datasources/probe          — fetch sample from URL + LLM-generate mapping
GET    /datasources/               — list org's data sources
POST   /datasources/               — save a data source
PUT    /datasources/{id}           — update (user-corrected mapping)
DELETE /datasources/{id}           — delete
POST   /datasources/{id}/fetch     — fetch live data using saved config
"""

from __future__ import annotations

import ipaddress
import json
import socket
import uuid
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_brand
from app.core.database import get_db
from app.core.encryption import encrypt, decrypt
from app.models.datasource import OrgDataSource, CANONICAL_ORDER_FIELDS
from app.services.llm_service import llm_service

logger = structlog.get_logger()
router = APIRouter(prefix="/datasources", tags=["Data Sources"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class ProbeRequest(BaseModel):
    api_url:         str
    method:          str = "GET"          # GET | POST | PUT | PATCH
    auth_type:       str = "none"         # none | bearer | api_key | basic
    auth_value:      str = ""
    auth_header:     str = "Authorization"
    request_headers: Dict[str, str] = {}  # extra headers beyond auth
    request_params:  Dict[str, str] = {}  # query parameters
    request_body:    Optional[Dict[str, Any]] = None  # JSON body for POST/PUT


class ProbeResponse(BaseModel):
    sample:        Dict[str, Any]
    raw_fields:    List[str]
    mapping:       Dict[str, Optional[str]]
    llm_used:      bool


class DataSourceCreate(BaseModel):
    name:            str
    agent_type:      str
    api_url:         str
    method:          str = "GET"
    auth_type:       str = "none"
    auth_value:      str = ""
    auth_header:     str = "Authorization"
    request_headers: Dict[str, str] = {}
    request_params:  Dict[str, str] = {}
    request_body:    Optional[Dict[str, Any]] = None
    field_mapping:   Dict[str, Optional[str]]


class DataSourceUpdate(BaseModel):
    name:            Optional[str] = None
    method:          Optional[str] = None
    field_mapping:   Optional[Dict[str, Optional[str]]] = None
    auth_value:      Optional[str] = None
    request_headers: Optional[Dict[str, str]] = None
    request_params:  Optional[Dict[str, str]] = None
    request_body:    Optional[Dict[str, Any]] = None
    active:          Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

# Private/reserved IP ranges that must never be fetched (SSRF protection)
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # AWS/GCP metadata
    ipaddress.ip_network("100.64.0.0/10"),    # shared address space
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 private
]


def _validate_url(url: str) -> None:
    """Raise HTTPException if the URL resolves to a private/internal address.
    In development mode localhost is allowed for testing with the mock API.
    """
    from app.config import settings

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed.")
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="Invalid URL — no hostname.")

    # Allow localhost in development
    if settings.ENVIRONMENT == "development" and host in ("localhost", "127.0.0.1", "::1"):
        return

    try:
        resolved_ip = socket.gethostbyname(host)
        ip = ipaddress.ip_address(resolved_ip)
        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise HTTPException(
                    status_code=400,
                    detail=f"URL resolves to a private/internal address ({resolved_ip}). Not allowed."
                )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail=f"Could not resolve hostname: {host}")


def _build_auth_headers(auth_type: str, auth_value: str, auth_header: str) -> Dict[str, str]:
    if auth_type == "bearer" and auth_value:
        return {"Authorization": f"Bearer {auth_value}"}
    if auth_type == "api_key" and auth_value:
        return {auth_header: auth_value}
    if auth_type == "basic" and auth_value:
        return {"Authorization": f"Basic {auth_value}"}
    return {}


def _parse_llm_json(content: str) -> Any:
    """Strip markdown fences and parse JSON from LLM output."""
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content.strip())


async def _llm_extract_and_map(raw_response: Any) -> tuple[Dict[str, Any], List[str], Dict[str, Optional[str]]]:
    """
    Single LLM call that:
      1. Understands the raw API response structure (regardless of nesting)
      2. Extracts one representative order record
      3. Maps its fields to the canonical schema

    Returns: (sample_record, raw_fields, field_mapping)
    """
    # Truncate to avoid token overflow — first 3000 chars is enough for structure
    raw_str = json.dumps(raw_response)
    if len(raw_str) > 3000:
        raw_str = raw_str[:3000] + "... [truncated]"

    prompt = (
        "You are an API response analyzer. Given a raw API response, you must:\n"
        "1. Find the array of order/item records inside it (it may be nested under keys like "
        "   'data', 'result', 'orders', 'items', etc. at any depth)\n"
        "2. Extract ONE representative record from that array as a flat JSON object\n"
        "3. Map the fields of that record to the canonical order schema\n\n"
        f"Raw API response:\n{raw_str}\n\n"
        f"Canonical fields to map to: {json.dumps(CANONICAL_ORDER_FIELDS)}\n\n"
        "Return ONLY a JSON object with exactly these three keys:\n"
        "  sample    — the single extracted record (flat dict)\n"
        "  raw_fields — list of field names found in that record\n"
        "  mapping   — object where each canonical field maps to the matching raw field name "
        "              or null if no match exists\n\n"
        "Rules:\n"
        "- Never invent field names — only use names actually present in the record\n"
        "- Match by semantic meaning, not just string similarity\n"
        "- Return valid JSON only, no explanation, no markdown fences"
    )

    result = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=800,
    )

    if not result:
        raise ValueError("LLM returned no response")

    try:
        parsed = _parse_llm_json(result["content"])
        sample     = parsed.get("sample", {})
        raw_fields = parsed.get("raw_fields", list(sample.keys()))
        mapping    = parsed.get("mapping", {})
        # Ensure all canonical fields present in mapping
        for f in CANONICAL_ORDER_FIELDS:
            if f not in mapping:
                mapping[f] = None
        return sample, raw_fields, mapping
    except Exception as e:
        logger.warning("LLM extract+map parse failed", error=str(e), content=result.get("content", ""))
        # Hard fallback — shallow extract
        sample = _shallow_extract(raw_response)
        raw_fields = list(sample.keys())
        return sample, raw_fields, {f: None for f in CANONICAL_ORDER_FIELDS}


def _shallow_extract(data: Any) -> Dict[str, Any]:
    """Last-resort shallow extractor — tries one level of nesting."""
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v[0]
        return data
    return {}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/probe", response_model=ProbeResponse)
async def probe_datasource(req: ProbeRequest, org=Depends(current_brand)):
    """
    Fetch a sample from the external API and use LLM to map fields
    to the canonical schema. Returns mapping for user review.
    """
    _validate_url(req.api_url)

    headers = _build_auth_headers(req.auth_type, req.auth_value, req.auth_header)
    headers.update(req.request_headers)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                method  = req.method.upper(),
                url     = req.api_url,
                headers = headers,
                params  = req.request_params,
                json    = req.request_body,
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"API returned {e.response.status_code}: {e.response.text[:200]}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch API: {str(e)}")

    try:
        sample, raw_fields, mapping = await _llm_extract_and_map(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"LLM could not parse the API response: {str(e)}")

    if not sample:
        raise HTTPException(status_code=422, detail="Could not extract a record from the API response.")

    logger.info("Datasource probed", org_id=str(org.id), url=req.api_url, fields=raw_fields)
    return ProbeResponse(sample=sample, raw_fields=raw_fields, mapping=mapping, llm_used=True)


@router.get("/", response_model=List[dict])
async def list_datasources(db: AsyncSession = Depends(get_db), org=Depends(current_brand)):
    """List all data sources belonging to the authenticated org."""
    result = await db.execute(
        select(OrgDataSource).where(OrgDataSource.org_id == org.id).order_by(OrgDataSource.created_at.desc())
    )
    return [ds.to_dict() for ds in result.scalars().all()]


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_datasource(
    req: DataSourceCreate,
    db: AsyncSession = Depends(get_db),
    org=Depends(current_brand),
):
    """Save a new data source. org_id is derived from JWT — never from request."""
    _validate_url(req.api_url)
    ds = OrgDataSource(
        org_id      = org.id,
        name        = req.name,
        agent_type  = req.agent_type,
        api_url     = req.api_url,
        method      = req.method.upper(),
        auth_type   = req.auth_type,
        auth_value  = encrypt(req.auth_value),
        auth_header = req.auth_header,
    )
    ds.field_mapping    = req.field_mapping
    ds.request_headers  = req.request_headers
    ds.request_params   = req.request_params
    ds.request_body     = req.request_body or {}
    db.add(ds)
    await db.commit()
    await db.refresh(ds)
    logger.info("Datasource created", org_id=str(org.id), name=req.name, agent_type=req.agent_type)
    return ds.to_dict()


@router.put("/{ds_id}", response_model=dict)
async def update_datasource(
    ds_id: str,
    req: DataSourceUpdate,
    db: AsyncSession = Depends(get_db),
    org=Depends(current_brand),
):
    """Update mapping or auth. Only the owning org can update."""
    result = await db.execute(
        select(OrgDataSource).where(
            OrgDataSource.id == uuid.UUID(ds_id),
            OrgDataSource.org_id == org.id,
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found.")

    if req.name            is not None: ds.name            = req.name
    if req.method          is not None: ds.method          = req.method.upper()
    if req.auth_value      is not None: ds.auth_value      = encrypt(req.auth_value)
    if req.active          is not None: ds.active          = req.active
    if req.field_mapping   is not None: ds.field_mapping   = req.field_mapping
    if req.request_headers is not None: ds.request_headers = req.request_headers
    if req.request_params  is not None: ds.request_params  = req.request_params
    if req.request_body    is not None: ds.request_body    = req.request_body

    await db.commit()
    await db.refresh(ds)
    return ds.to_dict()


@router.delete("/{ds_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datasource(
    ds_id: str,
    db: AsyncSession = Depends(get_db),
    org=Depends(current_brand),
):
    """Delete a data source. Only the owning org can delete."""
    result = await db.execute(
        select(OrgDataSource).where(
            OrgDataSource.id == uuid.UUID(ds_id),
            OrgDataSource.org_id == org.id,
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found.")
    await db.delete(ds)
    await db.commit()


class FetchRequest(BaseModel):
    user_inputs: Dict[str, str] = {}
    """
    Runtime values to substitute into {placeholder} templates.
    e.g. {"id": "ORD-1234"} replaces {id} in params, body, and URL.
    """


def _substitute(template: Any, inputs: Dict[str, str]) -> Any:
    """Recursively replace {key} placeholders with user-supplied values."""
    if isinstance(template, str):
        for k, v in inputs.items():
            template = template.replace(f"{{{k}}}", v)
        return template
    if isinstance(template, dict):
        return {k: _substitute(v, inputs) for k, v in template.items()}
    if isinstance(template, list):
        return [_substitute(i, inputs) for i in template]
    return template


@router.post("/{ds_id}/fetch", response_model=dict)
async def fetch_live_data(
    ds_id: str,
    req: FetchRequest = FetchRequest(),
    db: AsyncSession = Depends(get_db),
    org=Depends(current_brand),
):
    """
    Fetch live data from the saved API URL, apply field mapping,
    and return normalized canonical records.

    Pass user_inputs to substitute {placeholder} values in params/body/url.
    e.g. {"id": "ORD-1234"} fills in any param stored as order_id={id}
    """
    result = await db.execute(
        select(OrgDataSource).where(
            OrgDataSource.id == uuid.UUID(ds_id),
            OrgDataSource.org_id == org.id,
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found.")

    # Substitute {placeholders} with runtime user inputs
    resolved_params = _substitute(ds.request_params, req.user_inputs)
    resolved_body   = _substitute(ds.request_body, req.user_inputs) or None
    resolved_url    = _substitute(ds.api_url, req.user_inputs)

    headers = _build_auth_headers(ds.auth_type, decrypt(ds.auth_value), ds.auth_header)
    headers.update(ds.request_headers)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                method  = ds.method or "GET",
                url     = resolved_url,
                headers = headers,
                params  = resolved_params,
                json    = resolved_body,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch API: {str(e)}")

    records = data if isinstance(data, list) else [_shallow_extract(data)]
    normalized = [ds.normalize(r) for r in records if isinstance(r, dict)]

    return {"source": ds.name, "count": len(normalized), "records": normalized}
