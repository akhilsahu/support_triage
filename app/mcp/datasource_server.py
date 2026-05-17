"""
OrchestraSupport MCP Server — Data Source Tools

Single MCP server for all orgs. Flow:
  1. Caller passes org_id (from JWT) when initialising a session
  2. Server looks up all OrgDataSource rows for that org
  3. Exposes one tool per agent_type: get_order(order_id), etc.
  4. Each tool resolves the right data source, substitutes {id} placeholders,
     calls the org's API, normalises the response, and returns canonical records.

No per-org server processes. One server, multi-tenant by org_id.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional
from uuid import UUID

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt
from app.models.datasource import OrgDataSource

logger = structlog.get_logger()

# ── Placeholder substitution ──────────────────────────────────────────────────

def _substitute(template: Any, inputs: Dict[str, str]) -> Any:
    """Replace {key} placeholders with runtime values — works on str/dict/list."""
    if isinstance(template, str):
        for k, v in inputs.items():
            template = template.replace(f"{{{k}}}", v)
        return template
    if isinstance(template, dict):
        return {k: _substitute(v, inputs) for k, v in template.items()}
    if isinstance(template, list):
        return [_substitute(i, inputs) for i in template]
    return template


# ── Auth header builder ───────────────────────────────────────────────────────

def _build_auth_headers(auth_type: str, auth_value: str, auth_header: str) -> Dict[str, str]:
    if auth_type == "bearer" and auth_value:
        return {"Authorization": f"Bearer {auth_value}"}
    if auth_type == "api_key" and auth_value:
        return {auth_header: auth_value}
    if auth_type == "basic" and auth_value:
        return {"Authorization": f"Basic {auth_value}"}
    return {}


# ── Core fetch logic ──────────────────────────────────────────────────────────

async def _fetch_from_datasource(
    ds: OrgDataSource,
    user_inputs: Dict[str, str],
) -> Dict[str, Any]:
    """
    Resolve placeholders, call the org's API, return raw response.
    Decrypts auth_value at call time — never stored decrypted.
    """
    resolved_params = _substitute(ds.request_params, user_inputs)
    resolved_body   = _substitute(ds.request_body, user_inputs) or None
    resolved_url    = _substitute(ds.api_url, user_inputs)

    headers = _build_auth_headers(ds.auth_type, decrypt(ds.auth_value), ds.auth_header)
    headers.update(ds.request_headers)

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.request(
            method  = ds.method or "GET",
            url     = resolved_url,
            headers = headers,
            params  = resolved_params,
            json    = resolved_body,
        )
        resp.raise_for_status()
        return resp.json()


def _normalize_records(ds: OrgDataSource, raw: Any) -> List[Dict[str, Any]]:
    """Extract list of records from raw response and apply field mapping."""
    if isinstance(raw, list):
        records = raw
    elif isinstance(raw, dict):
        # Find the first list value (handles wrappers like {"orders": [...], "total": N})
        records = next(
            (v for v in raw.values() if isinstance(v, list) and v and isinstance(v[0], dict)),
            [raw],
        )
    else:
        records = []
    return [ds.normalize(r) for r in records if isinstance(r, dict)]


# ── MCP Tool registry ─────────────────────────────────────────────────────────

class DataSourceMCPServer:
    """
    Multi-tenant MCP tool executor.

    Usage:
        server = DataSourceMCPServer(db, org_id)
        await server.load()                          # loads org's data sources from DB
        tools = server.tool_definitions()            # pass to LLM as tool specs
        result = await server.call_tool("get_order", {"order_id": "ORD-1001"})
    """

    def __init__(self, db: AsyncSession, org_id: UUID):
        self.db = db
        self.org_id = org_id
        self._sources: Dict[str, OrgDataSource] = {}   # agent_type → data source

    async def load(self) -> None:
        """Load all active data sources for this org from DB."""
        result = await self.db.execute(
            select(OrgDataSource).where(
                OrgDataSource.org_id == self.org_id,
                OrgDataSource.active == True,
            )
        )
        for ds in result.scalars().all():
            self._sources[ds.agent_type] = ds
        logger.info("MCP server loaded", org_id=str(self.org_id), sources=list(self._sources.keys()))

    def tool_definitions(self) -> List[Dict[str, Any]]:
        """
        Return OpenAI-compatible tool specs for all loaded data sources.
        The LLM sees these as callable tools.
        """
        tools = []
        for agent_type, ds in self._sources.items():
            # Detect dynamic {placeholder} params from stored config
            dynamic_keys = _extract_placeholders(ds.request_params) | \
                           _extract_placeholders(ds.request_body)    | \
                           _extract_placeholders(ds.api_url)

            properties = {}
            required   = []
            for key in dynamic_keys:
                properties[key] = {
                    "type": "string",
                    "description": f"Value to substitute for {{{key}}} in the {agent_type} API request",
                }
                required.append(key)

            tools.append({
                "type": "function",
                "function": {
                    "name":        f"get_{agent_type}",
                    "description": f"Fetch {agent_type} data from {ds.name}. "
                                   f"Returns normalized records in canonical schema.",
                    "parameters": {
                        "type":       "object",
                        "properties": properties,
                        "required":   required,
                    },
                },
            })
        return tools

    async def call_tool(self, tool_name: str, args: Dict[str, str]) -> Dict[str, Any]:
        """
        Execute a tool call from the LLM.
        tool_name format: get_{agent_type}  e.g. get_order, get_logistics
        """
        # Extract agent_type from tool name
        if not tool_name.startswith("get_"):
            return {"error": f"Unknown tool: {tool_name}"}

        agent_type = tool_name[4:]   # strip "get_"
        ds = self._sources.get(agent_type)
        if not ds:
            return {
                "error": f"No active data source configured for agent type '{agent_type}'.",
                "available": list(self._sources.keys()),
            }

        try:
            raw      = await _fetch_from_datasource(ds, args)
            records  = _normalize_records(ds, raw)
            logger.info("MCP tool called", tool=tool_name, org_id=str(self.org_id), records=len(records))
            return {
                "source":  ds.name,
                "count":   len(records),
                "records": records,
            }
        except httpx.HTTPStatusError as e:
            return {"error": f"API returned {e.response.status_code}: {e.response.text[:200]}"}
        except Exception as e:
            logger.error("MCP tool error", tool=tool_name, error=str(e))
            return {"error": str(e)}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_placeholders(value: Any) -> set:
    """Find all {key} placeholders in a string, dict, or list."""
    text = json.dumps(value) if not isinstance(value, str) else value
    return set(re.findall(r'\{(\w+)\}', text))
