#!/usr/bin/env python3
"""
Simple backend with WebSocket support for Claude CLI Web UI.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import time
import uuid
from urllib.parse import urlparse
import base64
import hashlib
import struct

# Store for session data
sessions = {}

class WebSocketHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests including WebSocket upgrades."""
        parsed_path = urlparse(self.path)
        
        # Handle WebSocket upgrade
        if parsed_path.path.startswith('/ws/'):
            self.handle_websocket()
            return
            
        # Regular HTTP endpoints
        if parsed_path.path == '/health' or parsed_path.path == '/api/health':
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
        else:
            self.send_error(404, "Not found")
    
    def do_POST(self):
        """Handle POST requests."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/sessions/' or parsed_path.path == '/api/sessions':
            # Create new session
            session_id = str(uuid.uuid4())
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
            session_id = data.get('session_id', '')
            
            # Execute command
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                output = result.stdout or result.stderr
                success = result.returncode == 0
            except subprocess.TimeoutExpired:
                output = "Command timed out after 30 seconds"
                success = False
            except Exception as e:
                output = f"Error: {str(e)}"
                success = False
            
            self.send_json_response({
                "success": success,
                "output": output,
                "command": command
            })
        else:
            self.send_error(404, "Not found")
    
    def handle_websocket(self):
        """Handle WebSocket upgrade request."""
        # Extract session ID from path
        session_id = self.path.split('/')[-1]
        
        # Check for WebSocket headers
        if (self.headers.get('Upgrade', '').lower() != 'websocket' or
            self.headers.get('Connection', '').lower() != 'upgrade'):
            # For simple implementation, just accept any WebSocket-like request
            pass
        
        # Generate WebSocket accept key
        key = self.headers.get('Sec-WebSocket-Key', '')
        if key:
            accept = self.calculate_websocket_accept(key)
            
            # Send WebSocket handshake response
            self.send_response(101)
            self.send_header('Upgrade', 'websocket')
            self.send_header('Connection', 'Upgrade')
            self.send_header('Sec-WebSocket-Accept', accept)
            self.end_headers()
            
            # Send welcome message
            self.send_websocket_message({
                "type": "welcome",
                "data": {
                    "message": f"Connected to Claude CLI session {session_id}",
                    "session_id": session_id
                }
            })
            
            # Keep connection alive briefly then close
            # (Full implementation would handle bidirectional communication)
            time.sleep(0.1)
        else:
            self.send_error(400, "Bad Request")
    
    def calculate_websocket_accept(self, key):
        """Calculate WebSocket accept header value."""
        GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        sha1 = hashlib.sha1((key + GUID).encode()).digest()
        return base64.b64encode(sha1).decode()
    
    def send_websocket_message(self, data):
        """Send a WebSocket message (simplified)."""
        message = json.dumps(data).encode('utf-8')
        # Simple text frame without proper WebSocket framing
        # Real implementation would use proper WebSocket protocol
        try:
            self.wfile.write(message)
        except:
            pass
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

def run_server(port=8000):
    """Run the HTTP server with WebSocket support."""
    server_address = ('', port)
    httpd = HTTPServer(server_address, WebSocketHandler)
    
    print(f"Claude CLI Backend Server (with WebSocket)")
    print(f"Listening on http://127.0.0.1:{port}")
    print(f"WebSocket endpoint: ws://127.0.0.1:{port}/ws/[session_id]")
    print("\nPress Ctrl+C to stop\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        httpd.shutdown()

if __name__ == '__main__':
    run_server()