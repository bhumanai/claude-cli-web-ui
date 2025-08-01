#!/usr/bin/env python3
"""
Enhanced Claude CLI Web UI Backend - Works with Python 3.13 and includes Claude CLI support
"""

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
import subprocess
import shutil
from typing import Optional
from datetime import datetime

# Create app with Claude CLI support
app = FastAPI(
    title="Claude CLI Web UI - Enhanced",
    description="Web interface for Claude CLI with command execution",
    version="2.0.0"
)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Check if Claude is available
def check_claude_cli():
    """Check if Claude CLI is installed and available"""
    return shutil.which("claude") is not None

CLAUDE_AVAILABLE = check_claude_cli()

# Health endpoint
@app.get("/api/health/")
async def health():
    return {
        "status": "ok", 
        "message": "Backend running with Claude CLI support",
        "claude_available": CLAUDE_AVAILABLE
    }

# Command execution endpoint
@app.post("/api/commands/execute")
async def execute_command(request: dict):
    command = request.get("command", "")
    
    if CLAUDE_AVAILABLE and command.strip():
        try:
            # Execute Claude command
            result = subprocess.run(
                ["claude", "code"],
                input=command,
                capture_output=True,
                text=True,
                timeout=30
            )
            return {
                "success": True,
                "output": result.stdout or result.stderr,
                "command": command
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "output": "Command timed out after 30 seconds",
                "command": command
            }
        except Exception as e:
            return {
                "success": False,
                "output": f"Error executing command: {str(e)}",
                "command": command
            }
    
    return {"message": "Command execution working", "claude_available": CLAUDE_AVAILABLE}

# Agent test endpoint  
@app.post("/api/commands/agent-test")
async def agent_test(request: dict):
    task_name = request.get("task_name", "")
    context = request.get("context", "")
    
    if CLAUDE_AVAILABLE and task_name:
        command = f"/agent-test '{task_name}' '{context}'"
        try:
            result = subprocess.run(
                ["claude", "code"],
                input=command,
                capture_output=True,
                text=True,
                timeout=60
            )
            return {
                "success": True,
                "message": "Agent test started",
                "session_id": f"agent-test-{request.get('task_id', 'unknown')}",
                "output": result.stdout or result.stderr
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to start agent test: {str(e)}",
                "session_id": None
            }
    
    return {"message": "Agent test endpoint", "claude_available": CLAUDE_AVAILABLE}

# Projects endpoint
@app.get("/api/projects/")
async def get_projects():
    projects = [
        {
            "id": "/Users/don/Gesture Generator/gesture_generator/tasks",
            "name": "Gesture Generator Tasks",
            "description": "Tasks from Gesture Generator project",
            "path": "/Users/don/Gesture Generator/gesture_generator/tasks"
        }
    ]
    return {"data": projects, "error": None}

# Tasks endpoint that reads from filesystem
@app.get("/api/projects/{project_id:path}/tasks")
async def get_project_tasks(project_id: str):
    import os
    import glob
    from datetime import datetime
    from urllib.parse import unquote
    
    # Decode URL-encoded path and fix missing leading slash
    tasks_path = unquote(project_id)
    if not tasks_path.startswith('/'):
        tasks_path = '/' + tasks_path
    
    print(f"DEBUG: Loading tasks from: {tasks_path}")
    
    if not os.path.exists(tasks_path):
        return {"data": [], "error": None}
    
    tasks = []
    
    # Look for task directories
    task_pattern = os.path.join(tasks_path, "task-*")
    task_dirs = glob.glob(task_pattern)
    
    for task_dir in task_dirs:
        if os.path.isdir(task_dir):
            task_md_path = os.path.join(task_dir, "task.md")
            
            # Extract task info
            task_name = os.path.basename(task_dir)
            description = "Task from filesystem"
            status = "pending"  # Default status
            priority = "medium"  # Default priority
            created_at = datetime.now().isoformat()
            
            # Try to read task.md for more info
            if os.path.exists(task_md_path):
                try:
                    with open(task_md_path, 'r') as f:
                        content = f.read()
                        lines = content.split('\n')
                        
                        # Extract title from first line
                        if lines and lines[0].startswith('#'):
                            task_name = lines[0].strip('# ')
                        
                        # Extract metadata from content
                        for line in lines:
                            if line.startswith('**Status**:'):
                                status = line.split(':', 1)[1].strip()
                            elif line.startswith('**Priority**:'):
                                priority = line.split(':', 1)[1].strip()
                            elif line.startswith('**Created**:'):
                                try:
                                    created_at = line.split(':', 1)[1].strip()
                                except:
                                    pass
                        
                        description = content[:200] + "..." if len(content) > 200 else content
                except:
                    pass
            
            # Create task object
            task = {
                "id": os.path.basename(task_dir),  # Use directory name as ID
                "name": task_name,
                "description": description,
                "status": status,
                "priority": priority,
                "created_at": created_at,
                "updated_at": datetime.now().isoformat(),
                "path": task_dir
            }
            tasks.append(task)
    
    return {"data": tasks, "error": None}

