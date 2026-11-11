import pytest
from pydantic import ValidationError
from app.schemas.yullo import YulloSpaceCreate

def test_yullo_space_create_valid():
    data = {"name": "Yullo Space", "slug": "yullo-space"}
    schema = YulloSpaceCreate(**data)
    assert schema.name == "Yullo Space"
    assert schema.slug == "yullo-space"

def test_yullo_space_create_forbids_legacy_fields():
    data = {
        "name": "Yullo Space", 
        "slug": "yullo-space",
        "email": "test@example.com",
        "password_hash": "hash123",
        "sla_rules": "some rules",
        "timezone": "UTC",
    }
    with pytest.raises(ValidationError) as exc_info:
        YulloSpaceCreate(**data)
    
    errors = exc_info.value.errors()
    forbidden_fields = [err["loc"][0] for err in errors if err["type"] == "extra_forbidden"]
    
    assert "email" in forbidden_fields
    assert "password_hash" in forbidden_fields
    assert "sla_rules" in forbidden_fields
    assert "timezone" in forbidden_fields

def test_space_create_request_defaults():
    from app.yullo.schemas.forms.identity import SpaceCreateRequest
    req = SpaceCreateRequest()
    assert req.display_name == "Unnamed Space"
    assert req.slug is None
    assert req.purpose == "business"

def test_space_create_request_custom():
    from app.yullo.schemas.forms.identity import SpaceCreateRequest
    req = SpaceCreateRequest(display_name="Acme Corp", slug="acme-corp")
    assert req.display_name == "Acme Corp"
    assert req.slug == "acme-corp"
