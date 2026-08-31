import json
import socket
import asyncio

import httpx
import pytest

from app.services.datasource.contracts import ExecutionContext, ToolConfig
from app.services.datasource.executor import DataSourceExecutor


def config(**overrides):
    values = {
        "name": "lookup_order",
        "method": "GET",
        "base_url": "https://api.example.com",
        "path": "/orders/{order_id}",
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"],
        },
        "request_template": {"query": {"expand": "status-{order_id}"}},
        "record_path": "data.orders",
        "field_mapping": {"id": "id", "status": "state"},
    }
    values.update(overrides)
    return ToolConfig(**values)


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        ],
    )


@pytest.fixture
def context():
    return ExecutionContext(space_id="space", chatbot_id="chatbot", request_id="request")


@pytest.mark.asyncio
async def test_execute_substitutes_placeholders_decrypts_secret_and_maps(context):
    seen = {}

    def handler(request):
        seen["request"] = request
        return httpx.Response(200, json={"data": {"orders": [{"id": "A1", "state": "sent"}]}})

    executor = DataSourceExecutor(
        transport=httpx.MockTransport(handler), decrypt_secret=lambda value: f"plain-{value}"
    )
    result = await executor.execute(
        config(auth_type="bearer", encrypted_secret="cipher"), {"order_id": "A 1"}, context
    )

    assert result.records == [{"id": "A1", "status": "sent"}]
    assert seen["request"].url.raw_path == b"/orders/A%201?expand=status-A+1"
    assert seen["request"].url.params["expand"] == "status-A 1"
    assert seen["request"].headers["authorization"] == "Bearer plain-cipher"
    assert "plain-cipher" not in repr(result)


@pytest.mark.asyncio
async def test_execute_honors_custom_api_key_header(context):
    seen = {}

    def handler(request):
        seen["request"] = request
        return httpx.Response(200, json={"data": {"orders": []}})

    result = await DataSourceExecutor(
        transport=httpx.MockTransport(handler), decrypt_secret=lambda _value: "plain-secret"
    ).execute(
        config(auth_type="api_key", auth_header="X-Customer-Key", encrypted_secret="cipher"),
        {"order_id": "A1"},
        context,
    )

    assert result.succeeded
    assert seen["request"].headers["x-customer-key"] == "plain-secret"
    assert "x-api-key" not in seen["request"].headers


@pytest.mark.asyncio
async def test_execute_rejects_unsafe_custom_api_key_header(context):
    called = False

    def handler(_request):
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    result = await DataSourceExecutor(
        transport=httpx.MockTransport(handler), decrypt_secret=lambda _value: "plain-secret"
    ).execute(
        config(auth_type="api_key", auth_header="Host", encrypted_secret="cipher"),
        {"order_id": "A1"},
        context,
    )

    assert result.failure.code == "unsafe_destination"
    assert called is False


@pytest.mark.parametrize("path", ["https://evil.example/orders", "//evil.example/orders"])
@pytest.mark.asyncio
async def test_execute_rejects_path_that_can_override_configured_origin(path, context):
    called = False

    def handler(_request):
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    result = await DataSourceExecutor(
        transport=httpx.MockTransport(handler), decrypt_secret=lambda _value: "plain-secret"
    ).execute(
        config(path=path, auth_type="bearer", encrypted_secret="cipher"), {}, context
    )

    assert result.failure.code == "invalid_configuration"
    assert called is False


@pytest.mark.asyncio
async def test_execute_rejects_arguments_that_violate_full_json_schema(context):
    schema = {
        "type": "object",
        "properties": {
            "order_id": {"type": "string", "pattern": "^[A-Z][0-9]+$"},
            "count": {"type": "integer", "minimum": 1},
        },
        "required": ["order_id", "count"],
        "additionalProperties": False,
    }
    result = await DataSourceExecutor(transport=httpx.MockTransport(lambda _request: None)).execute(
        config(input_schema=schema), {"order_id": "bad", "count": 0}, context
    )
    assert result.failure.code == "invalid_arguments"


@pytest.mark.asyncio
async def test_execute_rejects_invalid_json_schema_as_configuration_error(context):
    result = await DataSourceExecutor(transport=httpx.MockTransport(lambda _request: None)).execute(
        config(input_schema={"type": "object", "properties": {"order_id": {"type": "unknown"}}}),
        {"order_id": "A1"},
        context,
    )
    assert result.failure.code == "invalid_configuration"


@pytest.mark.parametrize("auth_type", ["digest", "oauth", "Bearer "])
@pytest.mark.asyncio
async def test_execute_rejects_unknown_auth_type_before_network(auth_type, context):
    called = False

    def handler(_request):
        nonlocal called
        called = True

    result = await DataSourceExecutor(transport=httpx.MockTransport(handler)).execute(
        config(auth_type=auth_type, encrypted_secret="cipher"), {"order_id": "A1"}, context
    )
    assert result.failure.code == "invalid_configuration"
    assert called is False


@pytest.mark.parametrize("auth_type", ["bearer", "api_key", "api-key", "basic", "basic_auth"])
@pytest.mark.asyncio
async def test_execute_requires_secret_for_authenticated_modes(auth_type, context):
    result = await DataSourceExecutor(transport=httpx.MockTransport(lambda _request: None)).execute(
        config(auth_type=auth_type, encrypted_secret=None), {"order_id": "A1"}, context
    )
    assert result.failure.code == "invalid_configuration"


