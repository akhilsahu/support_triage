"""Yullo knowledge feature switches and bounded chat context settings."""
import os
from pydantic import BaseModel, Field


class ChatImageConfig(BaseModel):
    max_context_images: int = Field(default=6, ge=1, le=12)
    max_gallery_images: int = Field(default=4, ge=1, le=4)
    max_caption_characters: int = Field(default=400, ge=50, le=1000)


def get_chat_image_config():
    return ChatImageConfig(
        max_context_images=os.getenv('YULLO_CHAT_MAX_CONTEXT_IMAGES', '6'),
        max_gallery_images=os.getenv('YULLO_CHAT_MAX_GALLERY_IMAGES', '4'),
        max_caption_characters=os.getenv('YULLO_CHAT_MAX_IMAGE_CAPTION_CHARACTERS', '400'),
    )


class KnowledgeFeatureConfig(BaseModel):
    # Commenting an enabled line in get_knowledge_features disables that feature.
    facts_enabled: bool = False
    chunks_enabled: bool = False
    continuations_enabled: bool = False
    ingestion_facts_enabled: bool = False
    ingestion_entities_enabled: bool = False
    max_expansion_chunks: int = Field(default=2, ge=1, le=4)
    max_expansion_tokens: int = Field(default=2048, ge=128, le=8192)
    max_record_tokens: int = Field(default=2048, ge=128, le=8192)
    embedding_cache_seconds: int = Field(default=3600, ge=60, le=86400)


def get_knowledge_features() -> KnowledgeFeatureConfig:
    """Single switchboard for Yullo chat retrieval and ingestion extraction.

    Comment one enabled line below to disable it, or set its environment variable
    to false. Chunk indexing remains required by ingestion. Entity extraction also
    respects the existing YULLO_ENTITY_EXTRACTION_ENABLED master setting.
    """
    return KnowledgeFeatureConfig(
        facts_enabled=os.getenv('YULLO_CHAT_FACTS_ENABLED', 'true'),
        chunks_enabled=os.getenv('YULLO_CHAT_CHUNKS_ENABLED', 'true'),
        continuations_enabled=os.getenv('YULLO_CHAT_CONTINUATIONS_ENABLED', 'true'),
        ingestion_facts_enabled=os.getenv('YULLO_INGESTION_FACTS_ENABLED', 'true'),
        ingestion_entities_enabled=os.getenv('YULLO_INGESTION_ENTITIES_ENABLED', 'true'),
        max_expansion_chunks=os.getenv('YULLO_CHAT_MAX_EXPANSION_CHUNKS', '2'),
        max_expansion_tokens=os.getenv('YULLO_CHAT_MAX_EXPANSION_TOKENS', '2048'),
        max_record_tokens=os.getenv('YULLO_CHAT_MAX_RECORD_TOKENS', '2048'),
        embedding_cache_seconds=os.getenv('YULLO_CHAT_EMBEDDING_CACHE_SECONDS', '3600'),
    )


def get_source_extraction_options(*, features=None) -> dict:
    """Resolve product extraction policy once; shared mechanics receive only these options."""
    from app.config import settings
    from app.orchestra.ai.knowledge.extraction.facts.extractor import _SYSTEM
    from app.orchestra.ai.prompts.yullo.entities import SOURCE_KNOWLEDGE_SYSTEM_PROMPT
    from app.yullo.services.entities.extraction import validate_entity_candidate

    features = features if features is not None else get_knowledge_features()
    return dict(
        facts_enabled=features.ingestion_facts_enabled,
        entities_enabled=features.ingestion_entities_enabled and settings.YULLO_ENTITY_EXTRACTION_ENABLED,
        batch_characters=settings.YULLO_KNOWLEDGE_BATCH_CHARACTERS,
        batch_chunks=settings.YULLO_KNOWLEDGE_BATCH_CHUNKS,
        model=settings.YULLO_KNOWLEDGE_MODEL,
        max_tokens=settings.YULLO_KNOWLEDGE_MAX_OUTPUT_TOKENS,
        timeout=settings.YULLO_KNOWLEDGE_TIMEOUT_SECONDS,
        prompt=_SYSTEM + '\n' + SOURCE_KNOWLEDGE_SYSTEM_PROMPT,
        validate_entity=validate_entity_candidate,
    )


def get_chat_model_config():
    """Override Aura model settings without changing shared provider priority."""
    from dataclasses import replace
    from app.config import settings
    from app.orchestra.ai.config import build_config

    model = settings.YULLO_CHAT_MODEL.strip()
    if not model:
        raise ValueError('Aura chat model must not be empty')
    return replace(build_config(), llm_model=model,
                   reasoning_effort=settings.YULLO_CHAT_REASONING_EFFORT,
                   max_tokens=settings.YULLO_CHAT_MAX_OUTPUT_TOKENS)


class EventListingConfig(BaseModel):
    enabled: bool = True
    max_results: int = Field(default=10, ge=1, le=20)
    max_candidates: int = Field(default=50, ge=20, le=100)


def get_event_listing_config() -> EventListingConfig:
    return EventListingConfig(
        enabled=os.getenv('YULLO_EVENT_LISTING_ENABLED', 'true'),
        max_results=os.getenv('YULLO_EVENT_LISTING_MAX_RESULTS', '10'),
        max_candidates=os.getenv('YULLO_EVENT_LISTING_MAX_CANDIDATES', '50'),
    )