# Create task endpoint
@app.post("/api/projects/{project_id:path}/tasks")
async def create_task(project_id: str, task: dict):
    import os
    from urllib.parse import unquote
    
    # Decode URL-encoded path and fix missing leading slash
    tasks_path = unquote(project_id)
    if not tasks_path.startswith('/'):
        tasks_path = '/' + tasks_path
    
    # Extract task details
    name = task.get("name", "New Task")
    description = task.get("description", "")
    priority = task.get("priority", "medium")
    status = task.get("status", "pending")
    
    # Generate task directory name
    timestamp = int(datetime.now().timestamp())
    safe_name = name.lower().replace(" ", "-").replace("/", "-")[:50]
    task_dir_name = f"task-{timestamp}-{safe_name}"
    task_dir_path = os.path.join(tasks_path, task_dir_name)
    
    try:
        # Create task directory
        os.makedirs(task_dir_path, exist_ok=True)
        
        # Create task.md file
        task_md_path = os.path.join(task_dir_path, "task.md")
        task_content = f"""# {name}

**Status**: {status}
**Priority**: {priority}
**Created**: {datetime.now().isoformat()}

## Description

{description}

## Planning

*Waiting for /plan execution...*

## Implementation

*Not started*

"""
        
        with open(task_md_path, 'w', encoding='utf-8') as f:
            f.write(task_content)
        
        # Return created task object
        created_task = {
            "id": task_dir_name,  # Use the directory name as ID for consistency
            "name": name,
            "description": description,
            "status": status,
            "priority": priority,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "path": task_dir_path
        }
        
        return {"data": created_task, "error": None}
        
    except Exception as e:
        return {"data": None, "error": f"Failed to create task: {str(e)}"}

# Task content endpoint - read full task.md file
@app.get("/api/tasks/{task_id}/content")
async def get_task_content(task_id: str):
    import os
    import glob
    
    # Search for task directory by ID
    base_paths = [
        "/Users/don/Gesture Generator/gesture_generator/tasks",
        "/Users/don/D3/tasks"
    ]
    
    for base_path in base_paths:
        if not os.path.exists(base_path):
            continue
            
        # Look for matching task directories
        task_dirs = glob.glob(os.path.join(base_path, "task-*"))
        
        for task_dir in task_dirs:
            # Check if this directory matches the task ID
            dir_name = os.path.basename(task_dir)
            task_md_path = os.path.join(task_dir, "task.md")
            
            # Try to match by directory name first
            if task_id == dir_name or task_id in dir_name:
                if os.path.exists(task_md_path):
                    try:
                        with open(task_md_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        return {"content": content, "error": None}
                    except Exception as e:
                        return {"content": None, "error": str(e)}
            
            # Also try to match by task title in the file
            elif os.path.exists(task_md_path):
                try:
                    with open(task_md_path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        f.seek(0)  # Reset to beginning
                        
                        # Extract title from markdown header
                        if first_line.startswith('#'):
                            title = first_line.strip('# ').strip()
                            if title == task_id or title.replace("-", "_") == task_id:
                                content = f.read()
                                return {"content": content, "error": None}
                except:
                    continue
    
    return {"content": None, "error": "Task file not found"}

# WebSocket endpoint for terminal functionality with Claude support
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    # Send initial connection message
    await websocket.send_json({
        "type": "connected",
        "data": f"Connected to Claude CLI Enhanced Backend",
        "claude_available": CLAUDE_AVAILABLE,
        "timestamp": datetime.now().isoformat()
    })
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                command = message.get("command", "")
                
                if CLAUDE_AVAILABLE and command.strip():
                    # Execute Claude command with real-time streaming
                    process = await asyncio.create_subprocess_exec(
                        "claude", "code",
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    
                    # Send command to Claude
                    process.stdin.write(command.encode() + b'\n')
                    await process.stdin.drain()
                    process.stdin.close()
                    
                    # Stream output
                    while True:
                        line = await process.stdout.readline()
                        if not line:
                            break
                        
                        await websocket.send_json({
                            "type": "output",
                            "data": line.decode(),
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    # Wait for completion
                    await process.wait()
                    
                    # Send completion status
                    await websocket.send_json({
                        "type": "completed",
                        "status": "success" if process.returncode == 0 else "error",
                        "timestamp": datetime.now().isoformat()
                    })
                else:
                    # Fallback for when Claude is not available
                    await websocket.send_json({
                        "type": "output",
                        "data": f"Claude CLI not available. Command received: {command}",
                        "timestamp": datetime.now().isoformat(),
                        "status": "completed"
                    })
                
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "data": "Invalid JSON received",
                    "timestamp": datetime.now().isoformat()
                })
                
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for session: {session_id}")
    except Exception as e:
        print(f"WebSocket error for session {session_id}: {e}")
        await websocket.send_json({
            "type": "error",
            "data": str(e),
            "timestamp": datetime.now().isoformat()
        })


if __name__ == "__main__":
    print("🚀 Starting Claude CLI Web UI (Enhanced Backend)")
    print("===============================================")
    print("✅ Health checks")
    print("✅ Basic API endpoints")
    print(f"{'✅' if CLAUDE_AVAILABLE else '❌'} Claude CLI integration")
    print("✅ WebSocket support")
    print("✅ Real-time command streaming")
    print()
    
    if not CLAUDE_AVAILABLE:
        print("⚠️  WARNING: Claude CLI not found in PATH")
        print("   Install with: npm install -g @anthropics/claude-cli")
        print()
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )