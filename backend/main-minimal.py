#!/usr/bin/env python3
"""
Minimal Claude CLI Web UI Backend - Works with Python 3.13
"""

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio


# Create minimal app
app = FastAPI(
    title="Claude CLI Web UI",
    description="Web interface for Claude CLI",
    version="1.0.0"
)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Health endpoint
@app.get("/api/health/")
async def health():
    return {"status": "ok", "message": "Backend running"}

# Command execution endpoint
@app.post("/api/commands/execute")
async def execute_command():
    return {"message": "Command execution working"}

# Agent test endpoint  
@app.post("/api/commands/agent-test")
async def agent_test():
    return {"message": "Agent test working"}

# Projects endpoint
@app.get("/api/projects/")
async def get_projects():
    # Add the actual project with tasks
    projects = [
        {
            "id": "/Users/don/Gesture Generator/gesture_generator/tasks",
            "name": "Gesture Generator Tasks",
            "description": "Tasks from Gesture Generator project",
            "path": "/Users/don/Gesture Generator/gesture_generator/tasks"
        }
    ]
    return {"data": projects, "error": None}

# Tasks endpoint that actually reads from filesystem
@app.get("/api/projects/{project_id:path}/tasks")
async def get_project_tasks(project_id: str):
    import os
    import glob
    from datetime import datetime
    from urllib.parse import unquote
    
    # Decode URL-encoded path and use as the tasks directory  
    tasks_path = unquote(project_id)
    
    # Fix missing leading slash if needed
    if not tasks_path.startswith('/'):
        tasks_path = '/' + tasks_path
    
    print(f"DEBUG: Raw project_id: {project_id}")
    print(f"DEBUG: Decoded tasks_path: {tasks_path}")
    print(f"DEBUG: Path exists: {os.path.exists(tasks_path)}")
    
    # Debug: list what's in the directory if it exists
    if os.path.exists(tasks_path):
        try:
            items = os.listdir(tasks_path)
            print(f"DEBUG: Directory contents: {items}")
        except Exception as e:
            print(f"DEBUG: Error listing directory: {e}")
    
    # Check if it's a valid path and contains tasks
    if not os.path.exists(tasks_path):
        return {"data": [], "error": None}
    
    tasks = []
    
    # Look for task directories
    task_pattern = os.path.join(tasks_path, "task-*")
    task_dirs = glob.glob(task_pattern)
    
    for task_dir in task_dirs:
        if os.path.isdir(task_dir):
            task_md_path = os.path.join(task_dir, "task.md")
            
            # Extract task info from directory name and task.md if it exists
            task_name = os.path.basename(task_dir)
            description = "Task from filesystem"
            
            # Try to read task.md for more info
            if os.path.exists(task_md_path):
                try:
                    with open(task_md_path, 'r') as f:
                        content = f.read()
                        # Extract title from first line or use directory name
                        lines = content.split('\n')
                        if lines and lines[0].startswith('#'):
                            task_name = lines[0].strip('# ')
                        description = content[:200] + "..." if len(content) > 200 else content
                except:
                    pass
            
            # Create task object
            task = {
                "id": task_name.replace("-", "_"),
                "name": task_name,
                "description": description,
                "status": "completed",  # Assume existing tasks are completed
                "priority": "medium",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "path": task_dir
            }
            tasks.append(task)
    
    return {"data": tasks, "error": None}

# WebSocket endpoint for terminal functionality
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                command = message.get("command", "")
                
                # Simple command echo for demo
                response = {
                    "type": "output",
                    "data": f"Echo: {command}",
                    "timestamp": "2025-01-31T00:00:00Z",
                    "status": "completed"
                }
                
                await websocket.send_text(json.dumps(response))
                
            except json.JSONDecodeError:
                error_response = {
                    "type": "error", 
                    "data": "Invalid JSON received",
                    "timestamp": "2025-01-31T00:00:00Z"
                }
                await websocket.send_text(json.dumps(error_response))
                
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for session: {session_id}")
    except Exception as e:
        print(f"WebSocket error for session {session_id}: {e}")


if __name__ == "__main__":
    print("🚀 Starting Claude CLI Web UI (Minimal Backend)")
    print("===============================================")
    print("✅ Health checks")
    print("✅ Basic API endpoints")
    print("❌ Database features (disabled)")
    print("❌ Advanced features (disabled)")
    print()
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )