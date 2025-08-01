#!/usr/bin/env python3
"""Simple FastAPI server with GitHub endpoints only."""

import os
import json
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any
import uuid
import logging

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Claude CLI Web UI - GitHub Integration")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
def get_db():
    """Get database connection."""
    conn = sqlite3.connect('claude_cli.db')
    conn.row_factory = sqlite3.Row
    return conn

# Pydantic models
class GitHubConnectionRequest(BaseModel):
    """Request schema for connecting GitHub repository."""
    token: str = Field(..., description="GitHub personal access token", min_length=1)
    repository: str = Field(..., description="Repository in format 'owner/repo'", min_length=1)
    project_id: str = Field(..., description="Project UUID", min_length=1)

    @validator('repository')
    def validate_repository_format(cls, v):
        """Validate repository format."""
        if not v or '/' not in v:
            raise ValueError('Repository must be in format "owner/repo"')
        parts = v.split('/')
        if len(parts) != 2 or not all(part.strip() for part in parts):
            raise ValueError('Repository must be in format "owner/repo"')
        return v

class GitHubConnectionResponse(BaseModel):
    """Response schema for GitHub connection."""
    id: str = Field(..., description="Connection UUID")
    repository: str = Field(..., description="Repository name")
    username: str = Field(..., description="GitHub username")  
    connected_at: datetime = Field(..., description="Connection timestamp")
    project_id: str = Field(..., description="Associated project ID")
    status: str = Field(..., description="Connection status")
    created_at: Optional[datetime] = None

# GitHub endpoints
@app.post("/api/github/connect", response_model=GitHubConnectionResponse)
async def connect_github_repository(request: GitHubConnectionRequest):
    """Connect a GitHub repository to a project."""
    logger.info(f"Connecting GitHub repository {request.repository} to project {request.project_id}")
    
    # For demo purposes, we'll create a mock connection
    connection_id = str(uuid.uuid4())
    username = "demo_user"  # In real implementation, validate token and get username
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Check if connection already exists
        cursor.execute("""
            SELECT id FROM github_connections 
            WHERE project_id = ? AND repository = ?
        """, (request.project_id, request.repository))
        
        existing = cursor.fetchone()
        if existing:
            conn.close()
            raise HTTPException(status_code=409, detail="Repository already connected to this project")
        
        # Create new connection (simplified - no token encryption for demo)
        now = datetime.utcnow()
        cursor.execute("""
            INSERT INTO github_connections (id, project_id, repository, username, encrypted_token, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (connection_id, request.project_id, request.repository, username, request.token, 'active', now, now))
        
        conn.commit()
        
        return GitHubConnectionResponse(
            id=connection_id,
            repository=request.repository,
            username=username,
            connected_at=now,
            project_id=request.project_id,
            status='active',
            created_at=now
        )
        
    except Exception as e:
        logger.error(f"Failed to connect repository: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/github/health")
async def github_health_check():
    """GitHub integration health check."""
    return {
        "status": "healthy",
        "service": "github-integration",
        "features": {
            "repository_connection": True,
            "issue_fetching": True,
            "task_creation": True,
            "token_encryption": False  # Simplified for demo
        }
    }

@app.get("/api/github/connections/{project_id}")
async def get_github_connection(project_id: str):
    """Get GitHub connection for a project."""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT id, repository, username, created_at, project_id, status
            FROM github_connections
            WHERE project_id = ? AND status = 'active'
        """, (project_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return GitHubConnectionResponse(
            id=row['id'],
            repository=row['repository'],
            username=row['username'],
            connected_at=datetime.fromisoformat(row['created_at']),
            project_id=row['project_id'],
            status=row['status']
        )
        
    finally:
        conn.close()

@app.delete("/api/github/connections/{project_id}")
async def disconnect_github_repository(project_id: str):
    """Disconnect GitHub repository from project."""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            UPDATE github_connections 
            SET status = 'inactive', updated_at = ?
            WHERE project_id = ? AND status = 'active'
        """, (datetime.utcnow(), project_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="No active GitHub connection found for this project")
        
        conn.commit()
        return {"message": "GitHub repository disconnected successfully"}
        
    finally:
        conn.close()

# Basic project endpoints needed for GitHub integration
@app.get("/api/v1/projects")
async def get_projects():
    """Get all projects."""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM projects ORDER BY created_at DESC")
        projects = []
        for row in cursor.fetchall():
            projects.append({
                "id": row['id'],
                "name": row['name'],
                "description": row['description'],
                "created_at": row['created_at'],
                "updated_at": row['updated_at']
            })
        
        return {"projects": projects}
        
    finally:
        conn.close()

@app.post("/api/v1/projects")
async def create_project(request: Request):
    """Create a new project."""
    data = await request.json()
    
    if not data.get('name'):
        raise HTTPException(status_code=400, detail="Project name is required")
    
    project_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO projects (id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (project_id, data['name'], data.get('description', ''), now, now))
        
        conn.commit()
        
        return {
            "id": project_id,
            "name": data['name'],
            "description": data.get('description', ''),
            "created_at": now,
            "updated_at": now
        }
        
    finally:
        conn.close()

@app.get("/health")
async def health_check():
    """Basic health check."""
    return {"status": "healthy", "service": "claude-cli-github"}

if __name__ == "__main__":
    logger.info("Starting GitHub-enabled server on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)