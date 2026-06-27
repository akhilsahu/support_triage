"""
mem0 memory layer — conversational context for RAG query reformulation.

Controlled entirely by config:
  MEM0_ENABLED      — feature flag (default off)
  MEM0_LLM_PROVIDER — openai | anthropic
  MEM0_LLM_MODEL    — model for rewrite pass (cheap, e.g. gpt-4o-mini)
  MEM0_VECTOR_STORE — chroma | memory
  MEM0_COLLECTION   — chroma collection name
  MEM0_CHROMA_PATH  — chroma persist dir (reuses RAG dir by default)

Returns None when disabled — callers guard with `if mem0:`.
"""

from __future__ import annotations
import structlog
from app.config import settings

logger = structlog.get_logger()


def build_mem0():
    if not settings.MEM0_ENABLED:
        return None

    try:
        from mem0 import Memory
    except ImportError:
        logger.warning("mem0 not installed — pip install mem0ai")
        return None

    llm_configs = {
        "openai": {
            "provider": "openai",
            "config": {
                "api_key": settings.OPENAI_API_KEY,
                "model":   settings.MEM0_LLM_MODEL,
            },
        },
        "anthropic": {
            "provider": "anthropic",
            "config": {
                "api_key": settings.ANTHROPIC_API_KEY,
                "model":   settings.MEM0_LLM_MODEL,
            },
        },
    }

    vector_configs = {
        "chroma": {
            "provider": "chroma",
            "config": {
                "collection_name": settings.MEM0_COLLECTION,
                "path":            settings.MEM0_CHROMA_PATH,
            },
        },
        "memory": {
            "provider": "memory",
        },
    }

    config = {
        "llm":          llm_configs.get(settings.MEM0_LLM_PROVIDER, llm_configs["openai"]),
        "vector_store": vector_configs.get(settings.MEM0_VECTOR_STORE, vector_configs["memory"]),
    }

    try:
        instance = Memory.from_config(config)
        logger.info(
            "mem0 initialised",
            provider=settings.MEM0_LLM_PROVIDER,
            store=settings.MEM0_VECTOR_STORE,
        )
        return instance
    except Exception as e:
        logger.error("mem0 init failed", error=str(e))
        return None


mem0 = build_mem0()
