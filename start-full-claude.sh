#!/bin/bash

echo "🚀 Starting Full Claude CLI Backend with Python 3.12"
echo "==================================================="

# Kill any existing backend servers
echo "🛑 Stopping existing servers..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 2

# Navigate to backend directory
cd backend

# Create/activate virtual environment with Python 3.12
if [ ! -d "venv-py312" ]; then
    echo "📦 Creating Python 3.12 virtual environment..."
    python3.12 -m venv venv-py312
    source venv-py312/bin/activate
    
    echo "📚 Installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
else
    echo "✅ Using existing Python 3.12 virtual environment"
    source venv-py312/bin/activate
fi

# Start the full backend with Claude CLI support
echo "🎯 Starting full backend with Claude CLI integration..."
echo "====================================================="
python main.py &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid

# Wait for backend to start
echo "⏳ Waiting for backend to start..."
sleep 5

# Test the connection
echo "🔍 Testing backend connection..."
curl -s http://localhost:8000/api/health/ | jq . || echo "❌ Backend not responding yet"

echo ""
echo "✅ Full Claude CLI Backend Started!"
echo "=================================="
echo "📊 Backend PID: $BACKEND_PID"
echo "🌐 Access the web UI at: http://localhost:5173"
echo ""
echo "✨ Full Claude CLI features are now available!"
echo "   - Claude command execution"
echo "   - WebSocket real-time streaming"
echo "   - Session management"
echo "   - All slash commands"
echo ""
echo "To stop the server: kill $BACKEND_PID"