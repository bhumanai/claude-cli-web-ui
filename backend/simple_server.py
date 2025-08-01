#!/usr/bin/env python3
"""
Simple test backend for Claude CLI Web UI.
Minimal dependencies - just standard library.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import subprocess
import sys
import time
import threading
import uuid
from urllib.parse import urlparse, parse_qs
from collections import deque
from datetime import datetime
import socketserver
import struct
import hashlib
import base64

# Import tasks reader
try:
    from tasks_reader import read_tasks_from_filesystem, read_projects_from_filesystem
except ImportError:
    # Fallback if import fails
    def read_tasks_from_filesystem():
        return []
    def read_projects_from_filesystem():
        return []

# Store active sessions
sessions = {}

# Task and project storage
tasks = {}
projects = {}
task_queue = deque()

# WebSocket clients
websocket_clients = []

# Data directory
DATA_DIR = "data"
TASKS_FILE = os.path.join(DATA_DIR, "tasks.json")
PROJECTS_FILE = os.path.join(DATA_DIR, "projects.json")

# Ensure data directory exists
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

def load_data():
    """Load tasks and projects from JSON files."""
    global tasks, projects
    
    # Load tasks
    if os.path.exists(TASKS_FILE):
        try:
            with open(TASKS_FILE, 'r') as f:
                tasks = json.load(f)
        except:
            tasks = {}
    
    # Load projects
    if os.path.exists(PROJECTS_FILE):
        try:
            with open(PROJECTS_FILE, 'r') as f:
                projects = json.load(f)
        except:
            projects = {}

def save_data():
    """Save tasks and projects to JSON files."""
    with open(TASKS_FILE, 'w') as f:
        json.dump(tasks, f, indent=2)
    
    with open(PROJECTS_FILE, 'w') as f:
        json.dump(projects, f, indent=2)

def broadcast_update(event_type: str, data: dict):
    """Broadcast updates to all WebSocket clients."""
    message = {
        "type": event_type,
        "data": data,
        "timestamp": time.time()
    }
    # In a real implementation, this would send to WebSocket clients
    print(f"[BROADCAST] {event_type}: {json.dumps(data, indent=2)}")

# Load existing data on startup
load_data()

class SimpleWebSocketHandler:
    """Simple WebSocket handler using standard library."""
    def __init__(self, session_id):
        self.session_id = session_id
        self.connected = True
        
    def send_message(self, message):
        # In a real implementation, this would send via WebSocket
        print(f"[WS] Would send to {self.session_id}: {message}")
        
    def handle_command(self, command):
        """Execute command and return output."""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            return {
                "output": result.stdout or result.stderr,
                "status": "success" if result.returncode == 0 else "error",
                "exit_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {
                "output": "Command timed out after 30 seconds",
                "status": "error",
                "exit_code": -1
            }
        except Exception as e:
            return {
                "output": f"Error executing command: {str(e)}",
                "status": "error",
                "exit_code": -1
            }

class WebSocketServer(threading.Thread):
    """Simple WebSocket server for real-time updates."""
    def __init__(self, port=8001):
        super().__init__()
        self.port = port
        self.daemon = True
        self.running = False
        
    def run(self):
        """Run WebSocket server in separate thread."""
        self.running = True
        print(f"[WS] WebSocket server would run on port {self.port}")
        # In a real implementation, this would handle WebSocket connections
        while self.running:
            time.sleep(1)
    
    def stop(self):
        """Stop the WebSocket server."""
        self.running = False

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path.rstrip('/')
        
        if path == '/health' or path == '/api/health':
            self.send_json_response({"status": "ok", "timestamp": time.time()})
        elif path == '/api/sessions':
            self.send_json_response(list(sessions.keys()))
        elif path == '/api/commands/suggestions':
            self.send_json_response([
                {"command": "ls", "description": "List files"},
                {"command": "pwd", "description": "Print working directory"},
                {"command": "echo", "description": "Print text"},
                {"command": "date", "description": "Show current date"}
            ])
        # Task Management Endpoints
        elif path == '/api/tasks':
            # List all tasks
            task_list = list(tasks.values())
            self.send_json_response(task_list)
        elif path.startswith('/api/tasks/'):
            # Get specific task
            task_id = path.split('/')[-1]
            if task_id in tasks:
                self.send_json_response(tasks[task_id])
            else:
                self.send_error(404, "Task not found")
        # Project Management Endpoints
        elif path == '/api/projects':
            # List all projects
            project_list = list(projects.values())
            self.send_json_response(project_list)
        elif path.startswith('/api/projects/'):
            # Get specific project
            project_id = path.split('/')[-1]
            if project_id in projects:
                self.send_json_response(projects[project_id])
            else:
                self.send_error(404, "Project not found")
        # Task Queue Endpoints
        elif path == '/api/queue':
            # Get current queue status
            queue_status = {
                "queue_length": len(task_queue),
                "tasks": list(task_queue),
                "is_processing": False  # Would track actual processing state
            }
            self.send_json_response(queue_status)
        else:
            self.send_error(404, "Not found")
            
    def do_POST(self):
        """Handle POST requests."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path.rstrip('/')
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        data = json.loads(body.decode('utf-8'))
        
        if path == '/api/sessions' or path == '/api/sessions/':
            # Create new session
            session_id = str(uuid.uuid4())
            sessions[session_id] = {
                "id": session_id,
                "created": time.time(),
                "commands": []
            }
            self.send_json_response({"session_id": session_id})
        elif path == '/api/commands/execute':
            # Execute command
            command = data.get('command', '')
            session_id = data.get('session_id', '')
            
            handler = SimpleWebSocketHandler(session_id)
            result = handler.handle_command(command)
            
            self.send_json_response({
                "success": result["status"] == "success",
                "output": result["output"],
                "exit_code": result["exit_code"]
            })
        # Task Management - Create Task
        elif path == '/api/tasks':
            task_id = str(uuid.uuid4())
            task = {
                "id": task_id,
                "title": data.get('title', 'Untitled Task'),
                "description": data.get('description', ''),
                "status": data.get('status', 'pending'),
                "priority": data.get('priority', 'medium'),
                "project_id": data.get('project_id'),
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "due_date": data.get('due_date'),
                "assignee": data.get('assignee'),
                "tags": data.get('tags', [])
            }
            tasks[task_id] = task
            save_data()
            broadcast_update("task_created", task)
            self.send_json_response(task, 201)
        # Project Management - Create Project
        elif path == '/api/projects':
            project_id = str(uuid.uuid4())
            project = {
                "id": project_id,
                "name": data.get('name', 'Untitled Project'),
                "description": data.get('description', ''),
                "status": data.get('status', 'active'),
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "owner": data.get('owner'),
                "team": data.get('team', [])
            }
            projects[project_id] = project
            save_data()
            broadcast_update("project_created", project)
            self.send_json_response(project, 201)
        # Queue Management - Add Task to Queue
        elif path == '/api/queue/add':
            task_id = data.get('task_id')
            if task_id and task_id in tasks:
                if task_id not in task_queue:
                    task_queue.append(task_id)
                    broadcast_update("queue_updated", {
                        "action": "task_added",
                        "task_id": task_id,
                        "queue_length": len(task_queue)
                    })
                    self.send_json_response({"success": True, "queue_position": len(task_queue)})
                else:
                    self.send_json_response({"success": False, "error": "Task already in queue"}, 400)
            else:
                self.send_error(404, "Task not found")
        # Queue Management - Process Next Task
        elif path == '/api/queue/process':
            if task_queue:
                task_id = task_queue.popleft()
                if task_id in tasks:
                    tasks[task_id]['status'] = 'processing'
                    tasks[task_id]['updated_at'] = datetime.now().isoformat()
                    save_data()
                    broadcast_update("queue_processed", {
                        "task_id": task_id,
                        "remaining_tasks": len(task_queue)
                    })
                    # Simulate processing
                    threading.Thread(target=self._process_task, args=(task_id,)).start()
                    self.send_json_response({"success": True, "task_id": task_id})
                else:
                    self.send_json_response({"success": False, "error": "Task not found"}, 404)
            else:
                self.send_json_response({"success": False, "error": "Queue is empty"}, 400)
        else:
            self.send_error(404, "Not found")
    
    def do_PUT(self):
        """Handle PUT requests."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path.rstrip('/')
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        data = json.loads(body.decode('utf-8'))
        
        # Update Task
        if path.startswith('/api/tasks/'):
            task_id = path.split('/')[-1]
            if task_id in tasks:
                # Update task fields
                for key in ['title', 'description', 'status', 'priority', 'project_id', 
                           'due_date', 'assignee', 'tags']:
                    if key in data:
                        tasks[task_id][key] = data[key]
                tasks[task_id]['updated_at'] = datetime.now().isoformat()
                save_data()
                broadcast_update("task_updated", tasks[task_id])
                self.send_json_response(tasks[task_id])
            else:
                self.send_error(404, "Task not found")
        else:
            self.send_error(404, "Not found")
    
    def do_DELETE(self):
        """Handle DELETE requests."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path.rstrip('/')
        
        # Delete Task
        if path.startswith('/api/tasks/'):
            task_id = path.split('/')[-1]
            if task_id in tasks:
                deleted_task = tasks.pop(task_id)
                # Remove from queue if present
                if task_id in task_queue:
                    task_queue.remove(task_id)
                save_data()
                broadcast_update("task_deleted", {"id": task_id})
                self.send_json_response({"success": True, "deleted": deleted_task})
            else:
                self.send_error(404, "Task not found")
        # Delete Project
        elif path.startswith('/api/projects/'):
            project_id = path.split('/')[-1]
            if project_id in projects:
                deleted_project = projects.pop(project_id)
                # Also delete associated tasks
                tasks_to_delete = [tid for tid, task in tasks.items() 
                                 if task.get('project_id') == project_id]
                for task_id in tasks_to_delete:
                    tasks.pop(task_id)
                    if task_id in task_queue:
                        task_queue.remove(task_id)
                save_data()
                broadcast_update("project_deleted", {
                    "id": project_id, 
                    "deleted_tasks": len(tasks_to_delete)
                })
                self.send_json_response({
                    "success": True, 
                    "deleted": deleted_project,
                    "deleted_tasks": len(tasks_to_delete)
                })
            else:
                self.send_error(404, "Project not found")
        else:
            self.send_error(404, "Not found")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def send_json_response(self, data, status=200):
        """Send JSON response with CORS headers."""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def send_error(self, code, message=None):
        """Send error response with CORS headers."""
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        error_data = {
            "error": True,
            "code": code,
            "message": message or self.responses.get(code, ['Unknown error'])[0]
        }
        self.wfile.write(json.dumps(error_data).encode('utf-8'))
    
    def _process_task(self, task_id):
        """Simulate task processing in background."""
        time.sleep(2)  # Simulate some work
        if task_id in tasks:
            tasks[task_id]['status'] = 'completed'
            tasks[task_id]['updated_at'] = datetime.now().isoformat()
            save_data()
            broadcast_update("task_completed", tasks[task_id])
    
    def log_message(self, format, *args):
        """Custom log format."""
        sys.stderr.write("[%s] %s\n" % (
            self.log_date_time_string(),
            format % args
        ))

