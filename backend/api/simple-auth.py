"""Simple serverless auth endpoint for Vercel."""
import json
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
    def do_POST(self):
        """Handle login requests."""
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            password = data.get('password', '')
            
            # Check password
            if password == 'claude123':
                response = {
                    'access_token': 'simple-token-12345',
                    'refresh_token': 'refresh-token-67890',
                    'token_type': 'bearer',
                    'expires_in': 3600
                }
            else:
                self.send_response(401)
                response = {'detail': 'Invalid password'}
                
        except Exception as e:
            response = {'detail': 'Invalid request'}
            
        # Send response
        self.wfile.write(json.dumps(response).encode())