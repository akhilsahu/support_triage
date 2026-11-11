import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.knowledge_base import KnowledgeBaseItem
from app.orchestra.ai.appearance_preview.asset_persistence import list_source_extracted_assets, list_assets


@pytest.mark.asyncio
async def test_list_source_extracted_assets_collects_images_from_kb_items():
    space_id = uuid.uuid4()
    item = KnowledgeBaseItem(
        id=uuid.uuid4(),
        space_id=space_id,
        kb_id=uuid.uuid4(),
        item_type="url",
        title="SpaceX Launch",
        source_metadata={
            "assets": {
                "images": [
                    {
                        "url": "https://example.com/falcon.jpg",
                        "alt": "Falcon Heavy on launchpad",
                        "title": "Falcon Heavy",
                    },
                    {
                        "url": "https://example.com/starship.webp",
                        "alt": "Starship orbital flight",
                    },
                ]
            },
            "preview_image_url": "https://example.com/share.jpg",
        },
    )

    db = AsyncMock()
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [item]
    db.scalars.return_value = mock_scalars

    assets = await list_source_extracted_assets(db, space_id=space_id)

    assert len(assets) == 3
    # Preview image was inserted first
    assert assets[0].url == "https://example.com/share.jpg"
    assert assets[0].source_type == "extracted"

    # Images were parsed and deduplicated
    urls = [a.url for a in assets]
    assert "https://example.com/falcon.jpg" in urls
    assert "https://example.com/starship.webp" in urls

    falcon_asset = next(a for a in assets if a.url == "https://example.com/falcon.jpg")
    assert falcon_asset.filename == "falcon.jpg"
    assert falcon_asset.mime_type == "image/jpeg"
    assert falcon_asset.alt_text == "Falcon Heavy on launchpad"
    assert falcon_asset.source_type == "extracted"
