#!/usr/bin/env python3
"""
Emergency Backend - Absolute Minimal FastAPI Server
Works with any Python 3.8+ installation, zero external dependencies except FastAPI
"""

import sys
import json
import asyncio
from typing import Any, Dict

try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    import uvicorn
except ImportError:
    print("ERROR: FastAPI not installed. Install with: pip install fastapi uvicorn")
    sys.exit(1)

# Create the most minimal FastAPI app possible
app = FastAPI(
    title="Claude CLI Web UI - Emergency Backend",
    description="Ultra-minimal emergency backend that always works",
    version="1.0.0-emergency"
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5175",
        "http://127.0.0.1:5175"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Claude CLI Web UI Emergency Backend - Running"}

@app.get("/api/health/")
async def health():
    return {
        "status": "ok",
        "message": "Emergency backend is running",
        "backend_type": "emergency",
        "features": ["basic_api", "health_checks", "cors"],
        "disabled_features": ["database", "redis", "websockets", "advanced_features"]
    }

@app.get("/api/health/detailed")
async def detailed_health():
    return {
        "status": "healthy",
        "timestamp": "2025-01-01T00:00:00Z",
        "uptime": "running",
        "backend_type": "emergency",
        "python_version": sys.version,
        "dependencies": {
            "fastapi": "installed",
            "uvicorn": "installed",
            "database": "disabled",
            "redis": "disabled",
            "websockets": "disabled"
        }
    }

@app.post("/api/commands/execute")
async def execute_command(command_data: Dict[str, Any] = None):
    return {
        "data": {
            "output": "Emergency backend: Command execution is disabled in minimal mode.\nUpgrade to full backend for command execution.",
            "exit_code": 0,
            "execution_time": 0.1
        },
        "error": None
    }

@app.post("/api/commands/agent-test")
async def agent_test():
    return {
        "data": {
            "message": "Emergency backend: Agent system is disabled in minimal mode.",
            "status": "disabled",
            "recommendation": "Upgrade to full backend for agent functionality"
        },
        "error": None
    }

@app.get("/api/projects/")
async def get_projects():
    return {
        "data": [
            {
                "id": "emergency-project",
                "name": "Emergency Mode Project",
                "description": "Default project for emergency backend",
                "status": "active"
            }
        ],
        "error": None
    }

@app.get("/api/projects/{project_id}/tasks")
async def get_project_tasks(project_id: str):
    return {
        "data": [
            {
                "id": "emergency-task",
                "title": "Upgrade Backend",
                "description": "Switch to full-featured backend for complete functionality",
                "status": "pending",
                "priority": "high"
            }
        ],
        "error": None
    }

@app.get("/api/sessions/")
async def get_sessions():
    return {
        "data": [],
        "error": None
    }

@app.post("/api/sessions/")
async def create_session():
    return {
        "data": {
            "id": "emergency-session",
            "name": "Emergency Session",
            "status": "active",
            "created_at": "2025-01-01T00:00:00Z"
        },
        "error": None
    }

# Catch-all for any other API endpoints
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def catch_all_api(path: str):
    return {
        "data": None,
        "error": {
            "message": f"Endpoint /{path} is disabled in emergency backend mode",
            "code": "EMERGENCY_MODE",
            "suggestion": "Upgrade to full backend for complete API functionality"
        }
    }

if __name__ == "__main__":
    print("🚨 EMERGENCY BACKEND STARTING")
    print("=" * 50)
    print("⚠️  This is a minimal emergency backend")
    print("⚠️  Many features are disabled")
    print("⚠️  For full functionality, use the main backend")
    print("=" * 50)
    print("✅ Health checks available")
    print("✅ Basic API endpoints available")
    print("✅ CORS configured for frontend")
    print("❌ Database features disabled")
    print("❌ Command execution disabled")
    print("❌ WebSocket features disabled")
    print("❌ Advanced features disabled")
    print("=" * 50)
    print("🌐 Starting server on http://localhost:8000")
    print("📋 Health check: http://localhost:8000/api/health/")
    print()
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
        access_log=True
    )