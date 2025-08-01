#!/bin/bash

echo "🎯 FINAL FIX - Making Tasks Appear"
echo "=================================="

# Stop and restart backend with the new project
echo "🔄 Restarting backend with correct project..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 2

cd backend
./venv/bin/python3 main-minimal.py &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid

# Wait for backend
sleep 3

# Test the new projects endpoint
echo "📋 Testing projects endpoint..."
curl -s http://localhost:8000/api/projects/ | jq .

# Test the tasks endpoint with the exact path
echo "📂 Testing tasks endpoint..."
curl -s "http://localhost:8000/api/projects/Users%2Fdon%2FGesture%20Generator%2Fgesture_generator%2Ftasks/tasks" | jq .

echo ""
echo "✅ Backend updated and restarted!"
echo ""
echo "🎯 INSTRUCTIONS:"
echo "1. Go to your browser (http://localhost:5173)"
echo "2. Click the project dropdown (currently shows 'AI Videos')"
echo "3. Select 'Gesture Generator Tasks' from the dropdown"
echo "4. Your 4 tasks should now appear!"
echo ""
echo "📊 Backend PID: $BACKEND_PID"

# Open browser
if command -v open &> /dev/null; then
    echo "🌐 Opening browser..."
    open http://localhost:5173
fi