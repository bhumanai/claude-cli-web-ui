#!/bin/bash

# Ultra simple startup - just works!
echo "🚀 Ultra Simple Claude CLI Web UI"
echo "================================="

# Kill existing processes
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

# Start minimal backend
echo "🐍 Starting minimal backend..."
cd backend
python3 -c "
import http.server
import socketserver
import json
from urllib.parse import urlparse, parse_qs
import threading

class SimpleHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/health'):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'mode': 'ultra-simple'}).encode())
        elif self.path == '/api/projects/':
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'data': [], 'error': None}).encode())
        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
    
    def do_POST(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'status': 'ok', 'message': 'Ultra simple mode - limited functionality'}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

with socketserver.TCPServer(('127.0.0.1', 8000), SimpleHandler) as httpd:
    print('✅ Backend running at http://localhost:8000')
    httpd.serve_forever()
" &
BACKEND_PID=$!

sleep 2

# Start frontend
echo "⚛️  Starting frontend..."
cd ../frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install --silent
fi

npm run dev &
FRONTEND_PID=$!

# Cleanup function
cleanup() {
    echo "🛑 Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "🎉 Ultra Simple Mode Running!"
echo "============================="
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend:  http://localhost:8000"
echo ""
echo "⚠️  Limited functionality - for demo only"
echo "📋 Available: Basic UI, Health checks"
echo "❌ Not available: Commands, Database, Agents"
echo ""
echo "Press Ctrl+C to stop"

wait