"""Dependency wiring for existing evidence retrieval tests."""
from functools import partial
import pytest

from app.orchestra.ai.knowledge.retrieval.retrieve_chunks import retrieve_evidence
from app.orchestra.ai.knowledge.retrieval.images_retrieval import attach_source_assets
from app.orchestra.ai.db_utils.source_loader import published_doc_id
from app.yullo.config.inference import get_knowledge_features, get_chat_image_config
from app.yullo.schemas.retrieval import RetrievedContext
from app.yullo.services.sources.service import load_chat_sources, source_images, public_source_asset
from app.yullo.services.entities.service import get_chat_fact_evidence


@pytest.fixture
def retrieve_for():
    def bind(db, backend):
        image_config = get_chat_image_config()
        return partial(
            retrieve_evidence, backend=backend, load_sources=partial(load_chat_sources, db),
            load_facts=partial(get_chat_fact_evidence, db),
            attach_assets=partial(attach_source_assets, config=image_config,
                                 images_for_source=partial(source_images, config=image_config),
                                 doc_id_for_source=published_doc_id, asset_visible=public_source_asset),
            config=get_knowledge_features(), evidence_factory=RetrievedContext,
        )
    return bind
