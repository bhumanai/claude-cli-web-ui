#!/bin/bash

# Ultimate bulletproof startup that keeps servers running even after terminal closes
echo "🚀 Starting Claude CLI Web UI (Background Mode)"
echo "================================================="

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 2

# Start backend in background with nohup
echo "🐍 Starting backend server (background mode)..."
cd backend
nohup ./venv/bin/python3 main-minimal.py > ../backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid

# Wait for backend to start
sleep 4

# Test backend
if curl -s http://localhost:8000/api/health/ > /dev/null; then
    echo "✅ Backend started successfully (PID: $BACKEND_PID)"
else
    echo "❌ Backend failed to start"
    exit 1
fi

# Start frontend in background with nohup
echo "⚛️ Starting frontend server (background mode)..."
cd ../frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../frontend.pid

# Wait for frontend to start
sleep 6

# Test frontend
if curl -s http://localhost:5173/ > /dev/null; then
    echo "✅ Frontend started successfully (PID: $FRONTEND_PID)"
else
    echo "❌ Frontend failed to start"
    exit 1
fi

echo ""
echo "🎉🎉🎉 SUCCESS! Both servers are running in background! 🎉🎉🎉"
echo ""
echo "📊 Process Information:"
echo "   • Backend PID: $BACKEND_PID (saved to backend.pid)"
echo "   • Frontend PID: $FRONTEND_PID (saved to frontend.pid)"
echo ""
echo "🌐 Access Points:"
echo "   • Web Interface: http://localhost:5173"
echo "   • Backend API: http://localhost:8000"
echo ""
echo "📋 Log Files:"
echo "   • Backend logs: backend.log"
echo "   • Frontend logs: frontend.log"
echo ""
echo "🛑 To Stop Servers:"
echo "   ./stop-servers.sh"
echo ""
echo "💡 Servers will keep running even if you close this terminal!"
echo ""

# Open browser
if command -v open &> /dev/null; then
    echo "🌐 Opening browser..."
    open http://localhost:5173
elif command -v xdg-open &> /dev/null; then
    echo "🌐 Opening browser..."
    xdg-open http://localhost:5173
fi

echo "🔥 All done! Your servers are running in the background!"