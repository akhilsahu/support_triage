from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import datasource_tools, datasources
from app.core.auth import current_space
from app.core.database import get_db
from app.services.datasource.availability import DISABLED_DETAIL


class DisabledSession:
    async def scalar(self, _statement):
        return SimpleNamespace(datasources_platform_enabled=True)


@pytest.fixture
def disabled_client():
    app = FastAPI()
    app.include_router(datasource_tools.router, prefix="/api/v1")
    app.include_router(datasources.router, prefix="/api/v1")
    app.dependency_overrides[current_space] = lambda: SimpleNamespace(
        datasources_enabled=False
    )
    app.dependency_overrides[get_db] = DisabledSession
    return TestClient(app)


@pytest.mark.parametrize(
    ("method", "path", "json"),
    [
        ("get", "/api/v1/data-sources/connections", None),
        (
            "post",
            "/api/v1/data-sources/import",
            {"kind": "curl", "content": "curl https://example.com/orders"},
        ),
        ("get", "/api/v1/datasources/", None),
        (
            "post",
            "/api/v1/datasources/",
            {
                "name": "Orders",
                "agent_type": "orders",
                "api_url": "https://example.com/orders",
                "field_mapping": {},
            },
        ),
    ],
)
def test_disabled_feature_rejects_every_datasource_api_family(
    disabled_client, method, path, json
):
    kwargs = {"json": json} if json is not None else {}
    response = getattr(disabled_client, method)(path, **kwargs)

    assert response.status_code == 403
    assert response.json() == {"detail": DISABLED_DETAIL}
