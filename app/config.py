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

    # IBM watsonx.ai (top priority)
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

    # Anthropic
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-3-opus-20240229"
    ANTHROPIC_TEMPERATURE: float = 0.7
    ANTHROPIC_MAX_TOKENS: int = 2000

    # ChromaDB / RAG storage
    CHROMA_PERSIST_DIR: str = ".chroma_db"
    RAG_DOC_TTL_DAYS: int = 30

    # Embeddings
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_DEVICE: str = "cpu"  # unused, kept for compat

    # RAG
    RAG_TOP_K: int = 5
    RAG_SIMILARITY_THRESHOLD: float = 0.7
    RAG_CHUNK_SIZE: int = 1000
    RAG_CHUNK_OVERLAP: int = 200
    RAG_MAX_CONTEXT_LENGTH: int = 4000

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

    # JWT Auth
    JWT_TTL_HOURS: int = 72

    # Super Admin
    SUPER_ADMIN_KEY: str = "super-secret-change-me"
    AVAILABLE_HOMEPAGES: List[str] = Field(
        default=["homepage1", "homepage2", "homepage3"]
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

    # SMTP — used for password reset emails
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
