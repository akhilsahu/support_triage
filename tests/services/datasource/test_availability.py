from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.services.datasource.availability import (
    datasource_feature_enabled,
    require_datasource_feature,
)


@pytest.mark.parametrize(
    ("platform", "override", "expected"),
    [
        (True, None, True),
        (True, True, True),
        (True, False, False),
        (False, None, False),
        (False, True, False),
        (False, False, False),
    ],
)
async def test_datasource_feature_resolution(platform, override, expected):
    db = AsyncMock()
    db.scalar.return_value = SimpleNamespace(
        datasources_platform_enabled=platform,
    )
    space = SimpleNamespace(datasources_enabled=override)

    assert await datasource_feature_enabled(db, space) is expected


async def test_datasource_feature_defaults_to_enabled_without_settings():
    db = AsyncMock()
    db.scalar.return_value = None
    space = SimpleNamespace(datasources_enabled=None)

    assert await datasource_feature_enabled(db, space) is True


async def test_dependency_rejects_disabled_feature():
    db = AsyncMock()
    db.scalar.return_value = SimpleNamespace(
        datasources_platform_enabled=False,
    )

    with pytest.raises(HTTPException) as exc:
        await require_datasource_feature(
            SimpleNamespace(datasources_enabled=True),
            db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Data Sources has been disabled by an administrator."
