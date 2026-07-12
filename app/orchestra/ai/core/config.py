"""
Orchestra config — base + Agno-specific.

OrchestraConfig  — framework-agnostic base (all implementations share this)
AgnoConfig       — extends base with Agno-specific knobs
build_config()   — reads from app.config.Settings, returns AgnoConfig

Adding another framework later:
    @dataclass
    class LangChainConfig(OrchestraConfig): ...
    def build_langchain_config(...) -> LangChainConfig: ...
"""

from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class OrchestraConfig:
    """Framework-agnostic base config. All orchestrator implementations extend this."""

    # LLM
    llm_provider: str   = "openai"       # openai | anthropic | watsonx
    llm_model:    str   = "gpt-4o-mini"
    temperature:  float = 0.4
    max_tokens:   int   = 500

    # RAG / Knowledge
    rag_enabled:        bool = True
    rag_top_k:          int  = 5
    rag_backend:        str  = "vectorstore"   # legacy — kept for DynamicAgentExecutor compat
    knowledge_backend:  str  = "agno_chroma"   # agno_chroma | none  (add new backends in knowledge/factory.py)
    chroma_path:        str  = ".chroma_db"
    chroma_collection:  str  = "client_documents"
    embedding_model:    str  = "text-embedding-3-small"

    # Memory
    memory_enabled:      bool = False
    memory_provider:     str  = "mem0"   # mem0 | redis (future)
    memory_search_limit: int  = 5

    # Tools
    tools_enabled: bool = False

    # Session
    session_ttl_seconds: int = 1800      # 30 minutes idle before eviction

    # Misc
    debug:    bool = False
    markdown: bool = False


@dataclass
class AgnoConfig(OrchestraConfig):
    """Agno-specific config. All values sourced from .env via build_config()."""

    # Team routing
    team_mode:              str  = "route"       # route | coordinate
    triage_model:           str  = "gpt-4o-mini" # cheap model for routing
    show_members_responses: bool = False

    # MCP tools
    mcp_enabled: bool = False

    # mem0 memory backend
    mem0_llm_provider: str = "openai"
    mem0_llm_model:    str = "gpt-4o-mini"
    mem0_vector_store: str = "memory"            # memory | chroma
    mem0_collection:   str = "agent_memory"

    # ── Agno-native session store (backs history / user-memory / summaries) ──
    # One db object; nothing native works without it. Lives on its own Postgres
    # database (separate from the app DB) so Agno's auto-created tables never
    # collide with Alembic-managed app tables.
    session_store:             str  = "postgres"   # postgres | sqlite | none
    session_db_url:            str  = ""            # separate DB; blank when store=none
    session_db_schema:         str  = "public"
    # History (conversation turns injected into context)
    history_enabled:           bool = True
    num_history_runs:          int  = 5
    # User memory (activates the Agno MemoryManager; write via update_memory_on_run)
    user_memories_enabled:     bool = True
    # Rolling session summary (condenses long chats so num_history_runs stays small)
    session_summaries_enabled: bool = True
    # Reliable RAG grounding — always inject retrieved references, not agentic-only
    add_knowledge_to_context:  bool = True


def _swap_db_name(url: str, new_name: str) -> str:
    """Return `url` with its database name replaced (keeps any ?query)."""
    if not url:
        return url
    base, _, query = url.partition("?")
    base = base.rsplit("/", 1)[0] + "/" + new_name
    return base + (("?" + query) if query else "")


