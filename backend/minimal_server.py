#!/usr/bin/env python3
"""
Minimal backend for Claude CLI Web UI.
Handles basic HTTP requests and properly rejects WebSocket connections.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import time
import uuid
from urllib.parse import urlparse

# Store sessions
sessions = {}

class MinimalHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)
        
        # For WebSocket paths, return 404 to stop reconnection attempts
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
        # Task management endpoints (return empty data)
        elif parsed_path.path == '/api/tasks':
            self.send_json_response([])
        elif parsed_path.path == '/api/projects':
            self.send_json_response([])
        elif parsed_path.path == '/api/queue':
            self.send_json_response({"queue": [], "processing": False, "size": 0})
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
            
        # Task management endpoints (basic implementation)
        elif parsed_path.path == '/api/tasks':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            # Create a dummy task
            task_id = str(uuid.uuid4())
            task = {
                "id": task_id,
                "name": data.get("name", "New Task"),
                "description": data.get("description", ""),
                "status": "pending",
                "created_at": time.time()
            }
            self.send_json_response(task, status=201)
            
        elif parsed_path.path == '/api/projects':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            # Create a dummy project
            project_id = str(uuid.uuid4())
            project = {
                "id": project_id,
                "name": data.get("name", "New Project"),
                "description": data.get("description", ""),
                "created_at": time.time()
            }
            self.send_json_response(project, status=201)
            
        else:
            self.send_error(404, "Not found")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def send_json_response(self, data, status=200):
        """Send JSON response with CORS headers."""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    """Run the server."""
    port = 8000
    server = HTTPServer(('', port), MinimalHandler)
    
    print(f"Minimal Claude CLI Backend")
    print(f"Listening on http://127.0.0.1:{port}")
    print(f"Note: WebSocket not implemented (returns 404)")
    print(f"Safe commands: ls, pwd, date, whoami, hostname, echo")
    print("\nPress Ctrl+C to stop\n")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()

if __name__ == '__main__':
    main()