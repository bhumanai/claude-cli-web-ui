"""Simplified FastAPI backend for Vercel deployment."""

import os
import json
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Create FastAPI app
app = FastAPI(title="Claude CLI Backend", version="1.0.0")

# Configure CORS to allow all origins temporarily for debugging
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for simplicity (will reset on each deployment)
sessions: Dict[str, Dict] = {}
command_history: Dict[str, List] = {}

class CommandRequest(BaseModel):
    command: str

class CommandResponse(BaseModel):
    id: str
    command: str
    output: str
    status: str
    timestamp: str

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Claude CLI Backend is running"}

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

@app.post("/api/sessions/{session_id}/commands")
async def execute_command(session_id: str, request: CommandRequest):
    """Execute a command for a session."""
    command_id = f"cmd_{datetime.utcnow().timestamp()}"
    
    # Initialize session if it doesn't exist
    if session_id not in sessions:
        sessions[session_id] = {"created": datetime.utcnow().isoformat()}
        command_history[session_id] = []
    
    # Create command response
    response = CommandResponse(
        id=command_id,
        command=request.command,
        output=f"Simulated output for: {request.command}",
        status="completed",
        timestamp=datetime.utcnow().isoformat()
    )
    
    # Store in history
    command_history[session_id].append(response.dict())
    
    return response

@app.get("/api/sessions/{session_id}/commands")
async def get_command_history(session_id: str):
    """Get command history for a session."""
    if session_id not in command_history:
        return {"commands": []}
    return {"commands": command_history[session_id]}

@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str, since: int = 0):
    """Get messages for polling-based communication."""
    if session_id not in command_history:
        return {"messages": []}
    
    # Convert command history to messages format
    messages = []
    for cmd in command_history.get(session_id, []):
        messages.append({
            "type": "command_update",
            "data": {
                "id": cmd["id"],
                "output": cmd["output"],
                "isPartial": False
            }
        })
        messages.append({
            "type": "command_finished",
            "data": {
                "id": cmd["id"],
                "status": cmd["status"]
            }
        })
    
    return {"messages": messages}

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time communication."""
    await websocket.accept()
    
    try:
        # Send connection success message
        await websocket.send_json({
            "type": "connection",
            "data": {"status": "connected", "sessionId": session_id}
        })
        
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            
            if data.get("type") == "execute_command":
                command = data.get("data", {}).get("command", "")
                command_id = f"cmd_{datetime.utcnow().timestamp()}"
                
                # Send command acknowledgment
                await websocket.send_json({
                    "type": "command_started",
                    "data": {"id": command_id, "command": command}
                })
                
                # Simulate command execution
                output = f"Simulated output for: {command}\\n"
                await websocket.send_json({
                    "type": "command_update",
                    "data": {"id": command_id, "output": output, "isPartial": False}
                })
                
                # Send completion
                await websocket.send_json({
                    "type": "command_finished",
                    "data": {"id": command_id, "status": "completed"}
                })
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close(code=1000, reason=str(e))

# Simple authentication endpoint
class SimpleLoginRequest(BaseModel):
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 3600

@app.post("/api/auth/simple-login", response_model=TokenResponse)
async def simple_login(request: SimpleLoginRequest):
    """Simple password authentication."""
    correct_password = os.getenv("SIMPLE_PASSWORD", "claude123")
    
    if request.password != correct_password:
        raise HTTPException(
            status_code=401,
            detail="Invalid password"
        )
    
    # Return a simple token (in production, use proper JWT)
    import secrets
    return TokenResponse(
        access_token=secrets.token_urlsafe(32),
        refresh_token=secrets.token_urlsafe(32),
        token_type="bearer",
        expires_in=3600
    )

# Export for Vercel
handler = app