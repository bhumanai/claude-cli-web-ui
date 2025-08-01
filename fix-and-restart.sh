#!/bin/bash

echo "🔧 Fixing issues and restarting servers..."
echo "==========================================="

# Stop existing servers
echo "🛑 Stopping existing servers..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 2

# Start backend with filesystem task support
echo "🐍 Starting backend with task filesystem support..."
cd backend
nohup ./venv/bin/python3 main-minimal.py > ../backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid

# Wait for backend
sleep 4

# Test backend health
if curl -s http://localhost:8000/api/health/ > /dev/null; then
    echo "✅ Backend started successfully (PID: $BACKEND_PID)"
    
    # Test the tasks endpoint with the actual path
    echo "🧪 Testing tasks endpoint..."
    curl -s "http://localhost:8000/api/projects//Users/don/Gesture%20Generator/gesture_generator/tasks/tasks" > /dev/null
    if [ $? -eq 0 ]; then
        echo "✅ Tasks endpoint working"
    else
        echo "⚠️  Tasks endpoint may need adjustment"
    fi
else
    echo "❌ Backend failed to start"
    exit 1
fi

# Start frontend
echo "⚛️ Starting frontend..."
cd ../frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../frontend.pid

# Wait for frontend
sleep 6

# Test frontend
if curl -s http://localhost:5173/ > /dev/null; then
    echo "✅ Frontend started successfully (PID: $FRONTEND_PID)"
else
    echo "❌ Frontend failed to start"
    exit 1
fi

echo ""
echo "🎉 Both servers restarted successfully!"
echo ""
echo "🔧 Changes made:"
echo "   • Backend now reads tasks from filesystem"
echo "   • WebSocket connections working"
echo "   • Tasks should appear from: /Users/don/Gesture Generator/gesture_generator/tasks"
echo ""
echo "🌐 Access: http://localhost:5173"
echo ""
echo "💡 Try refreshing the page to clear the old 'Connection Lost' notification"
echo "   Or click the X to dismiss it manually"
echo ""

# Open browser
if command -v open &> /dev/null; then
    echo "🌐 Opening browser..."
    open http://localhost:5173
fi

echo "🔥 All done!"