"""Minimal API router with essential endpoints only."""

from fastapi import APIRouter

from app.api.endpoints import (
    health, 
    sessions,
    projects,
    tasks,
    github
)

# Create main API router
router = APIRouter()

# Include essential endpoint routers
router.include_router(health.router, prefix="/health", tags=["health"])
router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
router.include_router(projects.router, prefix="/api/v1", tags=["projects"])
router.include_router(tasks.router, prefix="/api/v1", tags=["tasks"])

# GitHub integration endpoints
router.include_router(github.router, prefix="/api", tags=["github"])