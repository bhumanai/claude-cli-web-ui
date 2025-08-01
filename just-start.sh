#!/bin/bash

# Idiot-proof startup script - tries multiple approaches until one works
set +e  # Don't exit on errors

echo "🚀 IDIOT-PROOF Claude CLI Web UI Starter"
echo "========================================"
echo ""

# Function to check if servers are running
check_servers() {
    local backend_ok=false
    local frontend_ok=false
    
    if curl -s http://localhost:8000/api/health/ > /dev/null 2>&1; then
        backend_ok=true
    fi
    
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        frontend_ok=true
    fi
    
    if $backend_ok && $frontend_ok; then
        return 0
    else
        return 1
    fi
}

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Cleaning up..."
    pkill -f "python.*main" 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    sleep 2
    echo "✅ Cleanup complete"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Clean up any existing processes
cleanup

echo "🧹 Starting fresh..."
echo ""

# Try approach 1: Full setup
echo "📋 ATTEMPT 1: Full Setup with All Features"
echo "==========================================="
if [ -f "./start.sh" ]; then
    echo "🔧 Trying full startup script..."
    timeout 60 ./start.sh &
    FULL_PID=$!
    
    sleep 10
    if check_servers; then
        echo "✅ SUCCESS: Full setup working!"
        echo ""
        echo "🎉 Claude CLI Web UI is running with all features!"
        echo "🌐 Access: http://localhost:5173"
        echo ""
        wait $FULL_PID
        exit 0
    else
        echo "❌ Full setup failed, killing processes..."
        kill $FULL_PID 2>/dev/null || true
        cleanup
    fi
else
    echo "❌ start.sh not found"
fi

echo ""
echo "📋 ATTEMPT 2: Simple Setup (Minimal Dependencies)"
echo "================================================="
if [ -f "./start-simple.sh" ]; then
    echo "🔧 Trying simple startup script..."
    timeout 60 ./start-simple.sh &
    SIMPLE_PID=$!
    
    sleep 10
    if check_servers; then
        echo "✅ SUCCESS: Simple setup working!"
        echo ""
        echo "🎉 Claude CLI Web UI is running in simple mode!"
        echo "🌐 Access: http://localhost:5173"
        echo "⚠️  Some advanced features may not work"
        echo ""
        wait $SIMPLE_PID
        exit 0
    else
        echo "❌ Simple setup failed, killing processes..."
        kill $SIMPLE_PID 2>/dev/null || true
        cleanup
    fi
else
    echo "❌ start-simple.sh not found"
fi

echo ""
echo "📋 ATTEMPT 3: Ultra Simple (No Dependencies)"
echo "============================================="
if [ -f "./start-ultra-simple.sh" ]; then
    echo "🔧 Trying ultra simple startup script..."
    timeout 60 ./start-ultra-simple.sh &
    ULTRA_PID=$!
    
    sleep 8
    if check_servers; then
        echo "✅ SUCCESS: Ultra simple setup working!"
        echo ""
        echo "🎉 Claude CLI Web UI is running in ultra simple mode!"
        echo "🌐 Access: http://localhost:5173"
        echo "⚠️  Very limited functionality - demo only"
        echo ""
        wait $ULTRA_PID
        exit 0
    else
        echo "❌ Ultra simple setup failed, killing processes..."
        kill $ULTRA_PID 2>/dev/null || true
        cleanup
    fi
else
    echo "❌ start-ultra-simple.sh not found"
fi

echo ""
echo "📋 ATTEMPT 4: Manual Fallback"
echo "============================="
echo "🔧 Trying manual approach..."

# Kill everything first
cleanup

# Start manual backend
echo "🐍 Starting Python HTTP server fallback..."
cd backend 2>/dev/null || { echo "❌ backend directory not found"; exit 1; }

python3 -c "
import http.server
import socketserver
import json

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        if 'health' in self.path:
            self.wfile.write(json.dumps({'status': 'ok', 'fallback': True}).encode())
        else:
            self.wfile.write(json.dumps({'data': [], 'error': None}).encode())
    
    def do_POST(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'status': 'ok', 'message': 'Fallback mode'}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

print('Backend fallback starting on port 8000...')
with socketserver.TCPServer(('127.0.0.1', 8000), Handler) as httpd:
    httpd.serve_forever()
" &
FALLBACK_PID=$!

sleep 3

# Start frontend
echo "⚛️  Starting frontend..."
cd ../frontend 2>/dev/null || { echo "❌ frontend directory not found"; kill $FALLBACK_PID; exit 1; }

if [ -d "node_modules" ]; then
    echo "📦 Node modules found, starting dev server..."
    npm run dev &
    FRONTEND_PID=$!
    
    sleep 5
    if check_servers; then
        echo "✅ SUCCESS: Manual fallback working!"
        echo ""
        echo "🎉 Claude CLI Web UI is running in fallback mode!"
        echo "🌐 Access: http://localhost:5173"
        echo "⚠️  Minimal functionality only"
        echo ""
        wait $FALLBACK_PID $FRONTEND_PID
        exit 0
    fi
else
    echo "❌ Node modules not found. Please run 'npm install' in the frontend directory"
fi

# Final failure
echo ""
echo "💥 ALL ATTEMPTS FAILED!"
echo "======================="
echo ""
echo "📋 Manual Setup Instructions:"
echo "1. Install Node.js: https://nodejs.org/"
echo "2. Install Python 3.11 or 3.12 (NOT 3.13)"
echo "3. Run: cd frontend && npm install"
echo "4. Run: cd backend && python3 -m venv venv && source venv/bin/activate"
echo "5. Run: pip install fastapi uvicorn"
echo "6. Try again with ./just-start.sh"
echo ""
echo "🆘 Still having issues? Check:"
echo "   - Port 8000 and 5173 are not in use"
echo "   - You have internet connection for npm install"
echo "   - Python version is 3.11 or 3.12 (check: python3 --version)"
echo ""

cleanup
exit 1