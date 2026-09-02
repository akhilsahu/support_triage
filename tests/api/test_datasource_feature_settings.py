from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.dashboard import get_nav_config
from app.api.v1.superadmin import (
    DataSourcesPlatformRequest,
    DataSourcesSpaceRequest,
    get_data_sources_feature,
    get_space_data_sources_feature,
    patch_data_sources_feature,
    patch_space_data_sources_feature,
)


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, platform_enabled=True):
        self.settings = SimpleNamespace(
            datasources_platform_enabled=platform_enabled,
            get_nav_config=lambda: {"dashboard": True, "data-sources": True},
        )
        self.commits = 0

    async def execute(self, _query):
        return ScalarResult(self.settings)

    async def scalar(self, _query):
        return self.settings

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_global_get_and_patch_are_distinct_from_nav_config():
    db = FakeSession()

    assert await get_data_sources_feature(db) == {"platform_enabled": True}
    result = await patch_data_sources_feature(
        DataSourcesPlatformRequest(platform_enabled=False), db
    )

    assert result == {"platform_enabled": False}
    assert db.commits == 1
    assert db.settings.get_nav_config() == {"dashboard": True, "data-sources": True}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("platform_enabled", "override", "effective"),
    [
        (True, None, True),
        (True, False, False),
        (False, True, False),
    ],
)
async def test_space_patch_returns_effective_resolution(
    monkeypatch, platform_enabled, override, effective
):
    space = SimpleNamespace(id=uuid4(), datasources_enabled=None)
    db = FakeSession(platform_enabled)

    async def get_space(*_args):
        return space

    monkeypatch.setattr("app.api.v1.superadmin.get_org_by_id", get_space)
    result = await patch_space_data_sources_feature(
        space.id, DataSourcesSpaceRequest(override=override), db
    )

    assert result == {"override": override, "effective_enabled": effective}
    assert db.commits == 1


@pytest.mark.asyncio
async def test_space_get_preserves_inherited_override(monkeypatch):
    space = SimpleNamespace(id=uuid4(), datasources_enabled=None)
    db = FakeSession()

    async def get_space(*_args):
        return space

    monkeypatch.setattr("app.api.v1.superadmin.get_org_by_id", get_space)
    assert await get_space_data_sources_feature(space.id, db) == {
        "override": None,
        "effective_enabled": True,
    }


@pytest.mark.asyncio
async def test_nav_config_exposes_feature_and_filters_disabled_menu_item():
    db = FakeSession()
    space = SimpleNamespace(enabled_nav_items=None, datasources_enabled=False)

    result = await get_nav_config(space, db)

    assert result["features"] == {"data_sources": False}
    assert result["enabled_nav_items"] == ["dashboard"]


def test_feature_requests_are_strict_and_reject_unknown_fields():
    with pytest.raises(ValidationError):
        DataSourcesPlatformRequest(platform_enabled="false")
    with pytest.raises(ValidationError):
        DataSourcesSpaceRequest(override=True, nav_config={})
