"""
Backwards-compatibility shim.

All logic has moved to:
    orchestrators/agno.py  → AgnoOrchestrator
    session/pool.py        → SessionPool

Import from the new locations directly:
    from app.orchestra.ai.orchestrators.agno import AgnoOrchestrator
    from app.orchestra.ai.session.pool import pool
"""

from app.orchestra.ai.orchestrators.agno import AgnoOrchestrator

# Alias kept so existing imports in customer.py don't break
OrchestraExecutor = AgnoOrchestrator

__all__ = ["AgnoOrchestrator", "OrchestraExecutor"]
