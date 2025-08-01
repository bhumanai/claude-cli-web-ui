#!/bin/bash

echo "🔍 Checking Claude CLI Web UI Status"
echo "====================================="

# Check backend
echo "🐍 Backend Status:"
if [ -f "backend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "   ✅ Running (PID: $BACKEND_PID)"
        if curl -s http://localhost:8000/api/health/ > /dev/null; then
            echo "   ✅ Responding to requests"
        else
            echo "   ❌ Not responding to requests"
        fi
    else
        echo "   ❌ Not running (stale PID file)"
    fi
else
    echo "   ❌ Not running (no PID file)"
fi

# Check frontend
echo ""
echo "⚛️ Frontend Status:"
if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "   ✅ Running (PID: $FRONTEND_PID)"
        if curl -s http://localhost:5173/ > /dev/null; then
            echo "   ✅ Responding to requests"
        else
            echo "   ❌ Not responding to requests"
        fi
    else
        echo "   ❌ Not running (stale PID file)"
    fi
else
    echo "   ❌ Not running (no PID file)"
fi

# Check ports
echo ""
echo "🌐 Port Status:"
if lsof -ti:8000 > /dev/null 2>&1; then
    echo "   ✅ Port 8000 (backend) is in use"
else
    echo "   ❌ Port 8000 (backend) is free"
fi

if lsof -ti:5173 > /dev/null 2>&1; then
    echo "   ✅ Port 5173 (frontend) is in use"
else
    echo "   ❌ Port 5173 (frontend) is free"
fi

echo ""
if [ -f "backend.pid" ] && [ -f "frontend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    FRONTEND_PID=$(cat frontend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "🎉 System Status: ✅ FULLY OPERATIONAL"
        echo "🌐 Access: http://localhost:5173"
    else
        echo "⚠️  System Status: ❌ PARTIALLY DOWN"
    fi
else
    echo "⚠️  System Status: ❌ NOT RUNNING"
fi