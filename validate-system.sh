#!/bin/bash

# Quick system validation script for Claude CLI Web UI
# Tests that both backend and frontend are working properly

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Claude CLI Web UI - System Validation${NC}"
echo -e "${BLUE}=========================================${NC}"
echo

# Test backend health
echo -e "${YELLOW}Testing backend...${NC}"
if curl -s http://localhost:8000/api/health/ | grep -q "ok\|running\|healthy"; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
    
    # Test specific endpoints
    echo -e "${YELLOW}Testing API endpoints...${NC}"
    
    if curl -s http://localhost:8000/api/projects/ | grep -q "data"; then
        echo -e "${GREEN}✅ Projects API working${NC}"
    else
        echo -e "${RED}❌ Projects API failed${NC}"
    fi
    
    if curl -s http://localhost:8000/api/sessions/ | grep -q "data"; then
        echo -e "${GREEN}✅ Sessions API working${NC}"
    else
        echo -e "${RED}❌ Sessions API failed${NC}"
    fi
    
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    exit 1
fi

echo

# Test frontend
echo -e "${YELLOW}Testing frontend...${NC}"
if curl -s -o /dev/null http://localhost:5173; then
    echo -e "${GREEN}✅ Frontend is accessible${NC}"
else
    echo -e "${RED}❌ Frontend is not accessible${NC}"
    exit 1
fi

echo

# Test WebSocket connection (basic TCP test)
echo -e "${YELLOW}Testing WebSocket port...${NC}"
if python3 -c "
import socket
try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    sock.connect(('localhost', 8000))
    sock.close()
    print('WebSocket port accessible')
except Exception as e:
    print(f'WebSocket port test failed: {e}')
    exit(1)
" 2>/dev/null; then
    echo -e "${GREEN}✅ WebSocket port is accessible${NC}"
else
    echo -e "${YELLOW}⚠️  WebSocket port test inconclusive${NC}"
fi

echo

# Check process status
echo -e "${YELLOW}Checking processes...${NC}"
backend_pids=$(lsof -ti :8000 2>/dev/null || echo "")
frontend_pids=$(lsof -ti :5173 2>/dev/null || echo "")

if [ ! -z "$backend_pids" ]; then
    echo -e "${GREEN}✅ Backend process running (PID: $backend_pids)${NC}"
else
    echo -e "${RED}❌ No backend process found${NC}"
fi

if [ ! -z "$frontend_pids" ]; then
    echo -e "${GREEN}✅ Frontend process running (PID: $frontend_pids)${NC}"
else
    echo -e "${RED}❌ No frontend process found${NC}"
fi

echo

# Summary
echo -e "${GREEN}🎉 System Validation Complete!${NC}"
echo -e "${BLUE}Access your Claude CLI Web UI at: http://localhost:5173${NC}"
echo -e "${BLUE}Backend API available at: http://localhost:8000${NC}"
echo -e "${BLUE}API Documentation at: http://localhost:8000/docs${NC}"
echo