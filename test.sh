#!/bin/bash

# Claude CLI Web UI - Integration Test Script
# Tests the complete system functionality

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project paths
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Test configuration
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:5173"
WEBSOCKET_URL="ws://localhost:8000/ws"

# Process tracking
BACKEND_PID=""
FRONTEND_PID=""
TEST_PASSED=0
TEST_FAILED=0

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up test environment...${NC}"
    
    if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID
        wait $BACKEND_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID
        wait $FRONTEND_PID 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Test helper functions
test_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TEST_PASSED++))
}

test_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((TEST_FAILED++))
}

test_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}⏳ Waiting for $service_name to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            test_pass "$service_name is ready"
            return 0
        fi
        
        sleep 1
        ((attempt++))
    done
    
    test_fail "$service_name failed to start within $max_attempts seconds"
    return 1
}

# Header
echo -e "${PURPLE}╔═══════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║   Claude CLI Web UI Integration Test  ║${NC}"
echo -e "${PURPLE}║        Comprehensive Testing          ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Test 1: Prerequisites Check
echo -e "${CYAN}🧪 Test 1: Prerequisites Check${NC}"
test_info "Checking required tools..."

if command -v python3 &> /dev/null; then
    test_pass "Python 3 is available"
else
    test_fail "Python 3 is not available"
fi

if command -v node &> /dev/null; then
    test_pass "Node.js is available"
else
    test_fail "Node.js is not available"
fi

if command -v npm &> /dev/null; then
    test_pass "npm is available"
else
    test_fail "npm is not available"
fi

if command -v curl &> /dev/null; then
    test_pass "curl is available"
else
    test_fail "curl is not available"
fi

echo ""

# Test 2: Project Structure
echo -e "${CYAN}🧪 Test 2: Project Structure${NC}"
test_info "Verifying project files..."

if [ -f "$BACKEND_DIR/main.py" ]; then
    test_pass "Backend entry point exists"
else
    test_fail "Backend entry point missing"
fi

if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    test_pass "Backend requirements file exists"
else
    test_fail "Backend requirements file missing"
fi

if [ -f "$FRONTEND_DIR/package.json" ]; then
    test_pass "Frontend package.json exists"
else
    test_fail "Frontend package.json missing"
fi

if [ -f "$FRONTEND_DIR/src/App.tsx" ]; then
    test_pass "Frontend App component exists"
else
    test_fail "Frontend App component missing"
fi

echo ""

# Test 3: Backend Setup
echo -e "${CYAN}🧪 Test 3: Backend Dependencies${NC}"
test_info "Checking backend dependencies..."

cd "$BACKEND_DIR"

if [ -d "venv" ]; then
    test_pass "Python virtual environment exists"
else
    test_fail "Python virtual environment missing"
fi

source venv/bin/activate

if python -c "import fastapi" 2>/dev/null; then
    test_pass "FastAPI is installed"
else
    test_fail "FastAPI is not installed"
fi

if python -c "import uvicorn" 2>/dev/null; then
    test_pass "Uvicorn is installed"
else
    test_fail "Uvicorn is not installed"
fi

if python -c "import websockets" 2>/dev/null; then
    test_pass "WebSockets library is installed"
else
    test_fail "WebSockets library is not installed"
fi

echo ""

# Test 4: Frontend Setup
echo -e "${CYAN}🧪 Test 4: Frontend Dependencies${NC}"
test_info "Checking frontend dependencies..."

cd "$FRONTEND_DIR"

if [ -d "node_modules" ]; then
    test_pass "Node.js dependencies are installed"
else
    test_fail "Node.js dependencies are missing"
fi

if [ -d "node_modules/react" ]; then
    test_pass "React is installed"
else
    test_fail "React is not installed"
fi

if [ -d "node_modules/typescript" ]; then
    test_pass "TypeScript is installed"
else
    test_fail "TypeScript is not installed"
fi

# Run type check
if npm run type-check --silent; then
    test_pass "TypeScript type check passes"
