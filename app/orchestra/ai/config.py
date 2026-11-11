"""Central Orchestra configuration.

Environment values/secrets remain in app.config.settings and are read lazily.
Runtime, ingestion and chunk objects support per-call overrides. Provider
resolvers return fresh dictionaries; no provider clients are created here.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
import os
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, TypedDict

import structlog
from app.core.llm_provider import resolve_provider_order

logger = structlog.get_logger()
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Runtime

@dataclass
class OrchestraConfig:
    """Runtime configuration shared by Orchestra and its Agno implementation."""

    # LLM
    llm_provider: str   = "openai"       # openai | anthropic | watsonx
    llm_model:    str   = "gpt-4o-mini"
    temperature:  float = 0.4
    max_tokens:   int   = 500

    # RAG / Knowledge
    rag_enabled:        bool = True
    rag_top_k:          int  = 12

    rag_backend:        str  = "vectorstore"   # legacy standalone-runner configuration
    knowledge_backend:  str  = "agno_chroma"   # agno_chroma | none  (add new backends in knowledge/factory.py)
    chroma_path:        str  = ".chroma_db"
    chroma_collection:  str  = "client_documents"

    # Memory
    memory_enabled:      bool = False
    memory_provider:     str  = "mem0"   # mem0 | redis (future)
    memory_search_limit: int  = 5

    # Tools
    tools_enabled: bool = False
    inference_tool_call_limit: int = 4

    # Session
    session_ttl_seconds: int = 1800      # 30 minutes idle before eviction

    # Misc
    debug:    bool = False
    markdown: bool = False

    # Team routing
    team_mode:              str  = "route"       # route | coordinate
    triage_model:           str  = "gpt-4o-mini" # cheap model for routing
    show_members_responses: bool = False

    # Chain-of-thought: "" = off (default), low|medium|high = on, from the
    # REASONING_EFFORT env var. Per-chatbot and per-agent overrides build on
    # this via dataclasses.replace / LLMFactory.build kwargs — see
    # ResolvedAgent.llm_model / reasoning_effort.
    reasoning_effort: str = ""

    # Providers to build as Agno fallback_models, in priority order, after
    # llm_provider (the primary). Populated by build_config() from
    # LLM_PROVIDER_PRIORITY — whichever configured providers aren't chosen as
    # primary become the fallback chain, so a live failure on the primary
    # (rate limit, timeout, 5xx) retries through the next one automatically.
    # See inference/factories/llm.py LLMFactory.build_models().
    llm_fallback_providers: List[str] = field(default_factory=list)

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
) -> OrchestraConfig:
    """
    Build OrchestraConfig from app settings (.env via pydantic-settings).
    Pass standalone=True to read directly from os.environ (no DB/Settings needed).
    Per-call overrides applied on top.

    Provider order is config-driven via LLM_PROVIDER_PRIORITY (default
    "openai,openrouter,anthropic,watsonx"): the first entry with a configured
    API key is PRIMARY; every other configured entry after it, in the same
    order, becomes cfg.llm_fallback_providers — the live-retry chain Agno
    falls back through on a rate limit/timeout/5xx (see
    LLMFactory.build_models() in inference/factories/llm.py).
    """
    if standalone:
        get = os.environ.get
    else:
        from app.config import settings
        get = lambda k, d=None: getattr(settings, k, d)

    _KEY_SETTINGS = {
        "openai":     "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "anthropic":  "ANTHROPIC_API_KEY",
        "watsonx":    "WATSONX_API_KEY",
        "fireworks":  "FIREWORKS_API_KEY",
        "together":   "TOGETHER_API_KEY",
        "anyscale":   "ANYSCALE_API_KEY",
        "modal":      "MODAL_BASE_URL",
    }
    _MODEL_SETTINGS = {
        "openai":     ("OPENAI_MODEL", "gpt-4o-mini"),
        "openrouter": ("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
        "anthropic":  ("ANTHROPIC_MODEL", "claude-3-haiku-20240307"),
        "watsonx":    ("WATSONX_MODEL", "ibm/granite-13b-chat-v2"),
        "fireworks":  ("FIREWORKS_MODEL", None),
        "together":   ("TOGETHER_MODEL", "meta-llama/Meta-Llama-3-70B-Instruct-Turbo"),
        "anyscale":   ("ANYSCALE_MODEL", None),
        "modal":      ("MODAL_MODEL", None),
    }

    priority_raw = get("LLM_PROVIDER_PRIORITY") or "openai,openrouter,anthropic,watsonx"
    available = resolve_provider_order(
        (p for p, key in _KEY_SETTINGS.items() if get(key)
         and (p != "modal" or get("MODAL_MODEL"))
         and (p != "watsonx" or (get("WATSONX_URL") and get("WATSONX_PROJECT_ID")))),
        priority_raw,
    )

    if available:
        provider = available[0]
        model_setting, model_default = _MODEL_SETTINGS[provider]
        model = get(model_setting) or model_default
        fallback_providers = available[1:]
    elif standalone:
        raise SystemExit(
            "\n  No API key found. Set one of (in LLM_PROVIDER_PRIORITY order):\n"
            "    OPENAI_API_KEY\n"
            "    OPENROUTER_API_KEY\n"
            "    ANTHROPIC_API_KEY\n"
            "    WATSONX_API_KEY\n"
            "  in your .env file.\n"
        )
    else:
        provider, model, fallback_providers = "openai", "gpt-4o-mini", []

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

    return OrchestraConfig(
        inference_tool_call_limit = int(get("INFERENCE_TOOL_CALL_LIMIT") or 4),
        llm_provider           = provider,
        llm_model              = model,
        llm_fallback_providers = fallback_providers,
        triage_model = "gpt-4o-mini",
        temperature  = temperature if temperature is not None else float(get("OPENAI_TEMPERATURE") or 0.4),
        max_tokens   = max_tokens  if max_tokens  is not None else int(get("OPENAI_MAX_TOKENS") or 500),

        rag_enabled        = rag_backend != "none",
        rag_top_k          = rag_top_k if rag_top_k is not None else int(get("RAG_TOP_K") or 5),
        rag_backend        = rag_backend,
        knowledge_backend  = knowledge_backend,
        chroma_path        = get("CHROMA_PERSIST_DIR") or get("MEM0_CHROMA_PATH") or ".chroma_db",
        chroma_collection  = "client_documents",

        memory_enabled      = False if standalone else bool(get("MEM0_ENABLED") or False),
        memory_provider     = "mem0",
        memory_search_limit = int(get("MEM0_SEARCH_LIMIT") or 5),
        mem0_llm_provider   = get("MEM0_LLM_PROVIDER") or "openai",
        mem0_llm_model      = get("MEM0_LLM_MODEL") or "gpt-4o-mini",
        mem0_vector_store   = get("MEM0_VECTOR_STORE") or "memory",
        mem0_collection     = get("MEM0_COLLECTION") or "agent_memory",

        team_mode           = get("TEAM_MODE") or "route",
        tools_enabled       = False if standalone else _flag(get("AGNO_TOOLS_ENABLED"), True),
        mcp_enabled         = False,
        session_ttl_seconds = 1800,
        reasoning_effort    = (get("REASONING_EFFORT") or "").strip().lower(),

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

# Ingestion and parser routing

class ParserEntry(TypedDict, total=False):
    parser:   str            # primary parser class name (required)
    fallback: Optional[str]  # fallback class name if primary fails
    module:   str            # dotted module path — only this module is imported


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()

def _bool(key: str, default: bool = True) -> bool:
    v = _env(key)
    if not v:
        return default
    return v.lower() in ("1", "true", "yes", "on")

def _int(key: str, default: int = 0) -> int:
    v = _env(key)
    try:
        return int(v) if v else default
    except ValueError:
        return default

def _list(key: str, default: List[str] = None) -> List[str]:
    v = _env(key)
    if not v:
        return default or []
    return [x.strip() for x in v.split(",") if x.strip()]


# ── Parser routing table ──────────────────────────────────────────────────────
# Value is a list of parser class names tried in order (primary → fallbacks).
# To swap primary: change index 0.
# To add a fallback: append to the list.
# To add a new format: one new key + new parser file.
#
# Class names are resolved lazily by the registry (avoids circular imports).

_PKG = "app.orchestra.ai.ingestion.parsers"

PARSER_MAP: Dict[str, ParserEntry] = {
    # ── PDF ───────────────────────────────────────────────────────────────────
    ".pdf":   {"parser": "PdfParser",    "fallback": "ImageParser", "module": f"{_PKG}.pdf_parser"},
    ".docx":  {"parser": "DocxParser",                              "module": f"{_PKG}.docx_parser"},
    ".doc":   {"parser": "DocxParser",   "fallback": "ImageParser", "module": f"{_PKG}.docx_parser"},
    ".xlsx":  {"parser": "XlsxParser",                              "module": f"{_PKG}.xlsx_parser"},
    ".xls":   {"parser": "XlsxParser",                              "module": f"{_PKG}.xlsx_parser"},
    ".pptx":  {"parser": "PptxParser",                              "module": f"{_PKG}.pptx_parser"},
    ".ppt":   {"parser": "PptxParser",   "fallback": "ImageParser", "module": f"{_PKG}.pptx_parser"},
    ".png":   {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".jpg":   {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".jpeg":  {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".webp":  {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".txt":   {"parser": "TextParser",                              "module": f"{_PKG}.text_parser"},
    ".md":    {"parser": "TextParser",                              "module": f"{_PKG}.text_parser"},
    ".rst":   {"parser": "TextParser",                              "module": f"{_PKG}.text_parser"},
    ".html":  {"parser": "HtmlParser",                              "module": f"{_PKG}.html_parser"},
    ".htm":   {"parser": "HtmlParser",                              "module": f"{_PKG}.html_parser"},
    ".json":  {"parser": "JsonCsvParser",                           "module": f"{_PKG}.json_csv_parser"},
    ".jsonl": {"parser": "JsonCsvParser",                           "module": f"{_PKG}.json_csv_parser"},
    ".csv":   {"parser": "JsonCsvParser",                           "module": f"{_PKG}.json_csv_parser"},
}
# Fallbacks that live in a different module than the primary parser
_FALLBACK_MODULES: Dict[str, str] = {
    "ImageParser":  f"{_PKG}.image_parser",
    "PyPdfParser":  f"{_PKG}.pypdf_parser",
}


@dataclass
class IngestionConfig:
    # ── Parser routing ────────────────────────────────────────────────────────
    # Each value is a list: [primary, fallback1, fallback2, ...].
    # Registry walks the chain and uses the first parser that loads successfully.
    parser_map: Dict[str, ParserEntry] = field(
        default_factory=lambda: {k: dict(v) for k, v in PARSER_MAP.items()}
    )

    # ── Enabled extensions ────────────────────────────────────────────────────
    # Subset of parser_map keys that are active.
    enabled_extensions: List[str] = field(default_factory=lambda: list(PARSER_MAP.keys()))

    # ── Vision ────────────────────────────────────────────────────────────────
    vision_enabled:    bool = True
    vision_model:      str  = "gpt-4o-mini"
    vision_max_tokens: int  = 2000
    vision_dpi:        int  = 200
    vision_prompt:     str  = (
        "Extract all text content from this document page. "
        "For tables, preserve the structure using | separators with a header row. "
        "Prefix each table with its title or section name if visible. "
        "Return plain text only."
    )
    # "skip"  — log warning and continue when a vision call fails
    # "raise" — propagate exception and fail the upload
    vision_on_error: str = "skip"

    # ── PDF ───────────────────────────────────────────────────────────────────
    pdf_table_aware:              bool = True
    # Reconstruct strongly aligned, borderless column tables into atomic rows.
    # Slide decks commonly draw tables as independent text boxes, which the
    # ruled-line detector cannot see and plain text extraction can misorder.
    pdf_borderless_column_tables: bool = True
    pdf_heading_detection:        bool = True
    pdf_min_text_chars:           int  = 20       # below this → treat page as scanned
    pdf_embedded_image_min_area:  int  = 10_000   # px² — skip logos/icons below this
    # Above this many image blocks on ONE page, the page is a decomposed graphic
    # rather than a page carrying figures, and its images are skipped.
    #
    # A cover page is often stored as one artwork sliced into many tiles. Measured
    # on the 57-page SBI MITC: 190 of its image blocks sat on exactly two pages —
    # the cover (34 chars of text, 95 images) and the back cover (336 chars, 95
    # images) — and 138 of them survived every existing filter, because an
    # individual tile is high-variance and byte-unique so it looks like content to
    # both the decorative check and the dedup cache. Captioning 95 fragments of
    # one graphic yields noise, not content, and cost 138 vision calls: >6 minutes
    # against 12.7s with vision off.
    #
    # A genuine figure-heavy page carries a handful of images, not dozens.
    pdf_max_images_per_page:      int  = 12
    # Pages a section label may run without a new heading before it's treated as
    # a heading-detection miss and cleared. Legal/policy documents routinely
    # carry one "TERMS & CONDITIONS" heading over dozens of pages, so this has
    # to be generous or correct labels get thrown away (see pdf_parser).
    pdf_stale_section_pages:      int  = 40

    # ── LibreOffice (legacy .doc / .ppt / .xls) ──────────────────────────────
    libreoffice_enabled: bool = True
    libreoffice_path:    str  = "soffice"

    # ── Chunking overrides (0 = use chunking.py defaults) ─────────────────────
    chunk_size_pdf:    int = 0
    chunk_size_office: int = 0
    chunk_size_sheet:  int = 0
    chunk_overlap:     int = 0

    # ── Structured fact extraction ───────────────────────────────────────────
    # Facts are extracted after indexing. These limits control coverage and
    # model output without coupling the extractor to one provider or document.
    fact_batch_chunks:     int = 25
    fact_batch_characters: int = 12_000
    fact_max_output_tokens: int = 4_000


def build_ingestion_config() -> IngestionConfig:
    """Build IngestionConfig from environment variables."""
    cfg = IngestionConfig(
        vision_enabled     = _bool("INGESTION_VISION_ENABLED",      True),
        vision_model       = _env ("INGESTION_VISION_MODEL",         "gpt-4o-mini"),
        vision_max_tokens  = _int ("INGESTION_VISION_MAX_TOKENS",    2000),
        vision_dpi         = _int ("INGESTION_VISION_DPI",           200),
        vision_prompt      = _env ("INGESTION_VISION_PROMPT") or IngestionConfig.vision_prompt,
        vision_on_error    = _env ("INGESTION_VISION_ON_ERROR",      "skip"),

        pdf_table_aware             = _bool("INGESTION_PDF_TABLE_AWARE",             True),
        pdf_borderless_column_tables = _bool("INGESTION_PDF_BORDERLESS_COLUMN_TABLES", True),
        pdf_heading_detection       = _bool("INGESTION_PDF_HEADING_DETECTION",       True),
        pdf_min_text_chars          = _int ("INGESTION_PDF_MIN_TEXT_CHARS",          20),
        pdf_embedded_image_min_area = _int ("INGESTION_PDF_EMBEDDED_IMAGE_MIN_AREA", 10_000),
        pdf_max_images_per_page     = _int ("INGESTION_PDF_MAX_IMAGES_PER_PAGE", 12),
        pdf_stale_section_pages     = _int ("INGESTION_PDF_STALE_SECTION_PAGES",      40),

        libreoffice_enabled = _bool("INGESTION_LIBREOFFICE_ENABLED", True),
        libreoffice_path    = _env ("INGESTION_LIBREOFFICE_PATH",     "soffice"),

        chunk_size_pdf    = _int("INGESTION_CHUNK_SIZE_PDF",    0),
        chunk_size_office = _int("INGESTION_CHUNK_SIZE_OFFICE", 0),
        chunk_size_sheet  = _int("INGESTION_CHUNK_SIZE_SHEET",  0),
        chunk_overlap     = _int("INGESTION_CHUNK_OVERLAP",     0),

        fact_batch_chunks      = _int("INGESTION_FACT_BATCH_CHUNKS",      25),
        fact_batch_characters  = _int("INGESTION_FACT_BATCH_CHARACTERS",  12_000),
        fact_max_output_tokens = _int("INGESTION_FACT_MAX_OUTPUT_TOKENS", 4_000),
    )

    exts = _list("INGESTION_ENABLED_EXTENSIONS")
    if exts:
        cfg.enabled_extensions = [e for e in exts if e in cfg.parser_map]

    return cfg

# Chunking

class ChunkStrategy(str, Enum):
    RECURSIVE       = "recursive"
    BY_STRUCTURE    = "by_structure"
    PER_PAGE_ATOMIC = "per_page_atomic"
    SPREADSHEET     = "spreadsheet"
    LINE_ATOMIC     = "line_atomic"
    MARKDOWN_BLOCKS = "markdown_blocks"


@dataclass
class ChunkConfig:
    strategy:            ChunkStrategy = ChunkStrategy.RECURSIVE
    chunk_size:          int  = 1000
    overlap:             int  = 150
    min_chunk_size:      int  = 80  # preferred floor; never discard source content
    keep_section_header: bool = True
    # When True, bakes "filename > section:" into the embedded chunk text. Off by
    # default: the constant filename prefix biases every vector of a document
    # toward each other and creates query/chunk asymmetry (queries carry no
    # prefix). filename + section already live in chunk metadata, so context is
    # reconstructed at prompt-assembly time instead (see context_enriched.py).
    context_enriched:    bool = False
    max_tokens:          int = 512
    tokenizer_name:      str = "cl100k_base"
    table_caption_mode:  str | None = None

    # Emit per-row chunks for tables in addition to the whole-table chunk, so a
    # lookup row is retrievable without dragging its twenty neighbours along.
    # See table_rows.py for why granularity is driven by column count.
    table_row_chunks:    bool = True
    table_row_max:       int  = 200   # above this, emit grouped rows instead
    table_row_wide_cols: int  = 4     # more columns than this -> group rows
    table_row_group:     int  = 10    # rows per group when grouping
    min_tokens:          int = 0  # preferred sibling merge floor; never discard short content
    target_tokens:       int = 0  # zero preserves existing non-web grouping
    orphan_tokens:       int = 0  # attach short unlinked tails; never discard facts

    def __post_init__(self):
        if self.chunk_size < 0 or self.overlap < 0 or self.min_chunk_size < 0:
            raise ValueError("Chunk sizes and overlap must be nonnegative")
        if self.chunk_size and self.overlap >= self.chunk_size:
            raise ValueError("Chunk overlap must be smaller than chunk_size")
        if self.max_tokens < 8 or not self.tokenizer_name.strip():
            raise ValueError("Chunking requires at least eight tokens and a tokenizer")
        if not 0 <= self.min_tokens <= self.target_tokens <= self.max_tokens:
            raise ValueError("Chunk token limits require 0 <= minimum <= target <= maximum")
        if not 0 <= self.orphan_tokens <= self.max_tokens:
            raise ValueError('Orphan token limit must fit the maximum token budget')
        if min(self.table_row_max, self.table_row_wide_cols, self.table_row_group) < 1:
            raise ValueError("Table chunking limits must be positive")
        if self.table_caption_mode not in (None, "heuristic", "llm", "none"):
            raise ValueError("Invalid table caption mode")


# ── Shared presets ────────────────────────────────────────────────────────────

_STRUCT_WIDE  = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE,    chunk_size=1200, overlap=120, min_chunk_size=80)
_STRUCT_MED   = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE,    chunk_size=1000, overlap=100, min_chunk_size=60)
_STRUCT_SMALL = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE,    chunk_size=900,  overlap=100, min_chunk_size=60)
_REC_TXT      = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,       chunk_size=900,  overlap=120, min_chunk_size=60)
_REC_JSON     = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,       chunk_size=800,  overlap=80,  min_chunk_size=40)
_SHEET        = ChunkConfig(strategy=ChunkStrategy.SPREADSHEET,     chunk_size=800,  overlap=0,   min_chunk_size=0)
_SHEET_SMALL  = ChunkConfig(strategy=ChunkStrategy.SPREADSHEET,     chunk_size=600,  overlap=0,   min_chunk_size=0)
_ATOMIC       = ChunkConfig(strategy=ChunkStrategy.PER_PAGE_ATOMIC, chunk_size=2000, overlap=0,   min_chunk_size=0)
_LINE         = ChunkConfig(strategy=ChunkStrategy.LINE_ATOMIC,     chunk_size=0,    overlap=0,   min_chunk_size=0)
_MARKDOWN     = ChunkConfig(
    strategy=ChunkStrategy.MARKDOWN_BLOCKS,
    chunk_size=900,
    overlap=80,
    min_chunk_size=40,
    context_enriched=False,
)

EXTENSION_CONFIG: Dict[str, ChunkConfig] = {
    # Structured documents
    ".pdf":  _STRUCT_WIDE,
    ".docx": _STRUCT_WIDE,   ".doc":  _STRUCT_WIDE,
    ".pptx": _STRUCT_MED,    ".ppt":  _STRUCT_MED,
    ".html": _STRUCT_MED,    ".htm":  _STRUCT_MED,
    ".md":   _MARKDOWN,      ".rst":  _STRUCT_SMALL,
    # Spreadsheets — header repeated in every chunk
    ".xlsx": _SHEET,   ".xls":  _SHEET,
    ".csv":  _SHEET_SMALL,
    # Images / vision output — one page = one chunk
    ".png":  _ATOMIC,  ".jpg":  _ATOMIC,  ".jpeg": _ATOMIC,  ".webp": _ATOMIC,
    # Line-delimited JSON
    ".jsonl": _LINE,
    # Flat text
    ".txt":  _REC_TXT,
    ".json": _REC_JSON,
}

_DEFAULT_CONFIG = _REC_TXT


def get_chunk_config(filename: str, extension_config=None) -> ChunkConfig:
    ext = Path(filename).suffix.lower()
    cfg = (EXTENSION_CONFIG if extension_config is None else extension_config).get(ext, _DEFAULT_CONFIG)
    # Resolve existing ingestion overrides here so direct chunking, jobs and
    # demos use the same settings without mutating shared extension presets.
    size_key = (
        "INGESTION_CHUNK_SIZE_PDF" if ext == ".pdf" else
        "INGESTION_CHUNK_SIZE_SHEET" if ext in (".xlsx", ".xls", ".csv") else
        "INGESTION_CHUNK_SIZE_OFFICE" if ext in (".doc", ".docx", ".ppt", ".pptx") else None
    )
    overrides = {}
    if size_key and os.getenv(size_key):
        value = int(os.environ[size_key])
        if value < 0:
            raise ValueError(f"{size_key} must be nonnegative")
        if value:
            overrides["chunk_size"] = value
    for key, field_name in (
        ("INGESTION_CHUNK_OVERLAP", "overlap"),
        ("INGESTION_CHUNK_MAX_TOKENS", "max_tokens"),
    ):
        if os.getenv(key) is not None:
            overrides[field_name] = int(os.environ[key])
    if os.getenv("INGESTION_CHUNK_TOKENIZER"):
        overrides["tokenizer_name"] = os.environ["INGESTION_CHUNK_TOKENIZER"]
    cfg = replace(cfg, **overrides)
    logger.debug("chunk_config", filename=filename, ext=ext, strategy=cfg.strategy.value)
    return cfg

def get_web_chunk_config(filename: str) -> ChunkConfig:
    """Token-based web budgets without changing uploaded document presets."""
    cfg = get_chunk_config(filename)
    if Path(filename).suffix.lower() not in ('.html', '.htm', '.md'):
        return cfg
    maximum = int(os.getenv("INGESTION_WEB_MAX_TOKENS", os.getenv("INGESTION_CHUNK_MAX_TOKENS", "600")))
    target = int(os.getenv("INGESTION_WEB_TARGET_TOKENS", str(min(500, maximum))))
    cfg = replace(
        cfg, chunk_size=0,
        min_tokens=int(os.getenv("INGESTION_WEB_MIN_TOKENS", str(min(200, target)))),
        target_tokens=target, max_tokens=maximum,
        orphan_tokens=int(os.getenv('INGESTION_WEB_ORPHAN_TOKENS', str(min(40, maximum)))),
    )
    logger.info('chunk_config.web', minimum=cfg.min_tokens, target=cfg.target_tokens,
                maximum=cfg.max_tokens, orphan=cfg.orphan_tokens, strategy=cfg.strategy.value)
    return cfg


# Embedding
def get_embedding_config() -> dict[str, Any]:
    from app.config import settings

    if (settings.EMBEDDING_PROVIDER or "openai").lower() == "openrouter":
        # EMBEDDING_MODEL stays the bare OpenAI id so switching providers never
        # changes which model — and therefore which vector space — you are on.
        # OpenRouter addresses models as "<provider>/<model>", so add the
        # prefix here rather than making every deployment edit the model name
        # (and risk it drifting out of sync with EMBEDDING_DIMENSION).
        model = settings.EMBEDDING_MODEL
        if "/" not in model:
            model = f"openai/{model}"
        return dict(
            model=model,
            dimensions=settings.EMBEDDING_DIMENSION,
            api_key=settings.OPENROUTER_API_KEY,
            base_url=OPENROUTER_BASE_URL,
        )

    return dict(
        model=settings.EMBEDDING_MODEL,
        dimensions=settings.EMBEDDING_DIMENSION,
        api_key=settings.OPENAI_API_KEY,
        base_url=None,
    )

# Retrieval

def get_retrieval_config() -> dict[str, Any]:
    from app.config import settings
    return dict(
        max_candidates=settings.RAG_HYBRID_MAX_CANDIDATES,
        max_terms=settings.RAG_HYBRID_MAX_TERMS,
    )

# Reranking

def get_reranker_config() -> dict[str, Any]:
    from app.config import settings
    return dict(
        enabled=settings.RERANK_ENABLED,
        provider=(settings.RERANK_PROVIDER or "none").strip().lower(),
        model=(settings.RERANK_MODEL or "").strip(),
        top_n=settings.RERANK_TOP_N,
        api_key=settings.COHERE_API_KEY,
    )

# Scraping

def get_scraper_config(mode: Literal["quick", "deep"] = "quick") -> dict[str, Any]:
    from app.config import settings

    if mode == "deep":
        provider = (settings.SCRAPER_DEEP_PROVIDER or "").strip().lower()
        timeout_s = settings.SCRAPER_DEEP_TIMEOUT_S
    else:
        provider = (
            settings.SCRAPER_QUICK_PROVIDER
            or settings.SCRAPER_PROVIDER
            or "httpx"
        ).strip().lower()

        timeout_s = settings.SCRAPER_TIMEOUT_S

    return dict(
        provider=provider,
        timeout_s=timeout_s,
        max_bytes=settings.SCRAPER_MAX_BYTES,
        user_agent=settings.SCRAPER_USER_AGENT,
        max_redirects=settings.SCRAPER_MAX_REDIRECTS,
        allow_private_hosts=settings.SCRAPER_ALLOW_PRIVATE_HOSTS,
    )
