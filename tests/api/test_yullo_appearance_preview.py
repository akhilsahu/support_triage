from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.yullo.api import appearance
from app.core.auth import current_user
from app.core.database import get_db
from app.yullo.schemas.appearance_preview import PreviewStatus


class FakeSession:
    def __init__(self):
        pass

@pytest.fixture
def test_app():
    app = FastAPI()
    app.include_router(appearance.router, prefix="/api/v1")
    return app


def test_preview_generation_unauthenticated(test_app):
    # If no override for current_user, it should return 401/403 or we can simulate it
    # Actually, current_user requires token, so it will fail 401 automatically
    client = TestClient(test_app)
    space_id = uuid4()
    resp = client.post(
        f"/api/v1/yullo/spaces/{space_id}/appearance/preview",
        json={"currentConfig": {"schemaVersion": 1, "themePreset": "clean", "landingEmphasis": "services", "accent": "yullo", "backgroundTreatment": "soft", "hero": {"layout": "centered"}, "sections": [{"type": "identity", "visible": True}], "visualDensity": "balanced", "networkIntensity": "very_low", "presentationSource": "owner"}, "force": False}
    )
    assert resp.status_code in (401, 403)


def test_preview_generation_success(test_app):
    user_id = uuid4()
    space_id = uuid4()
    
    test_app.dependency_overrides[current_user] = lambda: SimpleNamespace(id=user_id)
    test_app.dependency_overrides[get_db] = lambda: FakeSession()
    
    client = TestClient(test_app)
    
    with patch("app.yullo.api.appearance.generate_appearance_preview", new_callable=AsyncMock) as mock_generate:
        from app.yullo.schemas.appearance_preview import AppearancePreviewResponse
        mock_generate.return_value = AppearancePreviewResponse(
            status=PreviewStatus.insufficient_context,
            content=None,
            explanation="Test explanation",
            groundedEntityIds=[],
            inputFingerprint="abc",
        )
        
        resp = client.post(
            f"/api/v1/yullo/spaces/{space_id}/appearance/preview",
            json={"currentConfig": {"schemaVersion": 1, "themePreset": "clean", "landingEmphasis": "services", "accent": "yullo", "backgroundTreatment": "soft", "hero": {"layout": "centered"}, "sections": [{"type": "identity", "visible": True}], "visualDensity": "balanced", "networkIntensity": "very_low", "presentationSource": "owner"}, "force": False}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "insufficient_context"


def test_preview_generation_cross_space(test_app):
    # The actual cross space check happens inside generate_appearance_preview, 
    # which raises 404 if space owner doesn't match
    user_id = uuid4()
    space_id = uuid4()
    
    test_app.dependency_overrides[current_user] = lambda: SimpleNamespace(id=user_id)
    test_app.dependency_overrides[get_db] = lambda: FakeSession()
    
    client = TestClient(test_app)
    
    with patch("app.yullo.api.appearance.generate_appearance_preview", new_callable=AsyncMock) as mock_generate:
        mock_generate.side_effect = HTTPException(status_code=404, detail="Yullo Space not found")
        
        resp = client.post(
            f"/api/v1/yullo/spaces/{space_id}/appearance/preview",
            json={"currentConfig": {"schemaVersion": 1, "themePreset": "clean", "landingEmphasis": "services", "accent": "yullo", "backgroundTreatment": "soft", "hero": {"layout": "centered"}, "sections": [{"type": "identity", "visible": True}], "visualDensity": "balanced", "networkIntensity": "very_low", "presentationSource": "owner"}, "force": False}
        )
        assert resp.status_code == 404
