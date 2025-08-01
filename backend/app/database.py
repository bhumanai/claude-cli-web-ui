"""Database initialization and management."""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine
)
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.core.logging_config import get_logger
from app.models.database import Base

logger = get_logger(__name__)


class DatabaseManager:
    """Database connection and session management."""
    
    def __init__(self):
        self.settings = get_settings()
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None
    
    @property
    def engine(self) -> AsyncEngine:
        """Get the database engine."""
        if self._engine is None:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        return self._engine
    
    @property
    def session_factory(self) -> async_sessionmaker[AsyncSession]:
        """Get the session factory."""
        if self._session_factory is None:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        return self._session_factory
    
    async def initialize(self) -> None:
        """Initialize the database connection."""
        logger.info("Initializing database connection", 
                   database_url=self.settings.DATABASE_URL.split("://")[0] + "://***")
        
        # Create engine with appropriate configuration
        if self.settings.DATABASE_URL.startswith("sqlite"):
            # SQLite-specific configuration
            self._engine = create_async_engine(
                self.settings.DATABASE_URL,
                echo=self.settings.DATABASE_ECHO,
                poolclass=StaticPool,
                connect_args={
                    "check_same_thread": False,
                },
                future=True
            )
        else:
            # PostgreSQL and other databases
            self._engine = create_async_engine(
                self.settings.DATABASE_URL,
                echo=self.settings.DATABASE_ECHO,
                pool_size=self.settings.DATABASE_POOL_SIZE,
                max_overflow=self.settings.DATABASE_MAX_OVERFLOW,
                future=True
            )
        
        # Create session factory
        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=True,
            autocommit=False
        )
        
        logger.info("Database connection initialized successfully")
    
    async def create_tables(self) -> None:
        """Create all database tables."""
        logger.info("Creating database tables")
        
        async with self.engine.begin() as conn:
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("Database tables created successfully")
    
    async def drop_tables(self) -> None:
        """Drop all database tables."""
        logger.warning("Dropping all database tables")
        
        async with self.engine.begin() as conn:
            # Drop all tables
            await conn.run_sync(Base.metadata.drop_all)
        
        logger.warning("All database tables dropped")
    
    async def close(self) -> None:
        """Close the database connection."""
        if self._engine:
            logger.info("Closing database connection")
            await self._engine.dispose()
            self._engine = None
            self._session_factory = None
            logger.info("Database connection closed")
    
    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get a database session with automatic cleanup.
        
        Yields:
            AsyncSession: Database session
            
        Raises:
            RuntimeError: If database is not initialized
        """
        if self._session_factory is None:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        
        async with self._session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
    
    async def health_check(self) -> bool:
        """Check database connection health.
        
        Returns:
            bool: True if database is healthy, False otherwise
        """
        try:
            async with self.get_session() as session:
                # Simple query to test connection
                result = await session.execute("SELECT 1")
                result.scalar()
                return True
        except Exception as e:
            logger.error("Database health check failed", error=str(e))
            return False


# Global database manager instance
db_manager = DatabaseManager()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for getting database sessions.
    
    Yields:
        AsyncSession: Database session
    """
    async with db_manager.get_session() as session:
        yield session


async def initialize_database() -> None:
    """Initialize the database on application startup."""
    await db_manager.initialize()
    await db_manager.create_tables()


async def close_database() -> None:
    """Close the database connection on application shutdown."""
    await db_manager.close()


async def reset_database() -> None:
    """Reset the database by dropping and recreating all tables.
    
    Warning: This will delete all data!
    """
    logger.warning("Resetting database - all data will be lost!")
    await db_manager.drop_tables()
    await db_manager.create_tables()
    logger.info("Database reset completed")


# For testing and development
async def setup_test_database() -> DatabaseManager:
    """Setup a test database with in-memory SQLite.
    
    Returns:
        DatabaseManager: Configured test database manager
    """
    # Override settings for testing
    original_db_url = get_settings().DATABASE_URL
    get_settings().DATABASE_URL = "sqlite+aiosqlite:///:memory:"
    
    test_db = DatabaseManager()
    await test_db.initialize()
    await test_db.create_tables()
    
    # Restore original settings
    get_settings().DATABASE_URL = original_db_url
    
    return test_db