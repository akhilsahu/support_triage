"""
ToolFactory — converts DataSourceMCPServer tool definitions into Agno tools.

Adding a new tool source:
    def build_from_<source>(self, ...) -> List[Any]: ...
"""

from __future__ import annotations
from typing import Any, List, Optional
import structlog

from app.orchestra.ai.core.config import AgnoConfig

logger = structlog.get_logger()


class ToolFactory:
    """
    Builds Agno-native tool lists from various sources.

    Sources:
        build_from_mcp_server()    — DataSourceMCPServer (DB-driven tools)
        build_from_mcp_transport() — native Agno MCPTools (stdio/SSE)
    """

    def __init__(self, cfg: AgnoConfig):
        self.cfg = cfg

    def build_from_mcp_server(self, mcp_server: Optional[Any]) -> List[Any]:
        """Convert DataSourceMCPServer tool specs into Agno Function tools."""
        if not mcp_server or not self.cfg.tools_enabled:
            return []

        try:
            from agno.tools import Function
        except ImportError:
            logger.warning("agno not installed — MCP tools unavailable")
            return []

        tools = []
        for spec in mcp_server.tool_definitions():
            fn    = spec.get("function", {})
            name  = fn.get("name", "")
            desc  = fn.get("description", "")
            try:
                tools.append(Function(
                    name=name,
                    description=desc,
                    parameters=fn.get("parameters", {}),
                    entrypoint=self._make_tool_fn(mcp_server, name, desc),
                ))
                logger.debug("tool_factory.registered", tool=name)
            except Exception as e:
                logger.warning("tool_factory.register_failed", tool=name, error=str(e))

        logger.info("tool_factory.built", count=len(tools))
        return tools

    def build_from_mcp_transport(self, mcp_server: Optional[Any]) -> List[Any]:
        """Use Agno's native MCPTools when server speaks MCP protocol (stdio/SSE)."""
        if not mcp_server or not self.cfg.tools_enabled:
            return []
        try:
            from agno.tools.mcp import MCPTools
            return [MCPTools(server=mcp_server)]
        except ImportError:
            logger.warning("agno MCP tools not available")
            return []

    # ── Private ───────────────────────────────────────────────────────────────

    @staticmethod
    def _make_tool_fn(mcp_server: Any, tool_name: str, desc: str):
        async def tool_fn(**kwargs: str) -> str:
            import json
            result = await mcp_server.call_tool(tool_name, kwargs)
            if result.get("error"):
                return f"Error: {result['error']}"
            records = result.get("records", [])
            return json.dumps(records, indent=2) if records else "No records found."

        tool_fn.__name__ = tool_name
        tool_fn.__doc__  = desc
        return tool_fn
