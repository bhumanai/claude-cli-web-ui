#!/bin/bash

# Claude CLI Web UI - Quick Setup Script
# Installs all dependencies and prepares the environment

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

# Header
echo -e "${PURPLE}╔═══════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║    Claude CLI Web UI - Quick Setup    ║${NC}"
echo -e "${PURPLE}║      Installing Dependencies          ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}🔍 Checking system requirements...${NC}"

# Check Python
PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is required but not installed${NC}"
    echo -e "${YELLOW}💡 Install Python 3.8+ from https://python.org${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Python $PYTHON_VERSION found${NC}"
    
    # Check if Python 3.13+ and warn about potential compatibility issues
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)
    
    if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 13 ]; then
        echo -e "${YELLOW}⚠️  Python 3.13+ detected - using compatible requirements${NC}"
        REQUIREMENTS_FILE="requirements.txt"
    else
        echo -e "${GREEN}✅ Python version compatible${NC}"
        REQUIREMENTS_FILE="requirements.txt"
    fi
fi

# Check Node.js
NODE_VERSION=$(node --version 2>&1)
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    echo -e "${YELLOW}💡 Install Node.js 18+ from https://nodejs.org${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Node.js $NODE_VERSION found${NC}"
fi

# Check npm
NPM_VERSION=$(npm --version 2>&1)
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is required but not installed${NC}"
    exit 1
else
    echo -e "${GREEN}✅ npm $NPM_VERSION found${NC}"
fi

echo ""

# Setup Python backend
echo -e "${BLUE}🐍 Setting up Python backend...${NC}"
cd "$BACKEND_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 Creating Python virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✅ Virtual environment created${NC}"
else
    echo -e "${GREEN}✅ Virtual environment already exists${NC}"
fi

# Activate virtual environment
echo -e "${YELLOW}🔧 Activating virtual environment...${NC}"
source venv/bin/activate

# Upgrade pip
echo -e "${YELLOW}⬆️  Upgrading pip...${NC}"
pip install --upgrade pip --quiet

# Install backend dependencies
echo -e "${YELLOW}📦 Installing Python dependencies...${NC}"
pip install -r "$REQUIREMENTS_FILE" --quiet

# Test backend setup
echo -e "${YELLOW}🧪 Testing backend setup...${NC}"
if python -c "import fastapi, uvicorn, websockets; print('✅ All backend dependencies installed successfully')" 2>/dev/null; then
    echo -e "${GREEN}✅ Backend setup complete${NC}"
else
    echo -e "${RED}❌ Backend setup failed${NC}"
    exit 1
fi

echo ""

# Setup Node.js frontend
echo -e "${CYAN}⚛️  Setting up React frontend...${NC}"
cd "$FRONTEND_DIR"

# Clean install if package-lock.json exists but node_modules doesn't
if [ -f "package-lock.json" ] && [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}🧹 Cleaning package cache...${NC}"
    npm cache clean --force --silent
fi

# Install frontend dependencies
echo -e "${YELLOW}📦 Installing Node.js dependencies...${NC}"
npm install

# Run type check to verify setup
echo -e "${YELLOW}🧪 Testing frontend setup...${NC}"
if npm run type-check --silent; then
    echo -e "${GREEN}✅ Frontend setup complete${NC}"
else
    echo -e "${RED}❌ Frontend setup failed - TypeScript errors found${NC}"
    exit 1
fi

# Build frontend to test everything works
echo -e "${YELLOW}🏗️  Testing build process...${NC}"
if npm run build --silent; then
    echo -e "${GREEN}✅ Build test successful${NC}"
    # Clean up build artifacts
    rm -rf dist/
else
    echo -e "${RED}❌ Build test failed${NC}"
    exit 1
fi

echo ""

# Final verification
echo -e "${BLUE}🔍 Final verification...${NC}"

# Check backend executable
cd "$BACKEND_DIR"
source venv/bin/activate
if [ -f "main.py" ]; then
    echo -e "${GREEN}✅ Backend entry point found${NC}"
else
    echo -e "${RED}❌ Backend entry point missing${NC}"
    exit 1
fi

# Check frontend package.json
cd "$FRONTEND_DIR"
if [ -f "package.json" ]; then
    echo -e "${GREEN}✅ Frontend configuration found${NC}"
else
    echo -e "${RED}❌ Frontend configuration missing${NC}"
    exit 1
fi

echo ""

# Success message
echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
echo ""
echo -e "${CYAN}📍 Next Steps:${NC}"
echo -e "   1. Run: ${BLUE}./start.sh${NC} to launch both servers"
echo -e "   2. Open: ${BLUE}http://localhost:5173${NC} in your browser"
echo -e "   3. Start using the Claude CLI Web UI!"
echo ""
echo -e "${YELLOW}💡 Useful Commands:${NC}"
echo -e "   • ${BLUE}./start.sh${NC}     - Start both servers"
echo -e "   • ${BLUE}./test.sh${NC}      - Run integration tests"
echo -e "   • ${BLUE}./backend/start_server.py${NC} - Start backend only"
echo -e "   • ${BLUE}./frontend/start.sh${NC}       - Start frontend only"
echo ""
echo -e "${PURPLE}🚀 Ready to launch!${NC}"