#!/usr/bin/env python3
"""
Simple FastAPI server with WebSocket support for Claude CLI Web UI.
Minimal version without database dependencies.
"""

import asyncio
import json
import os
import subprocess
import uuid
from datetime import datetime
from typing import Dict, List, Set

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Request/Response Models
class SessionCreateResponse(BaseModel):
    session_id: str

class CommandExecuteRequest(BaseModel):
    command: str
    session_id: str

class CommandExecuteResponse(BaseModel):
    success: bool
    output: str
    exit_code: int

class TaskCreateRequest(BaseModel):
    name: str
    description: str = ""
    priority: str = "medium"

class Task(BaseModel):
    id: str
    name: str
    description: str
    status: str
    priority: str
    created_at: str
    updated_at: str
    path: str = ""

class Project(BaseModel):
    id: str
    name: str
    description: str
    created_at: str
    path: str = ""

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_connections: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        connection_id = str(uuid.uuid4())
        self.active_connections[connection_id] = websocket
        
        if session_id not in self.session_connections:
            self.session_connections[session_id] = set()
        self.session_connections[session_id].add(connection_id)
        
        print(f"WebSocket connected: {connection_id} for session {session_id}")
        return connection_id

    def disconnect(self, connection_id: str, session_id: str):
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]
        
        if session_id in self.session_connections:
            self.session_connections[session_id].discard(connection_id)
            if not self.session_connections[session_id]:
                del self.session_connections[session_id]
        
        print(f"WebSocket disconnected: {connection_id}")

    async def send_personal_message(self, connection_id: str, message: dict):
        if connection_id in self.active_connections:
            try:
                await self.active_connections[connection_id].send_text(json.dumps(message))
                return True
            except:
                return False
        return False

    async def broadcast_to_session(self, session_id: str, message: dict):
        if session_id in self.session_connections:
            for connection_id in list(self.session_connections[session_id]):
                await self.send_personal_message(connection_id, message)

# Data loading functions
def load_data():
    """Load existing tasks and projects from JSON files."""
    global tasks, projects
    
    # Load tasks
    tasks_file = "/Users/don/D3/backend/data/tasks.json"
    if os.path.exists(tasks_file):
        try:
            with open(tasks_file, 'r') as f:
                task_data = json.load(f)
                for task_id, task_info in task_data.items():
                    tasks[task_id] = Task(**task_info)
        except Exception as e:
            print(f"Error loading tasks: {e}")
    
    # Load projects  
    projects_file = "/Users/don/D3/backend/data/projects.json"
    if os.path.exists(projects_file):
        try:
            with open(projects_file, 'r') as f:
                project_data = json.load(f)
                for project_id, project_info in project_data.items():
                    # Convert to our Project model format
                    projects[project_id] = Project(
                        id=project_info["id"],
                        name=project_info["name"], 
                        description=project_info.get("description", ""),
                        created_at=project_info["created_at"],
                        path=project_info.get("path", "/Users/don/D3")  # Default path
                    )
        except Exception as e:
            print(f"Error loading projects: {e}")

def save_data():
    """Save tasks and projects to JSON files."""
    try:
        # Save projects
        projects_file = "/Users/don/D3/backend/data/projects.json"
        project_data = {}
        for project_id, project in projects.items():
            project_data[project_id] = {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "created_at": project.created_at,
                "path": project.path,
                "status": "active",
                "updated_at": project.created_at,
                "owner": None,
                "team": []
            }
        
        with open(projects_file, 'w') as f:
            json.dump(project_data, f, indent=2)
        
        # Save tasks (empty for now)
        tasks_file = "/Users/don/D3/backend/data/tasks.json"
        task_data = {}
        for task_id, task in tasks.items():
            task_data[task_id] = {
                "id": task.id,
                "name": task.name,
                "description": task.description,
                "status": task.status,
                "priority": task.priority,
                "created_at": task.created_at,
                "updated_at": task.updated_at,
                "path": task.path
            }
        
        with open(tasks_file, 'w') as f:
            json.dump(task_data, f, indent=2)
            
    except Exception as e:
        print(f"Error saving data: {e}")

# Global instances
app = FastAPI(title="Claude CLI Web UI", version="1.0.0")
manager = ConnectionManager()
sessions = {}
tasks = {}
projects = {}

# Load existing data on startup
load_data()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Command execution function
async def execute_command_async(command: str) -> dict:
    """Execute command asynchronously."""
    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        output = stdout.decode() if stdout else stderr.decode()
        return {
            "output": output,
            "exit_code": process.returncode,
            "success": process.returncode == 0
        }
    except Exception as e:
        return {
            "output": f"Error executing command: {str(e)}",
            "exit_code": -1,
            "success": False
        }

