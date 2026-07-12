"""FastAPI Multi-Agent Backend - Main Application"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import structlog

from app.config import settings
from app.core.database import init_db, close_db, check_db_connection
from app.core.redis import redis_client
from app.api.v1 import agents, workflows, tasks, documents, admin, datasources, mock_orders
from app.api.v1 import space_agents, chat_sessions, chatbots
from app.api.v1.space_agents import kb_router
from app.api.v1 import knowledge_base
from app.api import chat, auth, customer, space
from app.api.v1 import dashboard, superadmin
from app.api.v1.inbox import staff_auth, sessions, escalation, stream
from app.api.v1 import widget as widget_api

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting FastAPI Multi-Agent Backend", version=settings.APP_VERSION)

    # Refuse to boot in production with the default (forgeable) JWT secret.
    if settings.ENVIRONMENT.lower() == "production" and \
            settings.SECRET_KEY == "change-this-secret-key-in-production":
        raise RuntimeError(
            "SECRET_KEY is still the default value. Set a strong SECRET_KEY env var "
            "before running in production — JWTs would otherwise be forgeable."
        )

    try:
        # Initialize database
        await init_db()
        logger.info("Database initialized")
        
        # Check database connection
        db_connected = await check_db_connection()
        if not db_connected:
            logger.error("Database connection failed")
        
        # Connect to Redis
        await redis_client.connect()
        logger.info("Redis connected")

        # Agno session store preflight — surface a missing/unreachable
        # `agno_sessions` DB at boot. Without it, chat still works but silently
        # loses history/memory/summaries (fail-safe degrade), so make it visible.
        try:
            from app.orchestra.ai.core.config import build_config
            from app.orchestra.ai.session.store import build_session_db
            _sess_cfg = build_config()
            if settings.ORCHESTRATOR == "agno" and _sess_cfg.session_store != "none":
                if build_session_db(_sess_cfg) is not None:
                    logger.info("Session store ready", store=_sess_cfg.session_store)
                else:
                    logger.error(
                        "Session store unavailable — chat will run STATELESS "
                        "(no history/memory). Create the agno_sessions database "
                        "or set SESSION_STORE=sqlite|none.",
                        store=_sess_cfg.session_store,
                    )
        except Exception as e:
            logger.error("Session store preflight error", error=str(e))

        logger.info("Application startup complete")

        # Session pool TTL sweeper — evicts idle sessions every 10 min
        import asyncio
        async def _session_sweeper():
            from app.orchestra.ai.session.pool import pool as _pool
            while True:
                await asyncio.sleep(10 * 60)
                await _pool.sweep_expired()
        asyncio.create_task(_session_sweeper())

        # Start inbox background tasks
        from app.tasks.inbox_tasks import start_inbox_tasks
        start_inbox_tasks()

    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise

    yield
    
    # Shutdown
    logger.info("Shutting down application")
    
    try:
        # Close database connections
        await close_db()
        logger.info("Database connections closed")
        
        # Disconnect from Redis
        await redis_client.disconnect()
        logger.info("Redis disconnected")
        
        logger.info("Application shutdown complete")
    except Exception as e:
        logger.error(f"Shutdown error: {e}")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="FastAPI backend for AI Support multi-agent system with RAG capabilities",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# Add GZip compression middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add CORS middleware for authenticated dashboard API calls.
# Public /api/chat/ and /api/v1/widget/ endpoints bypass this via the
# PublicCORSMiddleware below, which runs first (outermost layer).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

# Public CORS — must be added LAST so it wraps everything and runs FIRST.
# Intercepts OPTIONS preflights and injects Access-Control-Allow-Origin: *
# for public endpoints before CORSMiddleware can reject them.
_PUBLIC_CORS_PREFIXES = (
    "/api/v1/widget/",
    "/api/v1/space/public/",
    "/api/chat/",
)
_PUBLIC_CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.responses import Response as StarletteResponse

_SSE_PATHS = ("/api/v1/inbox/customer-stream", "/api/v1/inbox/stream")


def _is_sse_path(path: str) -> bool:
    return path.endswith("/stream") or any(path.startswith(p) for p in _SSE_PATHS)


# ── Pure ASGI middleware ───────────────────────────────────────────────────────
# BaseHTTPMiddleware wraps `receive` in a nested anyio task group per layer.
# Four nested layers breaks SSE on Python 3.14 (anyio task-group nesting bug).
# Pure ASGI passes `receive` straight through; only `send` is wrapped.

class PublicCORSMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path      = scope.get("path", "")
        method    = scope.get("method", "")
        is_public = any(path.startswith(p) for p in _PUBLIC_CORS_PREFIXES)

        if is_public and method == "OPTIONS":
            await StarletteResponse(status_code=200, headers=_PUBLIC_CORS_HEADERS)(scope, receive, send)
            return

        if not is_public:
            await self.app(scope, receive, send)
            return

        _cors_keys = {k.lower().encode("latin-1") for k in _PUBLIC_CORS_HEADERS}

        async def _inject_cors(message):
            if message["type"] == "http.response.start":
                # Remove any CORS headers already set by the inner CORSMiddleware,
                # then replace with public * values so there's no duplicate header.
                headers = [(k, v) for k, v in message.get("headers", [])
                           if k.lower() not in _cors_keys]
                for k, v in _PUBLIC_CORS_HEADERS.items():
                    headers.append((k.encode("latin-1"), v.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, _inject_cors)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or _is_sse_path(scope.get("path", "")):
            await self.app(scope, receive, send)
            return

        path      = scope.get("path", "")
        _public   = ("/api/v1/widget/", "/api/v1/space/public/", "/api/chat/")
        is_public = any(path.startswith(p) for p in _public)

        async def _inject_security(message):
            if message["type"] == "http.response.start":
                headers  = list(message.get("headers", []))
                existing = {h[0].lower() for h in headers}

                def _add(name: str, value: str) -> None:
                    if name.lower().encode("latin-1") not in existing:
                        headers.append((name.encode("latin-1"), value.encode("latin-1")))

                _add("X-Content-Type-Options", "nosniff")
                _add("Referrer-Policy", "strict-origin-when-cross-origin")
                if settings.ENVIRONMENT.lower() != "development":
                    _add("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
                if not is_public:
                    _add("X-Frame-Options", "DENY")
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, _inject_security)


class TimingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or _is_sse_path(scope.get("path", "")):
            await self.app(scope, receive, send)
            return

        start = time.time()

        async def _inject_timing(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-process-time", str(time.time() - start).encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, _inject_timing)


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path   = scope.get("path", "")
        method = scope.get("method", "")
        client = scope.get("client")
        logger.info("request.received", method=method, path=path,
                    client=client[0] if client else None)

        if _is_sse_path(path):
            await self.app(scope, receive, send)
            return

        status: list[int] = [200]

        async def _capture_status(message):
            if message["type"] == "http.response.start":
                status[0] = message.get("status", 200)
            await send(message)

        await self.app(scope, receive, _capture_status)
        logger.info("request.completed", method=method, path=path, status_code=status[0])


# Register — add_middleware is LIFO: last call = outermost = first to run.
# Order preserved: RequestLogging → Timing → SecurityHeaders → PublicCORS → CORS → GZip
app.add_middleware(PublicCORSMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TimingMiddleware)
app.add_middleware(RequestLoggingMiddleware)


# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(
        "Unhandled exception",
        error=str(exc),
        path=request.url.path,
        method=request.method,
    )
    headers = {}
    if any(request.url.path.startswith(p) for p in _PUBLIC_CORS_PREFIXES):
        headers = dict(_PUBLIC_CORS_HEADERS)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "message": str(exc) if settings.DEBUG else "An unexpected error occurred",
        },
        headers=headers or None,
    )


# Health check endpoint (also available at /api/v1/health for frontend proxy compatibility)
@app.get("/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    db_status = await check_db_connection()
    redis_status = redis_client.redis is not None
    
    return {
        "status": "healthy" if db_status and redis_status else "unhealthy",
        "version": settings.APP_VERSION,
        "database": "connected" if db_status else "disconnected",
        "redis": "connected" if redis_status else "disconnected",
    }


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": "FastAPI backend for AI Support multi-agent system",
        "docs": "/docs",
        "redoc": "/redoc",
        "openapi": "/openapi.json",
    }


# Include API routers
app.include_router(auth.router, prefix="/api/v1", tags=["Auth"])
app.include_router(chat.router, tags=["Chat"])
app.include_router(agents.router, prefix="/api/v1", tags=["Agents"])
app.include_router(workflows.router, prefix="/api/v1", tags=["Workflows"])
app.include_router(tasks.router, prefix="/api/v1", tags=["Tasks"])
app.include_router(documents.router, prefix="/api/v1", tags=["Documents"])
app.include_router(admin.router,      prefix="/api/v1", tags=["Admin"])
app.include_router(dashboard.router,   prefix="/api/v1", tags=["Dashboard"])
app.include_router(superadmin.router,   prefix="/api/v1", tags=["Super Admin"])
app.include_router(datasources.router,   prefix="/api/v1", tags=["Data Sources"])
app.include_router(mock_orders.router,   prefix="/api/v1", tags=["Mock API"])
app.include_router(space_agents.router,  prefix="/api/v1", tags=["Space Agents"])
app.include_router(kb_router,              prefix="/api/v1", tags=["Space Knowledge Base"])
app.include_router(knowledge_base.router, prefix="/api/v1", tags=["Knowledge Base"])
app.include_router(chat_sessions.router, prefix="/api/v1", tags=["Chat Sessions"])
app.include_router(chatbots.router,      prefix="/api/v1", tags=["Chatbots"])
app.include_router(space.router, prefix="/api/v1")
app.include_router(customer.router)
app.include_router(widget_api.router)   # public — no prefix, CORS * on responses

# Inbox — human transfer
app.include_router(staff_auth.router, prefix="/api/v1", tags=["Inbox — Staff"])
app.include_router(sessions.router,   prefix="/api/v1", tags=["Inbox — Sessions"])
app.include_router(escalation.router, prefix="/api/v1", tags=["Inbox — Escalation"])
app.include_router(stream.router,     prefix="/api/v1", tags=["Inbox — SSE"])


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        workers=settings.WORKERS if not settings.RELOAD else 1,
        log_level=settings.LOG_LEVEL.lower(),
    )

# Made with Bob