def _flag(value, default: bool) -> bool:
    """Coerce an env/setting value (str | bool | None) to bool; None → default."""
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def build_config(
    temperature: Optional[float] = None,
    max_tokens:  Optional[int]   = None,
    rag_top_k:   Optional[int]   = None,
    debug:       Optional[bool]  = None,
    standalone:  bool            = False,
) -> AgnoConfig:
    """
    Build AgnoConfig from app settings (.env via pydantic-settings).
    Pass standalone=True to read directly from os.environ (no DB/Settings needed).
    Per-call overrides applied on top.

    Provider priority: openai → watsonx → anthropic
    """
    if standalone:
        get = os.environ.get
    else:
        from app.config import settings
        get = lambda k, d=None: getattr(settings, k, d)

    if get("OPENAI_API_KEY"):
        provider, model = "openai", get("OPENAI_MODEL") or "gpt-4o-mini"
    elif get("WATSONX_API_KEY"):
        provider, model = "watsonx", get("WATSONX_MODEL") or "ibm/granite-13b-chat-v2"
    elif get("ANTHROPIC_API_KEY"):
        provider, model = "anthropic", get("ANTHROPIC_MODEL") or "claude-3-haiku-20240307"
    elif standalone:
        raise SystemExit(
            "\n  No API key found. Set one of:\n"
            "    OPENAI_API_KEY\n"
            "    ANTHROPIC_API_KEY\n"
            "    WATSONX_API_KEY\n"
            "  in your .env file.\n"
        )
    else:
        provider, model = "openai", "gpt-4o-mini"

    rag_backend        = get("RAG_BACKEND")        or ("none" if standalone else "vectorstore")
    knowledge_backend  = get("KNOWLEDGE_BACKEND")  or ("none" if standalone else "agno_chroma")

    # ── Agno session store: its own Postgres database, derived from the app DB ──
    if standalone:
        # No app DB available — default to file-based sqlite (or explicit url).
        session_db_url = get("AGNO_SESSION_DB_URL") or ""
        session_store  = get("SESSION_STORE") or ("sqlite" if not session_db_url else "postgres")
    else:
        session_store  = get("SESSION_STORE") or "postgres"
        session_db_url = get("AGNO_SESSION_DB_URL") or _swap_db_name(
            get("database_url_sync") or "",
            get("AGNO_SESSION_DB_NAME") or "agno_sessions",
        )

    return AgnoConfig(
        llm_provider = provider,
        llm_model    = model,
        triage_model = "gpt-4o-mini",
        temperature  = temperature if temperature is not None else float(get("OPENAI_TEMPERATURE") or 0.4),
        max_tokens   = max_tokens  if max_tokens  is not None else int(get("OPENAI_MAX_TOKENS") or 500),

        rag_enabled        = rag_backend != "none",
        rag_top_k          = rag_top_k if rag_top_k is not None else int(get("RAG_TOP_K") or 5),
        rag_backend        = rag_backend,
        knowledge_backend  = knowledge_backend,
        chroma_path        = get("CHROMA_PERSIST_DIR") or get("MEM0_CHROMA_PATH") or ".chroma_db",
        chroma_collection  = "client_documents",
        embedding_model    = get("EMBEDDING_MODEL") or "text-embedding-3-small",

        memory_enabled      = False if standalone else bool(get("MEM0_ENABLED") or False),
        memory_provider     = "mem0",
        memory_search_limit = int(get("MEM0_SEARCH_LIMIT") or 5),
        mem0_llm_provider   = get("MEM0_LLM_PROVIDER") or "openai",
        mem0_llm_model      = get("MEM0_LLM_MODEL") or "gpt-4o-mini",
        mem0_vector_store   = get("MEM0_VECTOR_STORE") or "memory",
        mem0_collection     = get("MEM0_COLLECTION") or "agent_memory",

        team_mode           = get("TEAM_MODE") or "route",
        tools_enabled       = False,
        mcp_enabled         = False,
        session_ttl_seconds = 1800,

        # Agno-native session store + context features
        session_store             = session_store,
        session_db_url            = session_db_url,
        session_db_schema         = get("AGNO_SESSION_DB_SCHEMA") or "public",
        history_enabled           = _flag(get("HISTORY_ENABLED"), True),
        num_history_runs          = int(get("NUM_HISTORY_RUNS") or 5),
        user_memories_enabled     = _flag(get("USER_MEMORIES_ENABLED"), True),
        session_summaries_enabled = _flag(get("SESSION_SUMMARIES_ENABLED"), True),
        add_knowledge_to_context  = _flag(get("ADD_KNOWLEDGE_TO_CONTEXT"), True),

        debug    = debug if debug is not None else (
            (get("DEBUG") or "false").lower() == "true" if standalone
            else bool(get("DEBUG") or False)
        ),
        markdown = False,
    )
