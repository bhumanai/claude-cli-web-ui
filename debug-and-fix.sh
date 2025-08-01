#!/bin/bash

echo "🔍 Debug and Fix Script"
echo "======================"

# Check if servers are running
echo "📊 Current server status:"
if lsof -ti:8000 > /dev/null 2>&1; then
    echo "   ✅ Backend running on port 8000"
else
    echo "   ❌ Backend not running on port 8000"
fi

if lsof -ti:5173 > /dev/null 2>&1; then
    echo "   ✅ Frontend running on port 5173"
else
    echo "   ❌ Frontend not running on port 5173"
fi

# Test the API directly
echo ""
echo "🧪 Testing API endpoints:"

# Test health
echo "📡 Testing health endpoint..."
HEALTH=$(curl -s http://localhost:8000/api/health/)
echo "   Response: $HEALTH"

# Test tasks endpoint with exact path
echo "📂 Testing tasks endpoint..."
TEST_PATH="/Users/don/Gesture%20Generator/gesture_generator/tasks"
TASKS=$(curl -s "http://localhost:8000/api/projects/$TEST_PATH/tasks")
echo "   Path: $TEST_PATH"
echo "   Response: $TASKS"

# Check if the directory actually exists
echo ""
echo "📁 Checking filesystem:"
REAL_PATH="/Users/don/Gesture Generator/gesture_generator/tasks"
if [ -d "$REAL_PATH" ]; then
    echo "   ✅ Directory exists: $REAL_PATH"
    echo "   📋 Contents:"
    ls -la "$REAL_PATH" | head -10
else
    echo "   ❌ Directory not found: $REAL_PATH"
fi

# Restart backend with fixes
echo ""
echo "🔄 Restarting backend with debug logging..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 2

cd backend
./venv/bin/python3 main-minimal.py &
BACKEND_PID=$!

echo "   🐍 Backend started (PID: $BACKEND_PID)"
echo "   📋 You can now watch debug logs with: tail -f backend.log"
echo ""
echo "🎯 Next steps:"
echo "   1. Refresh your browser page (http://localhost:5173)"
echo "   2. Click the X to dismiss the 'Connection Lost' notification"
echo "   3. Select '/Users/don/Gesture Generator/gesture_generator/tasks' from the project dropdown"
echo "   4. Tasks should appear!"
echo ""
echo "📊 Watch the terminal for DEBUG messages when you select the project"