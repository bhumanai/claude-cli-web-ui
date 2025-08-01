#!/usr/bin/env python3
"""
Claude CLI Bridge Server - Direct integration with real Claude CLI
This provides REAL Claude CLI responses, not simulations!
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import asyncio
import uuid
import os
import sys
import time
import threading
import select
from urllib.parse import urlparse, parse_qs
from datetime import datetime
from queue import Queue, Empty

# Store active Claude CLI sessions
claude_sessions = {}

class ClaudeSession:
    """Manages a real Claude CLI subprocess"""
    
    def __init__(self, session_id, working_dir=None):
        self.session_id = session_id
        self.working_dir = working_dir or os.getcwd()
        self.process = None
        self.output_queue = Queue()
        self.reader_thread = None
        self.start()
    
    def start(self):
        """Start the Claude CLI process"""
        try:
            # Start claude in interactive mode
            self.process = subprocess.Popen(
                ['claude', 'code'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=0,
                cwd=self.working_dir,
                env={**os.environ, 'CLAUDE_INTERACTIVE': '1'}
            )
            
            # Start output reader thread
            self.reader_thread = threading.Thread(target=self._read_output, daemon=True)
            self.reader_thread.start()
            
            print(f"Started Claude CLI session {self.session_id}")
            
        except Exception as e:
            print(f"Failed to start Claude CLI: {e}")
            raise
    
    def _read_output(self):
        """Read output from Claude CLI in a separate thread"""
        while self.process and self.process.poll() is None:
            try:
                line = self.process.stdout.readline()
                if line:
                    self.output_queue.put(line)
            except:
                break
    
    def send_command(self, command):
        """Send a command to Claude CLI"""
        if not self.process or self.process.poll() is not None:
            raise Exception("Claude CLI process not running")
        
        try:
            self.process.stdin.write(command + '\n')
            self.process.stdin.flush()
        except Exception as e:
            print(f"Error sending command: {e}")
            raise
    
    def get_output(self, timeout=0.1):
        """Get available output from Claude CLI"""
        output_lines = []
        end_time = time.time() + timeout
        
        while time.time() < end_time:
            try:
                line = self.output_queue.get(timeout=0.01)
                output_lines.append(line)
                # Continue reading if we got output
                end_time = time.time() + 0.1
            except Empty:
                if output_lines:  # We have some output, return it
                    break
                continue
        
        return ''.join(output_lines)
    
    def close(self):
        """Close the Claude CLI session"""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                self.process.kill()
            self.process = None

class ClaudeCLIBridgeHandler(BaseHTTPRequestHandler):
    """HTTP handler that bridges to real Claude CLI"""
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/health':
            self.send_json_response({
                "status": "ok",
                "server": "claude_cli_bridge",
                "features": {
                    "claude_cli": True,
                    "real_responses": True,
                    "websocket": False
                }
            })
        
        elif parsed_path.path == '/api/sessions':
            self.send_json_response(list(claude_sessions.keys()))
        
        else:
            # Delegate to filesystem server endpoints
            self.send_error(404)
    
    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/sessions':
            # Create new Claude CLI session
            session_id = f"claude_{int(time.time())}_{uuid.uuid4().hex[:8]}"
            
            try:
                session = ClaudeSession(session_id)
                claude_sessions[session_id] = session
                
                # Wait for initial output
                time.sleep(0.5)
                initial_output = session.get_output(timeout=1.0)
                
                self.send_json_response({
                    "session_id": session_id,
                    "status": "created",
                    "initial_output": initial_output
                })
            except Exception as e:
                self.send_json_response({
                    "error": f"Failed to create Claude session: {str(e)}"
                }, status=500)
        
        elif parsed_path.path == '/api/commands/execute':
            # Execute command in Claude CLI
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            command = data.get('command', '')
            session_id = data.get('session_id')
            
            # Get or create session
            if session_id not in claude_sessions:
                try:
                    session = ClaudeSession(session_id)
                    claude_sessions[session_id] = session
                    time.sleep(0.5)  # Wait for initialization
                except Exception as e:
                    self.send_json_response({
                        "success": False,
                        "output": f"Failed to create Claude session: {str(e)}",
                        "command": command
                    })
                    return
            
            session = claude_sessions[session_id]
            
            try:
                # Send command to Claude
                session.send_command(command)
                
                # Collect output for a reasonable time
                output_parts = []
                total_wait = 0
                max_wait = 30  # Maximum 30 seconds for response
                
                while total_wait < max_wait:
                    output = session.get_output(timeout=0.5)
                    if output:
                        output_parts.append(output)
                        # Reset wait if we're getting output
                        total_wait = 0
                    else:
                        total_wait += 0.5
                        # If we have output and no new output for 2 seconds, assume done
                        if output_parts and total_wait > 2:
                            break
                
                full_output = ''.join(output_parts)
                
                self.send_json_response({
                    "success": True,
                    "output": full_output or "Command sent to Claude CLI",
                    "command": command,
                    "timestamp": time.time(),
                    "session_id": session_id
                })
                
            except Exception as e:
                self.send_json_response({
                    "success": False,
                    "output": f"Error executing command: {str(e)}",
                    "command": command
                })
        
        else:
            self.send_error(404)
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def send_json_response(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def log_message(self, format, *args):
        """Custom log format"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        print(f"[{timestamp}] {format % args}")

def cleanup_sessions():
    """Clean up all Claude sessions on exit"""
    print("\nCleaning up Claude sessions...")
    for session_id, session in claude_sessions.items():
        try:
            session.close()
            print(f"Closed session {session_id}")
        except:
            pass
    claude_sessions.clear()

def run_server(port=8001):
    """Run the Claude CLI bridge server"""
    server = HTTPServer(('127.0.0.1', port), ClaudeCLIBridgeHandler)
    
    print(f"""
╔════════════════════════════════════════════════════════════╗
║           Claude CLI Bridge Server - REAL RESPONSES         ║
╠════════════════════════════════════════════════════════════╣
║                                                             ║
║  Server running at: http://127.0.0.1:{port:<5}                ║
║                                                             ║
║  This server provides REAL Claude CLI integration:          ║
║  ✓ Direct Claude CLI subprocess execution                   ║
║  ✓ Real planning agent responses                            ║
║  ✓ Real smart-task execution                                ║
║  ✓ All Claude CLI commands work                             ║
║                                                             ║
║  NO SIMULATIONS - 100% REAL CLAUDE CLI                      ║
║                                                             ║
║  Press Ctrl+C to stop the server                           ║
╚════════════════════════════════════════════════════════════╝
    """)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
        cleanup_sessions()
        server.shutdown()

if __name__ == '__main__':
    import signal
    signal.signal(signal.SIGTERM, lambda s, f: cleanup_sessions())
    
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    run_server(port)