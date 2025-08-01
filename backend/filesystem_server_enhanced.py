#!/usr/bin/env python3
"""
Enhanced backend server that provides better feedback for Claude CLI Web UI.
This version helps debug the task creation and planning agent workflow.
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
import threading

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tasks_reader import read_tasks_from_filesystem, read_projects_from_filesystem

# Store sessions
sessions = {}

# In-memory storage for created items
memory_tasks = {}
memory_projects = {}

# Command history for debugging
command_history = []

# Simulated Claude CLI responses for debugging
PLANNING_MESSAGES = [
    {
        "type": "system",
        "content": "🔍 Analyzing task requirements...",
        "timestamp": None
    },
    {
        "type": "stdout", 
        "content": "Starting task planning for: {task_name}",
        "timestamp": None
    },
    {
        "type": "stdout",
        "content": "\n📋 Task Overview:\n- Name: {task_name}\n- Description: {task_description}\n- Priority: {priority}\n",
        "timestamp": None
    },
    {
        "type": "stdout",
        "content": "\n🤔 Planning Questions:\n1. What is the main objective of this task?\n2. What are the key deliverables?\n3. Are there any specific technical requirements?\n4. What is the expected timeline?\n",
        "timestamp": None
    },
    {
        "type": "system",
        "content": "\n⚠️ Note: This is a simulation. The actual Claude CLI integration is not running.\n\nTo enable real Claude CLI integration:\n1. Stop this server (Ctrl+C)\n2. Run the FastAPI server: python main.py\n3. Or run: ./start.sh from the project root\n\nThe FastAPI server includes:\n- WebSocket support for real-time communication\n- Claude CLI integration with PTY support\n- Secure command execution\n- Real planning agent functionality",
        "timestamp": None
    }
]

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

class EnhancedFilesystemHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)
        
        # Handle WebSocket upgrade request with informative error
        if parsed_path.path.startswith('/ws/'):
            self.send_response(426)  # Upgrade Required
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_response = {
                "error": "WebSocket not supported in simple server",
                "message": "The simple filesystem server doesn't support WebSocket connections.",
                "solution": "To enable real-time terminal features, run the FastAPI server instead:\n1. Stop this server\n2. Run: python main.py\n3. Or use: ./start.sh",
                "workaround": "Commands will be executed via HTTP POST to /api/commands/execute"
            }
            self.wfile.write(json.dumps(error_response).encode())
            return
            
        # API endpoints
        if parsed_path.path in ['/health', '/api/health', '/api/health/']:
            self.send_json_response({
                "status": "ok", 
                "timestamp": time.time(),
                "server": "filesystem_server_enhanced",
                "features": {
                    "websocket": False,
                    "claude_cli": False,
                    "planning_simulation": True
                }
            })
            
        elif parsed_path.path == '/api/sessions':
            self.send_json_response(list(sessions.keys()))
            
        elif parsed_path.path == '/api/commands/suggestions':
            self.send_json_response([
                {"command": "/plan", "description": "Start planning for a task (simulated)"},
                {"command": "/smart-task", "description": "Execute smart task (simulated)"},
                {"command": "ls", "description": "List files"},
                {"command": "pwd", "description": "Print working directory"},
                {"command": "echo", "description": "Print text"},
                {"command": "help", "description": "Show available commands"}
            ])
            
        elif parsed_path.path == '/api/commands/history':
            # Return command history for debugging
            self.send_json_response(command_history[-50:])  # Last 50 commands
            
        elif parsed_path.path == '/api/tasks':
            # Parse query parameters
            query_params = parse_qs(parsed_path.query)
            project_id = query_params.get('project_id', [None])[0]
            
            # Start with D3 tasks
            fs_tasks = read_tasks_from_filesystem()
            all_tasks = fs_tasks + list(memory_tasks.values())
            
            # Filter by project if specified
            if project_id:
                all_tasks = [t for t in all_tasks if t.get('project_id') == project_id]
                
                # For user-created projects, try to read tasks from their path
                if project_id in memory_projects:
                    project = memory_projects[project_id]
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
            # Extract task ID
            task_id = parsed_path.path.split('/')[-2]
            
            # Try to find and read task.md file
            content = self.get_task_content(task_id)
            self.send_json_response({"content": content})
            
        elif parsed_path.path == '/api/projects':
            # Get filesystem projects
            fs_projects = read_projects_from_filesystem()
            
            # Convert to dict with ID as key
            all_projects = {p['id']: p for p in fs_projects}
            
            # Add memory projects
            all_projects.update(memory_projects)
            
            # Return as list
            self.send_json_response(list(all_projects.values()))
            
        elif parsed_path.path == '/api/queue':
            # Simple queue status
            active_tasks = [t for t in memory_tasks.values() if t.get('status') == 'in_progress']
            queued_tasks = [t for t in memory_tasks.values() if t.get('status') == 'pending']
            
            self.send_json_response({
                "active": len(active_tasks),
                "queued": len(queued_tasks),
                "tasks": queued_tasks[:5]  # First 5 queued tasks
            })
            
        else:
            self.send_error(404)
    
    def do_POST(self):
        """Handle POST requests."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path in ['/api/sessions/', '/api/sessions']:
            # Create new session
            session_id = f"session_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
            sessions[session_id] = {
                "id": session_id,
                "created": time.time(),
                "commands": [],
                "task_context": None
            }
            self.send_json_response({"session_id": session_id})
            
        elif parsed_path.path == '/api/commands/execute':
            # Execute command with enhanced responses
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            command = data.get('command', '')
            session_id = data.get('session_id', 'default')
            
            # Log command for debugging
            command_entry = {
                "command": command,
                "session_id": session_id,
                "timestamp": datetime.now().isoformat(),
                "context": data.get('context', {})
            }
            command_history.append(command_entry)
            
            # Handle different commands
            if command.startswith('/plan'):
                # Simulate planning response
                output = self.simulate_planning_response(command, session_id)
                success = True
            elif command.startswith('/smart-task'):
                output = "🚧 Smart task execution is not available in the simple server.\n\n" \
                        "To use smart tasks:\n" \
                        "1. Run the FastAPI server with Claude CLI integration\n" \
                        "2. Execute: python main.py or ./start.sh\n\n" \
                        "The smart-task command will:\n" \
                        "- Analyze your task requirements\n" \
                        "- Create an implementation plan\n" \
                        "- Execute the plan with appropriate agents"
                success = False
            elif command == 'help':
                output = self.get_help_text()
                success = True
            elif command.startswith('echo '):
                output = command[5:]
                success = True
            elif command in ['ls', 'pwd', 'date', 'whoami', 'hostname']:
                # Execute safe system commands
                try:
                    result = subprocess.run(
                        command,
                        shell=True,
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    output = result.stdout if result.stdout else result.stderr
                    success = result.returncode == 0
                except Exception as e:
                    output = f"Error: {str(e)}"
                    success = False
            else:
                output = f"Command '{command}' is not available in the simple server.\n\n" \
                        f"Available commands:\n" \
                        f"- /plan - Simulate task planning\n" \
                        f"- /smart-task - Info about smart tasks\n" \
                        f"- help - Show this help\n" \
                        f"- echo <text> - Echo text\n" \
                        f"- ls, pwd, date - Basic system info"
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
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            memory_tasks[task_id] = task
            
            # Log task creation
            print(f"Created task: {task['name']} (ID: {task_id})")
            
            # Send response with planning notice
            response = {
                **task,
                "_notice": "Task created! To start planning, use the /plan command in the terminal below."
            }
            
            self.send_json_response(response)
            
        elif parsed_path.path == '/api/projects':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            # Create project
            project_id = str(uuid.uuid4())
            project = {
                "id": project_id,
                "name": data.get("name", "New Project"),
                "path": data.get("path", ""),
                "description": data.get("description", ""),
                "created_at": datetime.now().isoformat()
            }
            
            memory_projects[project_id] = project
            save_projects()  # Persist to file
            
            self.send_json_response(project)
            
        elif parsed_path.path.startswith('/api/tasks/') and '/status' in parsed_path.path:
            # Update task status
            task_id = parsed_path.path.split('/')[3]
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            if task_id in memory_tasks:
                memory_tasks[task_id]['status'] = data.get('status', memory_tasks[task_id]['status'])
                memory_tasks[task_id]['updated_at'] = datetime.now().isoformat()
                self.send_json_response(memory_tasks[task_id])
            else:
                self.send_error(404, "Task not found")
                
        else:
            self.send_error(404)
    
    def simulate_planning_response(self, command: str, session_id: str):
        """Simulate a planning agent response."""
        # Get session context
        session = sessions.get(session_id, {})
        task_context = session.get('task_context', {})
        
        # Extract task info from session or command
        task_name = task_context.get('name', 'Unknown Task')
        task_description = task_context.get('description', 'No description provided')
        priority = task_context.get('priority', 'medium')
        
        # Build response
        response_parts = []
        for msg in PLANNING_MESSAGES:
            content = msg['content'].format(
                task_name=task_name,
                task_description=task_description,
                priority=priority
            )
            response_parts.append(content)
        
        return '\n'.join(response_parts)
    
    def get_help_text(self):
        """Get help text for available commands."""
        return """
🚀 Claude CLI Web UI - Simple Server Mode

This is running in simple server mode without full Claude CLI integration.

Available Commands:
==================
/plan         - Simulate task planning (shows what would happen)
/smart-task   - Information about smart task execution
help          - Show this help message
echo <text>   - Echo text back
ls            - List files in current directory
pwd           - Show current working directory
date          - Show current date/time

To Enable Full Features:
=======================
1. Stop this server (Ctrl+C)
2. Run the FastAPI server: python main.py
3. Or use the start script: ./start.sh

The full server includes:
- Real Claude CLI integration
- WebSocket support for live updates  
- Task planning and execution agents
- Secure command execution
- And much more!

Current Server: filesystem_server_enhanced.py
Status: Limited functionality mode
"""
    
    def get_task_content(self, task_id: str) -> str:
        """Get task content from filesystem or memory."""
        # First check memory tasks
        if task_id in memory_tasks:
            task = memory_tasks[task_id]
            return f"# {task['name']}\n\n{task.get('description', 'No description available.')}"
        
        # Then check filesystem
        # Look in D3/tasks directory
        d3_tasks_dir = '/Users/don/D3/tasks'
        if os.path.exists(d3_tasks_dir):
            for task_dir in os.listdir(d3_tasks_dir):
                if task_id in task_dir:
                    task_md_path = os.path.join(d3_tasks_dir, task_dir, 'task.md')
                    if os.path.exists(task_md_path):
                        try:
                            with open(task_md_path, 'r') as f:
                                return f.read()
                        except Exception as e:
                            return f"Error reading task file: {e}"
        
        return "Task content not found."
    
    def send_json_response(self, data):
        """Send JSON response with proper headers."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        """Handle preflight CORS requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_server(port=8001):
    """Run the enhanced filesystem server."""
    server = HTTPServer(('127.0.0.1', port), EnhancedFilesystemHandler)
    print(f"""
╔════════════════════════════════════════════════════════════╗
║          Claude CLI Web UI - Enhanced Simple Server         ║
╠════════════════════════════════════════════════════════════╣
║                                                             ║
║  Server running at: http://127.0.0.1:{port:<5}                ║
║                                                             ║
║  Features:                                                  ║
║  ✓ Task filesystem reading                                  ║
║  ✓ Basic command execution                                  ║
║  ✓ Planning simulation                                      ║
║  ✗ WebSocket support (use FastAPI server)                  ║
║  ✗ Real Claude CLI integration (use FastAPI server)        ║
║                                                             ║
║  For full features, run: python main.py                    ║
║                                                             ║
║  Press Ctrl+C to stop the server                           ║
╚════════════════════════════════════════════════════════════╝
    """)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
        server.shutdown()

if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    run_server(port)