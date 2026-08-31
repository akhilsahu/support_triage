import pytest

from app.services.datasource.contracts import ToolConfig
from app.services.datasource.validator import ToolValidationError, validate_tool_config


def tool_config(**overrides):
    values = {
        "name": "lookup_order",
        "method": "GET",
        "path": "/orders/{order_id}",
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"],
        },
        "request_template": {},
        "risk_classification": "read",
        "max_records": 10,
    }
    values.update(overrides)
    return ToolConfig(**values)


def test_validator_rejects_unbound_placeholder():
    config = tool_config(input_schema={"type": "object", "properties": {}})

    with pytest.raises(ToolValidationError, match="order_id"):
        validate_tool_config(config)


def test_validator_rejects_write_method():
    with pytest.raises(ToolValidationError, match="read-only"):
        validate_tool_config(tool_config(method="DELETE"))


def test_validator_rejects_malformed_nested_json_schema():
    with pytest.raises(ToolValidationError, match="valid JSON Schema"):
        validate_tool_config(tool_config(input_schema={
            "type": "object", "properties": {"id": {"type": "not-a-real-type"}}
        }))


def test_validator_rejects_arbitrary_static_connection_header():
    with pytest.raises(ToolValidationError, match="safe static"):
        validate_tool_config(tool_config(default_headers={"X-Tenant": "acme"}))


def test_validator_allows_custom_header_made_only_of_declared_placeholder():
    validate_tool_config(tool_config(
        path="/orders",
        input_schema={"type": "object", "properties": {"region": {"type": "string"}}},
        request_template={"headers": {"X-Region": "{region}"}},
    ))


def test_validator_rejects_custom_header_with_static_prefix():
    with pytest.raises(ToolValidationError, match="only declared placeholders"):
        validate_tool_config(tool_config(
            path="/orders",
            input_schema={"type": "object", "properties": {"region": {"type": "string"}}},
            request_template={"headers": {"X-Region": "region-{region}"}},
        ))


def test_validator_allows_explicitly_safe_post():
    validate_tool_config(tool_config(method="POST", risk_classification="read"))


@pytest.mark.parametrize("method", ["GET", "POST"])
@pytest.mark.parametrize("classification", ["write", "unknown", "READ", ""])
def test_validator_rejects_every_non_read_risk_classification(method, classification):
    with pytest.raises(ToolValidationError, match="classified as read-only"):
        validate_tool_config(
            tool_config(method=method, risk_classification=classification),
        )


@pytest.mark.parametrize("name", ["UPPER_case", "ab", "1lookup", "contains-dash"])
def test_validator_rejects_invalid_tool_names(name):
    with pytest.raises(ToolValidationError, match="name"):
        validate_tool_config(tool_config(name=name))


def test_validator_finds_placeholders_in_nested_request_templates():
    config = tool_config(
        path="/orders",
        request_template={
            "query": {"customer": "{customer_id}"},
            "headers": {"X-Region": "{region}"},
            "body": {"filters": [{"status": "{status}"}]},
        },
    )

    with pytest.raises(ToolValidationError, match="customer_id.*region.*status"):
        validate_tool_config(config)


def test_validator_rejects_required_keys_missing_from_properties():
    config = tool_config(
        path="/orders",
        input_schema={
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["missing"],
        },
    )

    with pytest.raises(ToolValidationError, match="missing"):
        validate_tool_config(config)


@pytest.mark.parametrize("maximum", [0, 101])
def test_validator_enforces_record_limit(maximum):
    with pytest.raises(ToolValidationError, match="max_records"):
        validate_tool_config(tool_config(max_records=maximum))
