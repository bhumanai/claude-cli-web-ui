#!/bin/bash

echo "🛑 Stopping Claude CLI Web UI servers..."

# Stop backend
if [ -f "backend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "🐍 Stopping backend server (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        rm backend.pid
        echo "✅ Backend stopped"
    else
        echo "ℹ️  Backend was not running"
        rm -f backend.pid
    fi
else
    echo "ℹ️  No backend PID file found"
fi

# Stop frontend
if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "⚛️ Stopping frontend server (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
        rm frontend.pid
        echo "✅ Frontend stopped"
    else
        echo "ℹ️  Frontend was not running"
        rm -f frontend.pid
    fi
else
    echo "ℹ️  No frontend PID file found"
fi

# Clean up any remaining processes on ports
echo "🧹 Cleaning up any remaining processes..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo ""
echo "✅ All servers stopped successfully!"
echo "📋 Log files preserved (backend.log, frontend.log)"