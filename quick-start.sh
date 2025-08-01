#!/bin/bash

# Claude CLI Web UI - Quick Start Script
# For users who just want to get started immediately

echo "🚀 Claude CLI Web UI - Quick Start"
echo "=================================="
echo

# Check if foolproof script exists
if [ -f "./foolproof-start.sh" ]; then
    echo "✅ Found foolproof startup script"
    echo "🔄 Starting bulletproof startup sequence..."
    echo
    ./foolproof-start.sh
else
    echo "❌ Foolproof startup script not found"
    echo "Please ensure you're in the correct directory with foolproof-start.sh"
    exit 1
fi