# API Endpoints
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.post("/api/sessions", response_model=SessionCreateResponse)
async def create_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "id": session_id,
        "created": datetime.now().isoformat(),
        "commands": []
    }
    return SessionCreateResponse(session_id=session_id)

@app.post("/api/commands/execute", response_model=CommandExecuteResponse)
async def execute_command(request: CommandExecuteRequest):
    result = await execute_command_async(request.command)
    
    # Store in session history
    if request.session_id in sessions:
        sessions[request.session_id]["commands"].append({
            "command": request.command,
            "output": result["output"],
            "timestamp": datetime.now().isoformat(),
            "exit_code": result["exit_code"]
        })
    
    return CommandExecuteResponse(
        success=result["success"],
        output=result["output"],
        exit_code=result["exit_code"]
    )

@app.get("/api/tasks")
async def get_tasks():
    return list(tasks.values())

@app.post("/api/tasks")
async def create_task(request: TaskCreateRequest):
    task_id = str(uuid.uuid4())
    task = Task(
        id=task_id,
        name=request.name,
        description=request.description,
        status="pending",
        priority=request.priority,
        created_at=datetime.now().isoformat(),
        updated_at=datetime.now().isoformat()
    )
    tasks[task_id] = task
    return task

@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

@app.put("/api/tasks/{task_id}")
async def update_task_status(task_id: str, status: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = tasks[task_id]
    task.status = status
    task.updated_at = datetime.now().isoformat()
    return task

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    deleted_task = tasks.pop(task_id)
    return {"success": True, "deleted": deleted_task}

@app.get("/api/projects")
async def get_projects():
    return list(projects.values())

class ProjectCreateRequest(BaseModel):
    name: str
    path: str
    description: str = ""

@app.post("/api/projects")
async def create_project(request: ProjectCreateRequest):
    project_id = str(uuid.uuid4())
    project = Project(
        id=project_id,
        name=request.name,
        description=request.description,
        created_at=datetime.now().isoformat(),
        path=request.path
    )
    projects[project_id] = project
    save_data()  # Save to file
    return project

@app.get("/api/queue")
async def get_queue():
    return {
        "queue_length": 0,
        "tasks": [],
        "is_processing": False
    }

# WebSocket endpoint
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    connection_id = await manager.connect(websocket, session_id)
    
    # Send welcome message
    await manager.send_personal_message(connection_id, {
        "type": "welcome",
        "session_id": session_id,
        "data": {
            "connection_id": connection_id,
            "message": "Connected to Claude CLI Web UI"
        }
    })
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "execute_command":
                command = message.get("command", "").strip()
                if command:
                    # Send command start notification
                    await manager.send_personal_message(connection_id, {
                        "type": "command_started",
                        "session_id": session_id,
                        "data": {"command": command}
                    })
                    
                    # Execute command
                    result = await execute_command_async(command)
                    
                    # Send command update with output
                    await manager.send_personal_message(connection_id, {
                        "type": "command_update",
                        "session_id": session_id,
                        "data": {
                            "command": command,
                            "output": [{"content": result["output"], "type": "stdout", "timestamp": datetime.now().isoformat()}],
                            "status": "completed" if result["success"] else "failed",
                            "exit_code": result["exit_code"]
                        }
                    })
                    
                    # Send command finished notification
                    await manager.send_personal_message(connection_id, {
                        "type": "command_finished",
                        "session_id": session_id,
                        "data": {
                            "status": "completed" if result["success"] else "failed",
                            "exit_code": result["exit_code"],
                            "error": None if result["success"] else result["output"]
                        }
                    })
            
            elif message.get("type") == "ping":
                await manager.send_personal_message(connection_id, {
                    "type": "pong",
                    "session_id": session_id,
                    "data": {"timestamp": message.get("timestamp")}
                })
                
    except WebSocketDisconnect:
        manager.disconnect(connection_id, session_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(connection_id, session_id)

if __name__ == "__main__":
    print("Starting Claude CLI Web UI FastAPI Server with WebSocket support")
    print("=" * 60)
    print("Server: http://127.0.0.1:8001")
    print("WebSocket: ws://127.0.0.1:8001/ws/{session_id}")
    print("API Documentation: http://127.0.0.1:8001/docs")
    print("\nPress Ctrl+C to stop the server\n")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8001,
        log_level="info"
    )