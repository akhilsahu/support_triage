import uuid
from types import SimpleNamespace

import pytest

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.session.pool import SessionPool
from app.services.datasource.runtime import DataSourceRuntime, identity_for


def resolved(*, source_id=None, builtin=True, slug="orders"):
    return ResolvedAgent(
        slug=slug,
        name="Orders",
        description="Order lookups",
        agent_type="order" if builtin else "custom",
        is_builtin=builtin,
        system_prompt="",
        base_prompt="",
        temperature=0.2,
        max_tokens=200,
        rag_enabled=False,
        rag_doc_types_list=[],
        rag_top_k=5,
        keywords_list=[],
        source_id=str(source_id) if source_id else None,
    )


def test_identity_for_uses_persisted_config_and_custom_ids():
    builtin_id = uuid.uuid4()
    custom_id = uuid.uuid4()
    assert identity_for(resolved(source_id=builtin_id)).agent_id == builtin_id
    assert identity_for(resolved(source_id=builtin_id)).agent_kind == "builtin"
    assert identity_for(resolved(source_id=custom_id, builtin=False)).agent_kind == "custom"
    assert identity_for(resolved()) is None


def test_datasource_invalidation_targets_only_selected_production_chatbots():
    pool = SessionPool()
    pool._runners = {
        "space:bot-a:team": object(),
        "space:bot-b:team": object(),
        "space:bot-a:evaluation:team": object(),
        "other:bot-a:team": object(),
    }
    pool._last_used = {key: 1 for key in pool._runners}

    assert pool.invalidate_datasource_runners("space", ["bot-a"]) == 1
    assert "space:bot-a:team" not in pool._runners
    assert "space:bot-b:team" in pool._runners
    assert "space:bot-a:evaluation:team" in pool._runners
    assert "other:bot-a:team" in pool._runners


@pytest.mark.asyncio
async def test_runtime_execute_always_passes_cached_revision(monkeypatch):
    agent_id = uuid.uuid4()
    agent = resolved(source_id=agent_id)
    definition = SimpleNamespace(tool_id=uuid.uuid4(), revision=7)
    seen = {}

    class SessionContext:
        async def __aenter__(self): return object()
        async def __aexit__(self, *_): return None

    class Registry:
        def __init__(self, _db): pass
        async def execute(self, context, selected_agent_id, kind, tool_id, arguments, *, expected_revision):
            seen.update(
                context=context,
                agent_id=selected_agent_id,
                kind=kind,
                tool_id=tool_id,
                arguments=arguments,
                expected_revision=expected_revision,
            )
            return SimpleNamespace(failure=None, records=[{"id": "A1"}])

    monkeypatch.setattr("app.services.datasource.runtime.AsyncSessionLocal", SessionContext)
    monkeypatch.setattr("app.services.datasource.runtime.DataSourceToolRegistry", Registry)

    output = await DataSourceRuntime(uuid.uuid4(), uuid.uuid4()).execute(
        agent, definition, {"order_id": "A1"},
    )
    assert '"id":"A1"' in output
    assert seen["agent_id"] == agent_id
    assert seen["expected_revision"] == 7


def test_resolved_agent_factories_preserve_source_identity():
    config_id = uuid.uuid4()
    catalog = SimpleNamespace(
        slug="order", name="Order", description="", agent_type="order",
        base_prompt="", icon="", platform_enabled=True,
    )
    config = SimpleNamespace(
        id=config_id, catalog=catalog, system_prompt="", effective_temperature=0.2,
        effective_max_tokens=200, effective_rag_enabled=False,
        effective_rag_doc_types_list=[], effective_rag_top_k=5, keywords_list=[],
        skills_list=[], llm_model=None, reasoning_effort=None,
    )
    assert ResolvedAgent.from_builtin(config).source_id == str(config_id)