@pytest.mark.asyncio
async def test_execute_rejects_forbidden_configured_headers_without_calling(context):
    called = False

    def handler(_request):
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    result = await DataSourceExecutor(transport=httpx.MockTransport(handler)).execute(
        config(default_headers={"Host": "internal"}), {"order_id": "A1"}, context
    )
    assert result.failure.code == "unsafe_destination"
    assert called is False


@pytest.mark.asyncio
async def test_execute_enforces_streamed_response_byte_limit(context):
    body = json.dumps({"data": {"orders": [{"id": "A1", "state": "sent"}]}}).encode()
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, content=body))
    result = await DataSourceExecutor(transport=transport).execute(
        config(max_response_bytes=10), {"order_id": "A1"}, context
    )
    assert result.failure.code == "response_too_large"


@pytest.mark.asyncio
async def test_execute_rejects_oversized_declared_content_length(context):
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, headers={"Content-Length": "999"}, content=b"{}")
    )
    result = await DataSourceExecutor(transport=transport).execute(
        config(max_response_bytes=10), {"order_id": "A1"}, context
    )
    assert result.failure.code == "response_too_large"


@pytest.mark.asyncio
async def test_execute_rejects_malformed_content_length(context):
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, headers={"Content-Length": "not-a-number"}, content=b"{}")
    )
    result = await DataSourceExecutor(transport=transport).execute(
        config(), {"order_id": "A1"}, context
    )
    assert result.failure.code == "invalid_response"


@pytest.mark.asyncio
async def test_execute_categorizes_timeout(context):
    def handler(request):
        raise httpx.ReadTimeout("secret-token", request=request)

    result = await DataSourceExecutor(transport=httpx.MockTransport(handler)).execute(
        config(), {"order_id": "A1"}, context
    )
    assert result.failure.code == "upstream_timeout"
    assert "secret-token" not in result.failure.message


@pytest.mark.asyncio
async def test_execute_enforces_total_deadline(context):
    async def handler(_request):
        await asyncio.sleep(0.05)
        return httpx.Response(200, json={"data": {"orders": []}})

    result = await DataSourceExecutor(
        transport=httpx.MockTransport(handler), execution_timeout_seconds=0.01
    ).execute(config(), {"order_id": "A1"}, context)
    assert result.failure.code == "upstream_timeout"


@pytest.mark.asyncio
async def test_execute_revalidates_redirect_destination(context, monkeypatch):
    calls = []

    def dns(host, *_args, **_kwargs):
        calls.append(host)
        address = "10.0.0.1" if host == "private.example" else "93.184.216.34"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))]

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(302, headers={"Location": "https://private.example/data"})
    )
    result = await DataSourceExecutor(transport=transport).execute(
        config(), {"order_id": "A1"}, context
    )
    assert result.failure.code == "unsafe_destination"
    assert calls == ["api.example.com", "api.example.com", "private.example"]


@pytest.mark.asyncio
async def test_dns_is_checked_immediately_for_initial_request_and_every_redirect(context, monkeypatch):
    dns_calls = []
    request_count = 0

    def dns(host, *_args, **_kwargs):
        dns_calls.append(host)
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    def handler(_request):
        nonlocal request_count
        request_count += 1
        if request_count == 1:
            return httpx.Response(302, headers={"Location": "/next"})
        return httpx.Response(200, json={"data": {"orders": []}})

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    result = await DataSourceExecutor(transport=httpx.MockTransport(handler)).execute(
        config(), {"order_id": "A1"}, context
    )

    assert result.succeeded
    assert dns_calls == ["api.example.com", "api.example.com", "api.example.com"]
    # DNS validation closes application-level mixed/private and redirect paths;
    # production egress controls remain defense-in-depth for DNS rebinding races.


@pytest.mark.asyncio
async def test_execute_does_not_forward_authentication_across_public_origin(context):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(302, headers={"Location": "https://other.example/data"})

    result = await DataSourceExecutor(
        transport=httpx.MockTransport(handler), decrypt_secret=lambda _value: "top-secret"
    ).execute(
        config(auth_type="bearer", encrypted_secret="cipher"), {"order_id": "A1"}, context
    )

    assert result.failure.code == "unsafe_destination"
    assert len(seen) == 1


@pytest.mark.asyncio
async def test_execute_rejects_non_json_response(context):
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, text="token=very-secret"))
    result = await DataSourceExecutor(transport=transport).execute(
        config(), {"order_id": "A1"}, context
    )
    assert result.failure.code == "invalid_response"
    assert "very-secret" not in result.failure.message


@pytest.mark.asyncio
async def test_execute_maps_authentication_and_upstream_statuses(context):
    auth = httpx.MockTransport(lambda _request: httpx.Response(401, text="secret"))
    unavailable = httpx.MockTransport(lambda _request: httpx.Response(503, text="secret"))

    auth_result = await DataSourceExecutor(transport=auth).execute(config(), {"order_id": "A1"}, context)
    error_result = await DataSourceExecutor(transport=unavailable).execute(config(), {"order_id": "A1"}, context)

    assert auth_result.failure.code == "authentication_failed"
    assert auth_result.failure.status_code == 401
    assert error_result.failure.code == "upstream_error"
    assert error_result.failure.retryable is True


@pytest.mark.asyncio
async def test_execute_caps_redirect_chain(context):
    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"Location": f"/redirect-{calls}"})

    result = await DataSourceExecutor(transport=httpx.MockTransport(handler)).execute(
        config(), {"order_id": "A1"}, context
    )
    assert result.failure.code == "upstream_error"
    assert calls == 4
