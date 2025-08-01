#!/usr/bin/env python3
"""
Claude CLI Web UI - FastAPI Backend Server

A high-performance backend server for the Claude CLI web interface,
providing real-time command execution and WebSocket communication.
"""

import asyncio
import logging
import os
import signal
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import router as api_router
from app.config import get_settings
from app.core.logging_config import setup_logging
from app.core.middleware import SecurityMiddleware, RequestLoggingMiddleware
from app.websocket import websocket_router
from app.database import initialize_database, close_database
try:
    from app.services.redis_client import initialize_redis, close_redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    async def initialize_redis(): pass
    async def close_redis(): pass


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifecycle."""
    settings = get_settings()
    
    # Setup logging
    setup_logging(settings.LOG_LEVEL)
    logger = logging.getLogger(__name__)
    
    logger.info("Starting Claude CLI Web UI server...")
    logger.info(f"Server will be available at http://localhost:{settings.PORT}")
    
    # Initialize database
    try:
        await initialize_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database", error=str(e))
        raise
    
    # Initialize Redis if enabled and available
    if settings.USE_REDIS and REDIS_AVAILABLE:
        try:
            await initialize_redis()
            logger.info("Redis initialized successfully")
        except Exception as e:
            logger.error("Failed to initialize Redis", error=str(e))
            # Don't raise - Redis is optional for basic functionality
    elif settings.USE_REDIS and not REDIS_AVAILABLE:
        logger.warning("Redis is enabled but redis library not installed")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down Claude CLI Web UI server...")
    
    # Close database connections
    try:
        await close_database()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error("Error closing database", error=str(e))
    
    # Close Redis connections
    if settings.USE_REDIS and REDIS_AVAILABLE:
        try:
            await close_redis()
            logger.info("Redis connections closed")
        except Exception as e:
            logger.error("Error closing Redis", error=str(e))


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title="Claude CLI Web UI",
        description="A fast, responsive web interface for the Claude CLI",
        version="1.0.0",
        docs_url="/api/docs" if settings.DEBUG else None,
        redoc_url="/api/redoc" if settings.DEBUG else None,
        lifespan=lifespan
    )
    
    # Add security middleware
    app.add_middleware(SecurityMiddleware)
    
    # Add request logging middleware
    if settings.DEBUG:
        app.add_middleware(RequestLoggingMiddleware)
    
    # CORS middleware for frontend development
    # Use a custom function to handle wildcard patterns
    def is_allowed_origin(origin: str) -> bool:
        # Check exact matches
        if origin in settings.ALLOWED_ORIGINS:
            return True
        # Check wildcard patterns for Vercel deployments
        if origin and (
            origin.startswith("https://claudeui-") and origin.endswith("-bhuman.vercel.app") or
            origin.startswith("https://claudeui-") and origin.endswith("-bhumanais-projects.vercel.app") or
            origin.startswith("https://claude-cli-") and origin.endswith("-bhumanais-projects.vercel.app")
        ):
            return True
        return False
    
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex="https://(claudeui-.*|claude-cli-.*)\\.vercel\\.app",  # Regex pattern for all Vercel URLs
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
    )
    
    # Include routers
    app.include_router(api_router, prefix="/api")
    app.include_router(websocket_router)
    
    # Serve static files in production (optional)
    static_dir = "static"
    if not settings.DEBUG and os.path.exists(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    
    return app


def handle_shutdown(signum, frame):
    """Handle graceful shutdown on SIGINT/SIGTERM."""
    logger = logging.getLogger(__name__)
    logger.info(f"Received signal {signum}, shutting down gracefully...")
    sys.exit(0)


if __name__ == "__main__":
    # Setup signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)
    
    settings = get_settings()
    
    # Run the server
    uvicorn.run(
        "main:create_app",
        factory=True,
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=settings.DEBUG,
    )