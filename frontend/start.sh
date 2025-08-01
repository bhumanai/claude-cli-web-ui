#!/bin/bash

# Start the Claude CLI Web UI Frontend
echo "🚀 Starting Claude CLI Web UI Frontend..."
echo "📦 Installing dependencies..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🔧 Running type check..."
npm run type-check

if [ $? -eq 0 ]; then
    echo "✅ Type check passed!"
    echo "🌐 Starting development server at http://localhost:5173"
    echo "🔗 Backend should be running at http://localhost:8000"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    npm run dev
else
    echo "❌ Type check failed! Please fix the issues before starting."
    exit 1
fi