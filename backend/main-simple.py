#!/usr/bin/env python3
"""
Simple Claude CLI Web UI Backend - Minimal Setup
"""

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse


# Simple health check
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Simple lifespan manager."""
    logging.info("Starting simple Claude CLI Web UI server...")
    yield
    logging.info("Shutting down...")


# Create minimal app
app = FastAPI(
    title="Claude CLI Web UI (Simple)",
    description="Minimal web interface for Claude CLI",
    version="1.0.0-simple",
    lifespan=lifespan
)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Simple health endpoint
@app.get("/api/health/")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "message": "Simple mode active"}

# Redirect root to health
@app.get("/")
async def root():
    """Root redirect."""
    return RedirectResponse(url="/api/health/")

# Simple command execution (placeholder)
@app.post("/api/commands/execute")
async def execute_command():
    """Placeholder command execution."""
    return {"status": "ok", "message": "Command execution not available in simple mode"}

@app.post("/api/commands/agent-test")
async def agent_test():
    """Placeholder agent test."""
    return {"status": "ok", "message": "Agent testing not available in simple mode"}

# Simple project endpoints
@app.get("/api/projects/")
async def get_projects():
    """Simple projects endpoint."""
    return {"data": [], "error": None}

@app.get("/api/projects/{project_id}/tasks")
async def get_project_tasks(project_id: str):
    """Simple tasks endpoint."""
    return {"data": [], "error": None}


if __name__ == "__main__":
    # Simple logging setup
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    print("🚀 Starting Claude CLI Web UI (Simple Mode)")
    print("============================================")
    print("📋 Features available:")
    print("  ✅ Basic web interface")
    print("  ✅ Health monitoring")
    print("  ❌ Command execution (placeholder)")
    print("  ❌ Database features (placeholder)")
    print("  ❌ Agent testing (placeholder)")
    print("")
    print("💡 For full features, install all dependencies and use main.py")
    print("")
    
    # Run the server
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
        access_log=True,
    )