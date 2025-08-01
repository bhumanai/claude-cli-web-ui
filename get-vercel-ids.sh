#!/bin/bash

# Quick Vercel ID retrieval script
set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Vercel Project Setup${NC}"
echo "===================="
echo

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI not found!${NC}"
    echo "Please install it first:"
    echo "npm i -g vercel"
    exit 1
fi

# Check if .vercel directory exists
if [ ! -d ".vercel" ]; then
    echo -e "${YELLOW}📦 Setting up Vercel project...${NC}"
    echo "This will create a new Vercel project linked to this directory."
    echo
    vercel link
fi

# Extract IDs from .vercel/project.json
if [ -f ".vercel/project.json" ]; then
    echo
    echo -e "${GREEN}✅ Vercel project linked successfully!${NC}"
    echo
    
    VERCEL_ORG_ID=$(cat .vercel/project.json | grep -o '"orgId":"[^"]*' | cut -d'"' -f4)
    VERCEL_PROJECT_ID=$(cat .vercel/project.json | grep -o '"projectId":"[^"]*' | cut -d'"' -f4)
    
    echo "Your Vercel IDs:"
    echo "================"
    echo -e "Org ID:     ${GREEN}${VERCEL_ORG_ID}${NC}"
    echo -e "Project ID: ${GREEN}${VERCEL_PROJECT_ID}${NC}"
    echo
    
    # Update .env.production
    if [ -f ".env.production" ]; then
        echo "Updating .env.production with IDs..."
        sed -i.bak "s/VERCEL_ORG_ID=.*/VERCEL_ORG_ID=${VERCEL_ORG_ID}/" .env.production
        sed -i.bak "s/VERCEL_PROJECT_ID=.*/VERCEL_PROJECT_ID=${VERCEL_PROJECT_ID}/" .env.production
        echo -e "${GREEN}✅ Updated .env.production${NC}"
    fi
    
    echo
    echo "Next step: Run ./deploy.sh production deploy"
else
    echo -e "${RED}❌ Failed to create .vercel/project.json${NC}"
    echo "Please try running 'vercel link' manually"
fi