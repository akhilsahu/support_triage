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


# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)


# Add GZip compression middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS passthrough for public widget + chat endpoints from external origins
@app.middleware("http")
async def widget_cors_middleware(request: Request, call_next):
    """Add Access-Control-Allow-Origin: * for public widget paths."""
    public_prefixes = (
        "/api/v1/widget/",
        "/api/v1/space/public/",
        "/api/chat/",
    )
    is_public = any(request.url.path.startswith(p) for p in public_prefixes)
    response = await call_next(request)
    if is_public:
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# Security headers middleware
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Baseline security response headers."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # HSTS only outside local dev — pinning HTTPS on http://localhost would break dev.
    if settings.ENVIRONMENT.lower() != "development":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    # Anti-clickjacking for non-public paths. Widget/chat endpoints are consumed
    # cross-origin (fetch) or embedded, so they're intentionally excluded.
    public_prefixes = ("/api/v1/widget/", "/api/v1/space/public/", "/api/chat/")
    if not any(request.url.path.startswith(p) for p in public_prefixes):
        response.headers.setdefault("X-Frame-Options", "DENY")
    return response


# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add processing time to response headers"""
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests"""
    logger.info(
        "Request received",
        method=request.method,
        path=request.url.path,
        client=request.client.host if request.client else None,
    )
    response = await call_next(request)
    logger.info(
        "Request completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
    )
    return response


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
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "message": str(exc) if settings.DEBUG else "An unexpected error occurred",
        },
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
