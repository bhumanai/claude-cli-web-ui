#!/bin/bash

# Simple startup script that just works
set -e

echo "🚀 Starting Claude CLI Web UI (Simple Mode)"
echo "================================================"

# Check if we're in the right directory
if [ ! -f "backend/main.py" ]; then
    echo "❌ Please run this from the project root directory"
    exit 1
fi

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 2

# Setup backend with minimal dependencies
echo "🐍 Setting up backend..."
cd backend

# Create venv if it doesn't exist
if [ ! -d "venv-simple" ]; then
    echo "📦 Creating simple virtual environment..."
    python3 -m venv venv-simple
fi

# Activate venv
source venv-simple/bin/activate

# Install minimal requirements
echo "📦 Installing minimal dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements-simple.txt --quiet

# Start backend
echo "🚀 Starting backend server..."
python3 main-simple.py &
BACKEND_PID=$!

# Wait for backend
sleep 3

# Check if backend is running
if ! curl -s http://localhost:8000/api/health/ > /dev/null; then
    echo "❌ Backend failed to start"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Backend running at http://localhost:8000"

# Setup frontend
echo "⚛️  Setting up frontend..."
cd ../frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install --silent
fi

# Start frontend
echo "🚀 Starting frontend server..."
npm run dev &
FRONTEND_PID=$!

# Wait for frontend
sleep 5

# Cleanup function
cleanup() {
    echo "🛑 Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "🎉 Claude CLI Web UI is running!"
echo "=================================="
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend:  http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Keep running
wait