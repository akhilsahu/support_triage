"""Database configuration with SQLAlchemy and pgvector support"""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from app.config import settings
import structlog

logger = structlog.get_logger()

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for all models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting async database session.
    
    Usage:
        @app.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database tables"""
    try:
        # NOTE: Tables are created via Alembic migrations
        # This function now just verifies database connectivity
        async with engine.begin() as conn:
            # Test database connection
            await conn.execute(text("SELECT 1"))
            # Auto-migrate: Add active_homepage column to platform_settings if it doesn't exist
            await conn.execute(text("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS active_homepage VARCHAR(50) DEFAULT 'homepage1'"))
            
        logger.info("Database connection verified successfully and auto-migrations applied")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        # Don't raise - allow app to start even if DB is temporarily unavailable
        logger.warning("Application starting without database connection")


async def close_db() -> None:
    """Close database connections"""
    try:
        await engine.dispose()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Failed to close database connections: {e}")
        raise


async def check_db_connection() -> bool:
    """Check if database connection is working"""
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection successful")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False

# Made with Bob
