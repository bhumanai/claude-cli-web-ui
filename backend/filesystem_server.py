#!/usr/bin/env python3
"""
Backend server for Claude CLI Web UI that reads tasks from filesystem.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import time
import uuid
from urllib.parse import urlparse, parse_qs
from datetime import datetime
import sys
import os

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tasks_reader import read_tasks_from_filesystem, read_projects_from_filesystem

# Store sessions
sessions = {}

# In-memory storage for created items (that aren't in filesystem yet)
memory_tasks = {}
memory_projects = {}

# Load saved projects on startup
PROJECTS_FILE = 'projects.json'
if os.path.exists(PROJECTS_FILE):
    try:
        with open(PROJECTS_FILE, 'r') as f:
            saved_projects = json.load(f)
            memory_projects.update(saved_projects)
            print(f"Loaded {len(saved_projects)} saved projects")
    except Exception as e:
        print(f"Error loading saved projects: {e}")

def save_projects():
    """Save memory projects to file for persistence."""
    try:
        with open(PROJECTS_FILE, 'w') as f:
            json.dump(memory_projects, f, indent=2)
    except Exception as e:
        print(f"Error saving projects: {e}")

class FilesystemHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)
        
        # Reject WebSocket requests
        if parsed_path.path.startswith('/ws/'):
            self.send_error(404, "WebSocket not implemented")
            return
            
        # API endpoints
        if parsed_path.path in ['/health', '/api/health', '/api/health/']:
            self.send_json_response({"status": "ok", "timestamp": time.time()})
            
        elif parsed_path.path == '/api/sessions':
            self.send_json_response(list(sessions.keys()))
            
        elif parsed_path.path == '/api/commands/suggestions':
            self.send_json_response([
                {"command": "ls", "description": "List files"},
                {"command": "pwd", "description": "Print working directory"},
                {"command": "echo", "description": "Print text"},
                {"command": "date", "description": "Show current date"}
            ])
            
        elif parsed_path.path == '/api/tasks':
            # Parse query parameters
            query_params = parse_qs(parsed_path.query)
            project_id = query_params.get('project_id', [None])[0]
            
            # Start with D3 tasks
            fs_tasks = read_tasks_from_filesystem()
            all_tasks = fs_tasks + list(memory_tasks.values())
            
            # If a specific project is requested, check if it has a custom path
            if project_id:
                # Filter existing tasks by project_id
                all_tasks = [t for t in all_tasks if t.get('project_id') == project_id]
                
                # For user-created projects, try to read tasks from their path
                if project_id in memory_projects:
                    project = memory_projects[project_id]
                    project_path = project.get('path', '')
                    # Clean up the path (remove quotes if present)
                    project_path = project_path.strip("'\"")
                    
                    # Check if this project has a tasks subdirectory
                    if project_path and os.path.exists(project_path):
                        tasks_path = os.path.join(project_path, 'tasks')
                        if os.path.exists(tasks_path):
                            # Read tasks from the project's tasks directory
                            project_tasks = read_tasks_from_filesystem(tasks_path)
                            # Assign project_id to these tasks
                            for task in project_tasks:
                                task['project_id'] = project_id
                            all_tasks.extend(project_tasks)
                else:
                    # Check if it's in the combined projects list
                    all_projects = read_projects_from_filesystem() + list(memory_projects.values())
                    project = next((p for p in all_projects if p['id'] == project_id), None)
                    if project:
                        project_path = project.get('path', '').strip("'\"")
                        if project_path and os.path.exists(project_path):
                            tasks_path = os.path.join(project_path, 'tasks')
                            if os.path.exists(tasks_path):
                                project_tasks = read_tasks_from_filesystem(tasks_path)
                                for task in project_tasks:
                                    task['project_id'] = project_id
                                all_tasks.extend(project_tasks)
            
            self.send_json_response(all_tasks)
            
        elif parsed_path.path.startswith('/api/tasks/') and parsed_path.path.endswith('/content'):
            # Get full task content from task.md
            task_id = parsed_path.path.split('/')[-2]
            fs_tasks = read_tasks_from_filesystem()
            task = next((t for t in fs_tasks if t['id'] == task_id), None)
            
            if task and 'path' in task:
                task_md_path = os.path.join(task['path'], 'task.md')
                if os.path.exists(task_md_path):
                    try:
                        with open(task_md_path, 'r') as f:
                            content = f.read()
                        self.send_json_response({"content": content})
                    except Exception as e:
                        self.send_json_response({"content": f"Error reading task.md: {str(e)}"})
                else:
                    self.send_json_response({"content": "No task.md file found for this task."})
            else:
                self.send_error(404, "Task not found")
                
        elif parsed_path.path.startswith('/api/tasks/'):
            task_id = parsed_path.path.split('/')[-1]
            # Check memory first, then filesystem
            if task_id in memory_tasks:
                self.send_json_response(memory_tasks[task_id])
            else:
                fs_tasks = read_tasks_from_filesystem()
                task = next((t for t in fs_tasks if t['id'] == task_id), None)
                if task:
                    self.send_json_response(task)
                else:
                    self.send_error(404, "Task not found")
                    
        elif parsed_path.path == '/api/projects':
            # Combine filesystem projects with memory projects
            fs_projects = read_projects_from_filesystem()
            all_projects = fs_projects + list(memory_projects.values())
            self.send_json_response(all_projects)
            
        elif parsed_path.path.startswith('/api/projects/'):
            project_id = parsed_path.path.split('/')[-1]
            if project_id in memory_projects:
                self.send_json_response(memory_projects[project_id])
            else:
                fs_projects = read_projects_from_filesystem()
                project = next((p for p in fs_projects if p['id'] == project_id), None)
                if project:
                    self.send_json_response(project)
                else:
                    self.send_error(404, "Project not found")
                    
        elif parsed_path.path == '/api/queue':
            self.send_json_response({
                "queue": [],
                "processing": False,
                "size": 0
            })
            
        else:
            self.send_error(404, "Not found")
    
    def do_POST(self):
        """Handle POST requests."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path in ['/api/sessions/', '/api/sessions']:
            # Create new session
            session_id = f"session_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
            sessions[session_id] = {
                "id": session_id,
                "created": time.time(),
                "commands": []
            }
            self.send_json_response({"session_id": session_id})
            
        elif parsed_path.path == '/api/commands/execute':
            # Execute command
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            command = data.get('command', '')
            
            # Execute command safely
            try:
                # Limit command execution for safety
                safe_commands = ['ls', 'pwd', 'date', 'whoami', 'hostname']
                cmd_parts = command.split()
                
                if cmd_parts and cmd_parts[0] in safe_commands:
                    result = subprocess.run(
                        command,
                        shell=True,
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    output = result.stdout if result.stdout else result.stderr
                    success = result.returncode == 0
                elif command.startswith('echo '):
                    output = command[5:]  # Remove 'echo '
                    success = True
                else:
                    output = f"Command '{cmd_parts[0] if cmd_parts else command}' not allowed. Safe commands: {', '.join(safe_commands)}"
                    success = False
                    
            except subprocess.TimeoutExpired:
                output = "Command timed out"
                success = False
            except Exception as e:
                output = f"Error: {str(e)}"
                success = False
            
            self.send_json_response({
                "success": success,
                "output": output,
                "command": command,
                "timestamp": time.time()
            })
            
        elif parsed_path.path == '/api/tasks':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            # Create task in memory
            task_id = str(uuid.uuid4())
            task = {
                "id": task_id,
                "name": data.get("name", "New Task"),
                "description": data.get("description", ""),
                "status": data.get("status", "pending"),
                "priority": data.get("priority", "medium"),
                "project_id": data.get("project_id"),
                "created_at": time.time(),
                "updated_at": time.time()
            }
            memory_tasks[task_id] = task
            self.send_json_response(task, status=201)
            
        elif parsed_path.path.startswith('/api/projects/') and parsed_path.path.endswith('/tasks'):
            # Handle POST /api/projects/{project_id}/tasks
            path_parts = parsed_path.path.split('/')
            if len(path_parts) >= 5:
                project_id = path_parts[3]
                
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                data = json.loads(body.decode('utf-8'))
                
                # Import datetime at the top if not already done
                from datetime import datetime
                
                # Create task with project_id
                task_id = f"task-{int(time.time())}-{data.get('name', 'new').lower().replace(' ', '-')[:20]}"
                task = {
                    "id": task_id,
                    "name": data.get("name", "New Task"),
                    "description": data.get("description", ""),
                    "status": "pending",
                    "priority": data.get("priority", "medium"),
                    "project_id": project_id,
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }
                
                # For user projects with custom paths, create the task folder and file
                if project_id in memory_projects:
                    project = memory_projects[project_id]
                    project_path = project.get('path', '').strip("'\"")
                    if project_path and os.path.exists(project_path):
                        tasks_path = os.path.join(project_path, 'tasks')
                        if not os.path.exists(tasks_path):
                            os.makedirs(tasks_path)
                        
                        # Create task folder
                        task_folder = os.path.join(tasks_path, task_id)
                        os.makedirs(task_folder, exist_ok=True)
                        
                        # Create task.md with initial content
                        task_md_path = os.path.join(task_folder, 'task.md')
                        with open(task_md_path, 'w') as f:
                            f.write(f"# Task: {task['name']}\n\n")
                            f.write(f"**Status**: {task['status']}\n")
                            f.write(f"**Priority**: {task['priority']}\n")
                            f.write(f"**Created**: {task['created_at']}\n\n")
                            f.write("## Description\n\n")
                            f.write(f"{task['description']}\n\n")
                            f.write("## Planning\n\n")
                            f.write("*Waiting for /plan execution...*\n\n")
                            f.write("## Implementation\n\n")
                            f.write("*Not started*\n")
                        
                        task['path'] = task_folder
                else:
                    # For filesystem projects, create in default tasks directory
                    default_tasks_path = '/Users/don/D3/tasks'
                    if os.path.exists(default_tasks_path):
                        task_folder = os.path.join(default_tasks_path, task_id)
                        os.makedirs(task_folder, exist_ok=True)
                        
                        # Create task.md
                        task_md_path = os.path.join(task_folder, 'task.md')
                        with open(task_md_path, 'w') as f:
                            f.write(f"# Task: {task['name']}\n\n")
                            f.write(f"**Status**: {task['status']}\n")
                            f.write(f"**Priority**: {task['priority']}\n")
                            f.write(f"**Created**: {task['created_at']}\n\n")
                            f.write("## Description\n\n")
                            f.write(f"{task['description']}\n\n")
                            f.write("## Planning\n\n")
                            f.write("*Waiting for /plan execution...*\n\n")
                            f.write("## Implementation\n\n")
                            f.write("*Not started*\n")
                        
                        task['path'] = task_folder
                
                memory_tasks[task_id] = task
                self.send_json_response(task, status=201)
            else:
                self.send_error(400, "Invalid project path")
            
        elif parsed_path.path == '/api/projects':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            # Create project in memory
            project_id = str(uuid.uuid4())
            project = {
                "id": project_id,
                "name": data.get("name", "New Project"),
                "description": data.get("description", ""),
                "path": data.get("path", ""),
                "created_at": time.time()
            }
            memory_projects[project_id] = project
            save_projects()  # Save to file for persistence
            self.send_json_response(project, status=201)
            
        elif parsed_path.path == '/api/queue/add':
            self.send_json_response({"message": "Task queued", "position": 1})
            
        elif parsed_path.path == '/api/queue/process':
            self.send_json_response({"message": "Queue processed"})
            
        else:
            self.send_error(404, "Not found")
    
    def do_PUT(self):
        """Handle PUT requests."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path.startswith('/api/tasks/'):
            task_id = parsed_path.path.split('/')[-1]
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            # Update task in memory
            if task_id in memory_tasks:
                memory_tasks[task_id].update(data)
                memory_tasks[task_id]['updated_at'] = time.time()
                self.send_json_response(memory_tasks[task_id])
            else:
                # For filesystem tasks, create a copy in memory with updates
                fs_tasks = read_tasks_from_filesystem()
                task = next((t for t in fs_tasks if t['id'] == task_id), None)
                if task:
                    task.update(data)
                    task['updated_at'] = time.time()
                    memory_tasks[task_id] = task
                    self.send_json_response(task)
                else:
                    self.send_error(404, "Task not found")
        else:
            self.send_error(404, "Not found")
    
    def do_PATCH(self):
        """Handle PATCH requests."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path.endswith('/status'):
            # Extract task ID from path like /api/tasks/{id}/status
            path_parts = parsed_path.path.split('/')
            if len(path_parts) >= 4 and path_parts[2] == 'tasks':
                task_id = path_parts[3]
                
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                data = json.loads(body.decode('utf-8'))
                new_status = data.get('status')
                
                # Update task status
                if task_id in memory_tasks:
                    memory_tasks[task_id]['status'] = new_status
                    memory_tasks[task_id]['updated_at'] = time.time()
                    self.send_json_response(memory_tasks[task_id])
                else:
                    # For filesystem tasks, create a copy in memory with the new status
                    fs_tasks = read_tasks_from_filesystem()
                    task = next((t for t in fs_tasks if t['id'] == task_id), None)
                    if task:
                        task['status'] = new_status
                        task['updated_at'] = time.time()
                        memory_tasks[task_id] = task
                        self.send_json_response(task)
                    else:
                        self.send_error(404, "Task not found")
            else:
                self.send_error(400, "Invalid path")
        else:
            self.send_error(404, "Not found")
    
    def do_DELETE(self):
        """Handle DELETE requests."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path.startswith('/api/tasks/'):
            task_id = parsed_path.path.split('/')[-1]
            if task_id in memory_tasks:
                del memory_tasks[task_id]
                self.send_json_response({"deleted": True})
            else:
                # For filesystem tasks, we can't delete but we can hide them
                self.send_json_response({"deleted": True})
                
        elif parsed_path.path.startswith('/api/projects/'):
            project_id = parsed_path.path.split('/')[-1]
            if project_id in memory_projects:
                del memory_projects[project_id]
            self.send_json_response({"deleted": True})
        else:
            self.send_error(404, "Not found")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH')
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
        """Override to add CORS headers to error responses."""
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if message:
            self.wfile.write(message.encode('utf-8'))
    
    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    """Run the server."""
    port = 8001  # Changed to avoid conflict
    server = HTTPServer(('', port), FilesystemHandler)
    
    print(f"Claude CLI Backend (Filesystem Reader)")
    print(f"Listening on http://127.0.0.1:{port}")
    print(f"Reading tasks from: /Users/don/D3/tasks/")
    print(f"Note: WebSocket disabled (returns 404)")
    print("\nPress Ctrl+C to stop\n")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()

if __name__ == '__main__':
    main()