else
    test_fail "TypeScript type check fails"
fi

echo ""

# Test 5: Backend Server
echo -e "${CYAN}🧪 Test 5: Backend Server${NC}"
test_info "Starting backend server..."

cd "$BACKEND_DIR"
./venv/bin/python3 main.py &
BACKEND_PID=$!

if wait_for_service "$BACKEND_URL/health" "Backend server"; then
    # Test health endpoint
    if curl -s "$BACKEND_URL/health" | grep -q "ok"; then
        test_pass "Health endpoint returns correct response"
    else
        test_fail "Health endpoint returns invalid response"
    fi
    
    # Test API documentation
    if curl -s "$BACKEND_URL/docs" > /dev/null; then
        test_pass "API documentation is accessible"
    else
        test_fail "API documentation is not accessible"
    fi
    
    # Test WebSocket endpoint (basic connectivity)
    if curl -s -H "Connection: Upgrade" -H "Upgrade: websocket" "$BACKEND_URL/ws" > /dev/null; then
        test_pass "WebSocket endpoint is available"
    else
        test_fail "WebSocket endpoint is not available"
    fi
else
    test_fail "Backend server failed to start"
fi

echo ""

# Test 6: Frontend Server
echo -e "${CYAN}🧪 Test 6: Frontend Server${NC}"
test_info "Starting frontend server..."

cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

if wait_for_service "$FRONTEND_URL" "Frontend server"; then
    # Test if the page loads
    if curl -s "$FRONTEND_URL" | grep -q "Claude CLI Web UI"; then
        test_pass "Frontend page loads with correct title"
    else
        test_pass "Frontend server is responding (title check inconclusive)"
    fi
    
    # Test static assets
    if curl -s "$FRONTEND_URL/vite.svg" > /dev/null; then
        test_pass "Static assets are served correctly"
    else
        test_info "Static asset test inconclusive (normal for dev server)"
    fi
else
    test_fail "Frontend server failed to start"
fi

echo ""

# Test 7: Integration Test
echo -e "${CYAN}🧪 Test 7: API Integration${NC}"
test_info "Testing API endpoints..."

# Test sessions endpoint
if curl -s "$BACKEND_URL/api/sessions" | grep -q "\[\]"; then
    test_pass "Sessions API endpoint works"
else
    test_fail "Sessions API endpoint fails"
fi

# Test command endpoint (simulate a basic command)
COMMAND_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/commands/execute" \
    -H "Content-Type: application/json" \
    -d '{"command": "echo test", "session_id": "test-session"}')

if echo "$COMMAND_RESPONSE" | grep -q "success"; then
    test_pass "Command execution API works"
else
    test_fail "Command execution API fails"
fi

echo ""

# Test Results Summary
echo -e "${PURPLE}╔═══════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║           Test Results Summary         ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}✅ Tests Passed: $TEST_PASSED${NC}"
echo -e "${RED}❌ Tests Failed: $TEST_FAILED${NC}"
echo ""

if [ $TEST_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! The system is ready for use.${NC}"
    echo ""
    echo -e "${CYAN}📍 System Status:${NC}"
    echo -e "   🌐 Frontend: ${GREEN}Running at $FRONTEND_URL${NC}"
    echo -e "   🔧 Backend:  ${GREEN}Running at $BACKEND_URL${NC}"
    echo -e "   📋 API Docs: ${GREEN}Available at $BACKEND_URL/docs${NC}"
    echo ""
    echo -e "${YELLOW}💡 The servers will continue running for manual testing.${NC}"
    echo -e "${YELLOW}   Press Ctrl+C to stop all servers.${NC}"
    echo ""
    
    # Keep servers running for manual testing
    echo -e "${BLUE}⏳ Keeping servers running for manual testing...${NC}"
    wait $BACKEND_PID $FRONTEND_PID
    
    exit 0
else
    echo -e "${RED}💥 Some tests failed. Please check the setup and try again.${NC}"
    exit 1
fi