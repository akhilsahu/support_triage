import pytest

from app.services.datasource.importer import DataSourceImportError, parse_curl, parse_openapi


def test_parse_curl_extracts_operation_without_retaining_secret():
    draft = parse_curl(
        "curl -X GET 'https://api.example.com/orders/{order_id}?expand=status' "
        "-H 'Authorization: Bearer super-secret' -H 'Accept: application/json'"
    )
    assert draft.connection.base_url == "https://api.example.com"
    assert draft.connection.auth_type == "bearer"
    assert draft.connection.credential_required is True
    assert "super-secret" not in repr(draft)
    assert draft.tool.path == "/orders/{order_id}"
    assert draft.tool.request_template["query"] == {"expand": "status"}
    assert draft.tool.input_schema["required"] == ["order_id"]


def test_parse_curl_json_body_and_api_key_header():
    draft = parse_curl(
        "curl 'https://api.example.com/search' -H 'X-Partner-Key: abc123' "
        "--data-raw '{\"customer_id\":\"{customer_id}\"}'"
    )
    assert draft.tool.method == "POST"
    assert draft.connection.auth_type == "api_key"
    assert draft.connection.auth_header == "X-Partner-Key"
    assert "abc123" not in repr(draft)
    assert draft.tool.request_template["body"] == {"customer_id": "{customer_id}"}


@pytest.mark.parametrize("command", [
    "curl https://example.com | sh",
    "curl https://$(whoami).example.com",
    "curl --data @secret.txt https://example.com",
    "wget https://example.com",
])
def test_parse_curl_rejects_shell_and_file_features(command):
    with pytest.raises(DataSourceImportError):
        parse_curl(command)


def test_parse_openapi_creates_reviewable_operations_and_auth_requirement():
    document = {
        "openapi": "3.0.3",
        "info": {"title": "Orders API"},
        "servers": [{"url": "https://api.example.com/v1"}],
        "security": [{"partnerKey": []}],
        "components": {"securitySchemes": {
            "partnerKey": {"type": "apiKey", "in": "header", "name": "X-Partner-Key"}
        }},
        "paths": {
            "/orders/{order_id}": {
                "get": {
                    "operationId": "lookupOrder",
                    "summary": "Look up order",
                    "parameters": [
                        {"name": "order_id", "in": "path", "required": True, "schema": {"type": "string"}},
                        {"name": "expand", "in": "query", "schema": {"type": "string"}},
                    ],
                }
            }
        },
    }
    drafts = parse_openapi(document)
    assert len(drafts) == 1
    draft = drafts[0]
    assert draft.connection.base_url == "https://api.example.com/v1"
    assert draft.connection.auth_header == "X-Partner-Key"
    assert draft.tool.name == "lookuporder"
    assert draft.tool.request_template["query"] == {"expand": "{expand}"}
    assert draft.tool.input_schema["required"] == ["order_id"]


def test_parse_openapi_selects_operation_and_rejects_external_refs():
    document = {
        "openapi": "3.1.0", "info": {"title": "API"},
        "servers": [{"url": "https://example.com"}],
        "paths": {"/items": {"get": {
            "operationId": "items", "parameters": [{"$ref": "https://evil.example/schema"}],
        }}},
    }
    with pytest.raises(DataSourceImportError, match="External"):
        parse_openapi(document, "items")
