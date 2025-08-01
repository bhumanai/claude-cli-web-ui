"""Health check endpoints."""

import time
from datetime import datetime

import psutil
from fastapi import APIRouter

from app.models.schemas import HealthCheck, ServerStats

# Store server start time
START_TIME = time.time()

router = APIRouter()


@router.get("/", response_model=HealthCheck)
async def health_check() -> HealthCheck:
    """
    Basic health check endpoint.
    
    Returns:
        HealthCheck response with server status
    """
    uptime = time.time() - START_TIME
    
    return HealthCheck(
        status="healthy",
        version="1.0.0",
        timestamp=datetime.utcnow(),
        uptime=uptime
    )


@router.get("/stats", response_model=ServerStats)
async def server_stats() -> ServerStats:
    """
    Get detailed server statistics.
    
    Returns:
        ServerStats with system metrics
    """
    # Get system stats
    process = psutil.Process()
    memory_info = process.memory_info()
    memory_mb = memory_info.rss / 1024 / 1024
    cpu_percent = process.cpu_percent()
    
    uptime = time.time() - START_TIME
    
    return ServerStats(
        active_sessions=0,  # TODO: Get from session manager
        total_commands=0,   # TODO: Get from session manager
        uptime=uptime,
        memory_usage=memory_mb,
        cpu_usage=cpu_percent
    )