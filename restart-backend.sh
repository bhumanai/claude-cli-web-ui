#!/bin/bash

echo "🔄 Restarting backend with WebSocket support..."

# Kill existing backend
echo "🛑 Stopping current backend..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Wait a moment
sleep 2

# Start updated backend
echo "🚀 Starting updated backend..."
cd backend
./venv/bin/python3 main-minimal.py &
BACKEND_PID=$!

# Wait for it to start
sleep 3

# Test health
if curl -s http://localhost:8000/api/health/ > /dev/null; then
    echo "✅ Backend restarted successfully with WebSocket support!"
    echo "📊 Backend PID: $BACKEND_PID"
    echo "🌐 Your frontend at http://localhost:5173 should now work better!"
    echo ""
    echo "💡 The WebSocket 403 errors should stop now."
else
    echo "❌ Backend failed to restart"
fi