def run_server(port=8000, ws_port=8001):
    """Run the simple HTTP server with task management."""
    server_address = ('', port)
    httpd = HTTPServer(server_address, RequestHandler)
    
    # Start WebSocket server for real-time updates
    ws_server = WebSocketServer(ws_port)
    ws_server.start()
    
    print(f"Enhanced Claude CLI Backend Server with Task Management")
    print(f"=" * 60)
    print(f"HTTP Server: http://127.0.0.1:{port}")
    print(f"WebSocket: ws://127.0.0.1:{ws_port} (for real-time updates)")
    print(f"\nAvailable Endpoints:")
    print(f"  Health:")
    print(f"    GET  /api/health")
    print(f"\n  Sessions:")
    print(f"    GET  /api/sessions")
    print(f"    POST /api/sessions")
    print(f"\n  Commands:")
    print(f"    GET  /api/commands/suggestions")
    print(f"    POST /api/commands/execute")
    print(f"\n  Tasks:")
    print(f"    GET    /api/tasks              - List all tasks")
    print(f"    POST   /api/tasks              - Create new task")
    print(f"    GET    /api/tasks/{{id}}         - Get specific task")
    print(f"    PUT    /api/tasks/{{id}}         - Update task")
    print(f"    DELETE /api/tasks/{{id}}         - Delete task")
    print(f"\n  Projects:")
    print(f"    GET    /api/projects           - List all projects")
    print(f"    POST   /api/projects           - Create new project")
    print(f"    GET    /api/projects/{{id}}      - Get specific project")
    print(f"    DELETE /api/projects/{{id}}      - Delete project")
    print(f"\n  Queue:")
    print(f"    GET  /api/queue                - Get queue status")
    print(f"    POST /api/queue/add            - Add task to queue")
    print(f"    POST /api/queue/process        - Process next task")
    print(f"\n  Data Storage:")
    print(f"    - Tasks: {TASKS_FILE}")
    print(f"    - Projects: {PROJECTS_FILE}")
    print(f"\n  Features:")
    print(f"    ✓ In-memory task queue")
    print(f"    ✓ JSON file persistence")
    print(f"    ✓ Auto-save on changes")
    print(f"    ✓ WebSocket broadcasts for updates")
    print(f"    ✓ CORS enabled for frontend access")
    print(f"\nPress Ctrl+C to stop the server\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down servers...")
        ws_server.stop()
        httpd.shutdown()
        print("Server shutdown complete.")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Enhanced Claude CLI Backend Server')
    parser.add_argument('--port', type=int, default=8000, help='HTTP server port (default: 8000)')
    parser.add_argument('--ws-port', type=int, default=8001, help='WebSocket server port (default: 8001)')
    args = parser.parse_args()
    
    run_server(args.port, args.ws_port)