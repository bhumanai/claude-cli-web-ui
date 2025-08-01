"""Main API router combining all endpoint modules."""

from fastapi import APIRouter

from app.api.endpoints import (
    auth,
    simple_auth,
    commands, 
    health, 
    sessions,
    projects,
    task_queues,
    tasks,
    execution,
    github
)

# Create main API router
router = APIRouter()

# Include all endpoint routers
router.include_router(health.router, prefix="/health", tags=["health"])
router.include_router(auth.router, prefix="/auth", tags=["authentication"])
router.include_router(simple_auth.router, prefix="/auth", tags=["simple-auth"])
router.include_router(commands.router, prefix="/commands", tags=["commands"])
router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])

# Task management endpoints
router.include_router(projects.router, prefix="/api/v1", tags=["projects"])
router.include_router(task_queues.router, prefix="/api/v1", tags=["task-queues"])
router.include_router(tasks.router, prefix="/api/v1", tags=["tasks"])
router.include_router(execution.router, prefix="/api/v1", tags=["execution"])

# GitHub integration endpoints
router.include_router(github.router, prefix="/api", tags=["github"])