from app.services.datasource.analyzer import AgentSummary, analyze_sample
from app.services.datasource.importer import parse_curl


async def test_analyze_nested_records_and_aliases_without_ai():
    draft = parse_curl("curl https://api.example.com/orders")
    result = await analyze_sample(draft, {"meta": {}, "data": {"orders": [
        {"order_id": "1", "state": "sent", "customer": {"name": "Ada"}}
    ]}})
    assert result.draft.tool.record_path == "data.orders"
    assert result.draft.tool.output_mapping["id"] == "order_id"
    assert result.draft.tool.output_mapping["status"] == "state"
    assert "customer.name" in result.observed_fields
    assert result.ai_used is False


async def test_analyze_root_list_and_redacts_secrets():
    draft = parse_curl("curl https://api.example.com/orders")
    result = await analyze_sample(draft, [{"id": 1, "token": "secret", "status": "ok"}])
    assert result.draft.tool.record_path == ""
    assert result.sample_record["token"] == "[REDACTED]"


async def test_analyze_ai_filters_invented_fields_and_agents():
    draft = parse_curl("curl https://api.example.com/orders")

    async def fake_generate(**kwargs):
        return {"content": '{"mapping":{"status":"state","bad":"invented"},"agent_ids":["active","dead"]}'}

    result = await analyze_sample(
        draft, [{"state": "ok"}], [AgentSummary("active", "Orders", "custom")],
        use_ai=True, llm_generate=fake_generate,
    )
    assert result.draft.tool.output_mapping == {"state": "state", "status": "state"}
    assert result.suggested_agent_ids == ("active",)


async def test_analyze_falls_back_on_malformed_ai():
    draft = parse_curl("curl https://api.example.com/orders")

    async def fake_generate(**kwargs):
        return {"content": "not json"}

    result = await analyze_sample(draft, [{"status": "ok"}], use_ai=True, llm_generate=fake_generate)
    assert result.draft.tool.output_mapping == {"status": "status"}
    assert result.ai_used is False
    assert result.warnings
