"""Application configuration using Pydantic Settings"""

from typing import Annotated, List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
import json


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Application
    APP_NAME: str = "FastAPI Multi-Agent Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"

    # Datamuse Online Terms API
    DATAMUSE_API_URL: str = "https://api.datamuse.com/words"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    RELOAD: bool = False

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/multiagent"
    )
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_ECHO: bool = False

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 50
    REDIS_DECODE_RESPONSES: bool = True

    # Security
    SECRET_KEY: str = Field(default="change-this-secret-key-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"]
    )
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = Field(default=["*"])
    CORS_ALLOW_HEADERS: List[str] = Field(default=["*"])

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",")]
        return v

    # Reserved slugs — customer chat lives at /<slug>, so a space slug must not
    # collide with a frontend route or backend proxy prefix. Override via env:
    #   RESERVED_SLUGS=app,api,login,custom-word   (comma-separated or JSON list)
    RESERVED_SLUGS: Annotated[List[str], NoDecode] = Field(default=[
        "app", "s", "api", "org", "space",
        "about", "what-we-do", "how-it-works", "features", "pricing",
        "privacy", "terms", "cookies", "contact", "security",
        "login", "dashboard", "admin", "super-admin", "widget", "widget.js",
        "assets", "static", "index.html", "favicon.ico", "robots.txt",
    ])

    @field_validator("RESERVED_SLUGS", mode="before")
    @classmethod
    def parse_reserved_slugs(cls, v):
        if isinstance(v, str):
            try:
                items = json.loads(v)
            except json.JSONDecodeError:
                items = v.split(",")
        else:
            items = v or []
        # Normalize: trim + lowercase, drop blanks
        return [s.strip().lower() for s in items if s and s.strip()]

    # IBM watsonx.ai
    WATSONX_API_KEY: Optional[str] = None
    WATSONX_URL: Optional[str] = "https://us-south.ml.cloud.ibm.com"
    WATSONX_SPACE_ID: Optional[str] = None
    WATSONX_PROJECT_ID: Optional[str] = None
    WATSONX_MODEL: str = "ibm/granite-13b-chat-v2"

    # OpenAI
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TEMPERATURE: float = 0.7
    OPENAI_MAX_TOKENS: int = 2000

    # Together AI
    TOGETHER_API_KEY: Optional[str] = None
    TOGETHER_MODEL: Optional[str] = None

    # Fireworks AI
    FIREWORKS_API_KEY: Optional[str] = None
    FIREWORKS_MODEL: str = "accounts/fireworks/models/llama-v3p1-70b-instruct"

    # Anyscale
    ANYSCALE_API_KEY: Optional[str] = None
    ANYSCALE_MODEL: Optional[str] = None

    # Modal
    MODAL_API_KEY: Optional[str] = None
    MODAL_BASE_URL: Optional[str] = None
    MODAL_MODEL: Optional[str] = None

    # RAG Ingestion Contextual AI Enrichment
    ENABLE_CONTEXTUAL_ENRICHMENT: bool = True


    # OpenRouter — a single API key/endpoint that proxies many providers'
    # models (OpenAI, Anthropic, etc). Model id format is "<provider>/<model>",
    # not a bare OpenAI model id — see https://openrouter.ai/models
    # (e.g. "openai/gpt-4o-mini", "anthropic/claude-3-haiku").
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"

    # Ordered, comma-separated provider names — first one with a configured
    # API key becomes the PRIMARY provider; every other configured provider
    # after it becomes an automatic live-retry fallback (Agno's
    # fallback_models — see LLMFactory.build_fallbacks() in factories/llm.py).
    # Priority order for LLM routing. The app will try these in order
    # if a specific model isn't requested.
    LLM_PROVIDER_PRIORITY: str = "modal,fireworks,openai,openrouter,together,anthropic,watsonx,anyscale"
    
    # Optional override strictly for fact extraction model
    FACT_FINDER_MODEL: Optional[str] = None
    FACT_VERIFIER_MODEL: Optional[str] = None

    # Anthropic
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-3-opus-20240229"
    ANTHROPIC_TEMPERATURE: float = 0.7
    ANTHROPIC_MAX_TOKENS: int = 2000

    # Agent max_tokens policy
    # Per-agent max_tokens (custom_agents.max_tokens) is used by default. When
    # AGENT_MAX_TOKENS_OVERRIDE is True, AGENT_MAX_TOKENS_LIMIT is forced onto every
    # agent regardless of its own value. AGENT_MAX_TOKENS_LIMIT is also the fallback
    # when an agent has no max_tokens set.
    AGENT_MAX_TOKENS_OVERRIDE: bool = False
    AGENT_MAX_TOKENS_LIMIT: int = 2000

    # ChromaDB / RAG storage
    CHROMA_PERSIST_DIR: str = ".chroma_db"
    RAG_DOC_TTL_DAYS: int = 30

    # Embeddings
    # EMBEDDING_PROVIDER only changes HOW the model is reached, not WHICH model:
    # "openrouter" proxies to the same OpenAI model at the same dimensions, so
    # switching is a drop-in that keeps existing vectors valid. Unlike the chat
    # model there is no automatic fallback — a query embedding either succeeds
    # or search returns nothing, so this is a deliberate single choice.
    EMBEDDING_PROVIDER: str = "openai"      # openai | openrouter
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_DEVICE: str = "cpu"  # unused, kept for compat

    # URL scraping (pluggable) — see app/orchestra/ai/ingestion/scraper/.
    # SCRAPER_PROVIDER selects the fetch strategy; "httpx" is a plain HTTP GET
    # and does not run JavaScript, so client-rendered SPAs yield little text.
    SCRAPER_PROVIDER: str = "httpx"
    SCRAPER_TIMEOUT_S: int = 15
    SCRAPER_MAX_BYTES: int = 30 * 1024 * 1024      # 30 MB, matches MAX_UPLOAD_BYTES
    SCRAPER_MAX_REDIRECTS: int = 5
    SCRAPER_USER_AGENT: str = "SupportBot/1.0 (KB Indexer)"
    # SSRF guard. Leave False unless you deliberately index an internal wiki:
    # True lets a customer-supplied URL reach cloud metadata endpoints and
    # anything else private the server can route to.
    SCRAPER_ALLOW_PRIVATE_HOSTS: bool = False

    # Reranking (optional, pluggable) — applied on the Agno knowledge retrieval path.
    # Disabled by default; enable + supply a key to activate. Provider is swappable.
    RERANK_ENABLED: bool = False
    RERANK_PROVIDER: str = "cohere"                 # cohere | sentence_transformer | none
    RERANK_MODEL: str = ""                           # blank = use the provider's own default model
    RERANK_TOP_N: int = 8                            # final chunks kept after rerank (widened for recall)
    RERANK_FETCH_K: int = 24                         # candidates fetched before rerank trims to TOP_N
    COHERE_API_KEY: Optional[str] = None

    # Agno-native session store (history / user-memory / summaries)
    SESSION_STORE: str = "postgres"                  # postgres | sqlite | none
    AGNO_SESSION_DB_URL: str = ""                    # explicit url; blank = derive from DATABASE_URL
    AGNO_SESSION_DB_NAME: str = "agno_sessions"      # separate database on the same PG server
    AGNO_SESSION_DB_SCHEMA: str = "public"
    HISTORY_ENABLED: bool = True
    NUM_HISTORY_RUNS: int = 5
    USER_MEMORIES_ENABLED: bool = True
    SESSION_SUMMARIES_ENABLED: bool = True
    ADD_KNOWLEDGE_TO_CONTEXT: bool = True

    # RAG
    RAG_TOP_K: int = 12                              # chunks in context (no-rerank path); widened for recall & numeric figures

    RAG_SIMILARITY_THRESHOLD: float = 0.7
    RAG_CHUNK_SIZE: int = 1000
    RAG_CHUNK_OVERLAP: int = 200
    RAG_MAX_CONTEXT_LENGTH: int = 4000
    # Table captions prepended to table chunks so conceptual queries match them.
    #   heuristic — section + column/row labels (free, no LLM)   [default]
    #   llm       — one-sentence LLM description (costs 1 call/table at ingest)
    #   none      — disabled
    TABLE_CAPTION_MODE: str = "heuristic"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    CELERY_TASK_TRACK_STARTED: bool = True
    CELERY_TASK_TIME_LIMIT: int = 3600
    CELERY_TASK_SOFT_TIME_LIMIT: int = 3000

    # Monitoring
    ENABLE_METRICS: bool = True
    METRICS_PORT: int = 9090
    PROMETHEUS_MULTIPROC_DIR: str = "/tmp/prometheus_multiproc"

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000

    # Login brute-force protection (Redis fixed-window)
    LOGIN_RATELIMIT_EMAIL_MAX: int = 5       # attempts per email per window
    LOGIN_RATELIMIT_IP_MAX: int = 30         # attempts per IP per window
    LOGIN_RATELIMIT_WINDOW_SEC: int = 900    # 15 minutes

    # File Upload
    MAX_UPLOAD_SIZE: int = 10485760  # 10MB
    ALLOWED_EXTENSIONS: List[str] = Field(
        default=["txt", "pdf", "docx", "md", "json"]
    )

    # Chatbot logo upload
    CHATBOT_LOGO_DIR: str = "uploads/chatbot_logos"
    MAX_LOGO_UPLOAD_BYTES: int = 2 * 1024 * 1024  # 2MB

    # Logging
    LOG_FORMAT: str = "json"
    LOG_FILE: str = "logs/app.log"
    LOG_ROTATION: str = "1 day"
    LOG_RETENTION: str = "30 days"

    # Agent Configuration
    AGENT_TIMEOUT: int = 300
    AGENT_MAX_RETRIES: int = 3
    AGENT_RETRY_DELAY: int = 5

    # Workflow Configuration
    WORKFLOW_MAX_STEPS: int = 50
    WORKFLOW_TIMEOUT: int = 600
    WORKFLOW_PARALLEL_WORKERS: int = 5

    # WebSocket Configuration
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MAX_CONNECTIONS: int = 1000
    WS_MESSAGE_QUEUE_SIZE: int = 100

    # Background jobs (document ingestion). "inprocess" needs no extra
    # infrastructure; "celery" gives restart-safe durability at the cost of
    # running a broker + worker. See app/orchestra/ai/ingestion/jobs/.
    JOB_BACKEND: str = "inprocess"

    # Celery reuses the existing Redis server but on a DIFFERENT database index
    # (default 1 vs the app's 0), so queue state can never collide with or be
    # accidentally flushed alongside cache/rate-limit keys. Everything Celery
    # writes is additionally namespaced under CELERY_KEY_PREFIX, so a stray key
    # is always identifiable at a glance in redis-cli.
    CELERY_REDIS_DB: int = 1
    CELERY_KEY_PREFIX: str = "s247:jobs:"
    CELERY_BROKER_URL: str = ""      # blank = derive from REDIS_URL + CELERY_REDIS_DB
    CELERY_RESULT_BACKEND: str = ""  # blank = same as broker
    CELERY_TASK_QUEUE: str = "s247-ingestion"

    # JWT Auth
    JWT_TTL_HOURS: int = 72

    # Chatbot customer login (end customers signing in on the hosted chat page).
    # GOOGLE_CLIENT_ID is the OAuth "Web application" client id; the widget needs
    # it too, so it's exposed via the public settings endpoint. Empty = the
    # Google login option is unavailable (gate falls back to open chat).
    GOOGLE_CLIENT_ID: str = ""
    CHATBOT_USER_JWT_TTL_HOURS: int = 24 * 30   # 30 days — history should persist

    # Super Admin
    SUPER_ADMIN_KEY: str = "super-secret-change-me"
    AVAILABLE_HOMEPAGES: List[str] = Field(
        default=["homepage1", "homepage2", "homepage3", "homepage4"]
    )

    # Memory (mem0)
    MEM0_ENABLED: bool = False
    MEM0_LLM_PROVIDER: str = "openai"       # openai | anthropic
    MEM0_LLM_MODEL: str = "gpt-4o-mini"
    MEM0_VECTOR_STORE: str = "chroma"       # chroma | memory
    MEM0_COLLECTION: str = "agent_memory"
    MEM0_CHROMA_PATH: str = ".chroma_db"
    MEM0_SEARCH_LIMIT: int = 5
    MEM0_REWRITE_MAX_TOKENS: int = 80

    # Orchestrator backend: "dynamic" (default) or "agno"
    # Set ORCHESTRATOR=agno in .env to enable Agno-backed routing.
    ORCHESTRATOR: str = "agno"

    # Frontend base URL — used to build email verification / password reset links
    # Set this to the public site URL (e.g. https://support247.chat) in production
    FRONTEND_URL: str = "http://localhost:5173"

    # SMTP — used for email verification and password reset emails
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "noreply@support247.chat"

    # Password reset token TTL in minutes
    PASSWORD_RESET_TTL_MINUTES: int = 30

    @property
    def database_url_sync(self) -> str:
        """Get synchronous database URL for Alembic"""
        return self.DATABASE_URL.replace("+asyncpg", "")


# Create global settings instance
settings = Settings()

# Made with Bob
