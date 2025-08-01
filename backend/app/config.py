"""Application configuration settings."""

import os
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )
    
    # Server configuration
    HOST: str = Field(default="0.0.0.0", description="Server host")
    PORT: int = Field(default=8000, description="Server port")
    DEBUG: bool = Field(default=False, description="Debug mode")
    
    # CORS configuration
    ALLOWED_ORIGINS: List[str] = Field(
        default=[
            # Local development
            "http://localhost:5173", 
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://localhost:8080",
            # Vercel deployed backend
            "https://claude-cli-havyrp65v-bhumanais-projects.vercel.app",
            "https://claude-cli-os2333ucw-bhumanais-projects.vercel.app",
            # Legacy Vercel URLs
            "https://claudeui-rouge.vercel.app",
            "https://claudeui.vercel.app",
            # Add specific Vercel preview URLs
            "https://claudeui-39r70ssub-bhuman.vercel.app",
            "https://claudeui-mcliwt80r-bhuman.vercel.app",
            "https://claudeui-bqk47609z-bhuman.vercel.app",
            # Allow all Vercel preview URLs for your project
            "https://claudeui-*-bhuman.vercel.app",
            "https://claudeui-*-bhumanais-projects.vercel.app",
            "https://claude-cli-*-bhumanais-projects.vercel.app"
        ],
        description="Allowed CORS origins"
    )
    
    # Logging configuration
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")
    LOG_FORMAT: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        description="Log format"
    )
    
    # Claude CLI configuration
    CLAUDE_CLI_COMMAND: str = Field(default="claude", description="Claude CLI command")
    CLAUDE_CLI_TIMEOUT: int = Field(default=300, description="Command timeout in seconds")
    MAX_CONCURRENT_COMMANDS: int = Field(default=5, description="Max concurrent commands")
    
    # Session configuration
    SESSION_TIMEOUT: int = Field(default=3600, description="Session timeout in seconds")
    MAX_SESSIONS: int = Field(default=100, description="Maximum number of sessions")
    
    # Security configuration
    ENABLE_AUTH: bool = Field(default=True, description="Enable authentication")
    SIMPLE_PASSWORD: str = Field(default="claude123", description="Simple access password")
    SECRET_KEY: str = Field(default="prod-secret-change-this-in-real-production-123", description="Secret key for JWT")
    RATE_LIMIT_PER_MINUTE: int = Field(default=60, description="Rate limit per minute")
    
    # Database configuration
    DATABASE_URL: str = Field(default="sqlite+aiosqlite:///./claude_cli.db", description="Database URL")
    DATABASE_ECHO: bool = Field(default=False, description="Echo SQL queries")
    DATABASE_POOL_SIZE: int = Field(default=10, description="Database connection pool size")
    DATABASE_MAX_OVERFLOW: int = Field(default=20, description="Database max overflow connections")
    
    # Redis configuration
    REDIS_URL: str = Field(default="redis://localhost:6379", description="Redis URL")
    USE_REDIS: bool = Field(default=False, description="Use Redis for task queuing")
    REDIS_TASK_STREAM: str = Field(default="claude:tasks", description="Redis stream for tasks")
    REDIS_MAX_RETRIES: int = Field(default=3, description="Redis max retries")
    REDIS_RETRY_DELAY: int = Field(default=1, description="Redis retry delay in seconds")
    
    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.DEBUG
    
    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return not self.DEBUG


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()