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


def test_validator_allows_explicitly_safe_post():
    validate_tool_config(tool_config(method="POST", risk_classification="read"))


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
