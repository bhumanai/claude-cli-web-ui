#!/bin/bash

# Claude CLI Web UI - Environment Setup Helper
# This script helps you set up your environment configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Claude CLI Web UI - Environment Setup        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo

# Check if .env.production exists
if [ -f ".env.production" ]; then
    echo -e "${YELLOW}⚠️  .env.production already exists${NC}"
    read -p "Do you want to update it? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Function to generate secure random string
generate_secret() {
    openssl rand -hex 32 2>/dev/null || cat /dev/urandom | head -c 32 | base64
}

echo -e "${GREEN}🔑 Generating secure secrets...${NC}"

# Generate all secrets
JWT_SECRET=$(generate_secret)
JWT_REFRESH_SECRET=$(generate_secret)
GITHUB_WEBHOOK_SECRET=$(generate_secret)
TERRAGON_WEBHOOK_SECRET=$(generate_secret)
SESSION_SECRET=$(generate_secret)
ENCRYPTION_KEY=$(generate_secret)

echo "✅ Secrets generated"
echo

# Get Vercel information
echo -e "${BLUE}📦 Vercel Configuration${NC}"
echo "1. First, install Vercel CLI: npm i -g vercel"
echo "2. Run: vercel login"
echo "3. Run: vercel link (in this directory)"
echo
read -p "Have you completed these steps? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Try to read from .vercel/project.json
    if [ -f ".vercel/project.json" ]; then
        VERCEL_ORG_ID=$(cat .vercel/project.json | grep -o '"orgId":"[^"]*' | cut -d'"' -f4)
        VERCEL_PROJECT_ID=$(cat .vercel/project.json | grep -o '"projectId":"[^"]*' | cut -d'"' -f4)
        echo "✅ Found Vercel project configuration"
    fi
fi

# Prompt for required values
echo
echo -e "${BLUE}📝 Please provide the following information:${NC}"
echo "(Press Enter to skip optional fields)"
echo

read -p "Vercel Token (from https://vercel.com/account/tokens): " VERCEL_TOKEN
read -p "GitHub Client ID: " GITHUB_CLIENT_ID
read -p "GitHub Client Secret: " GITHUB_CLIENT_SECRET
read -p "GitHub Personal Access Token: " GITHUB_TOKEN
read -p "Upstash Redis URL: " UPSTASH_REDIS_REST_URL
read -p "Upstash Redis Token: " UPSTASH_REDIS_REST_TOKEN
read -p "Terragon API Key: " TERRAGON_API_KEY
read -p "Your app domain (e.g., my-app.vercel.app): " APP_DOMAIN

# Optional configurations
echo
echo -e "${YELLOW}📌 Optional Configurations (press Enter to skip):${NC}"
read -p "Sentry DSN: " SENTRY_DSN
read -p "Slack Webhook URL: " SLACK_WEBHOOK_URL
read -p "Custom Domain: " CUSTOM_DOMAIN

# Create updated .env.production
cat > .env.production << EOF
# Claude CLI Web UI Production Configuration
# Generated: $(date)

# === DEPLOYMENT CONFIGURATION ===
NODE_ENV=production
DEPLOYMENT_ENV=production

# === VERCEL CONFIGURATION ===
VERCEL_TOKEN=${VERCEL_TOKEN}
VERCEL_ORG_ID=${VERCEL_ORG_ID:-your-vercel-org-id}
VERCEL_PROJECT_ID=${VERCEL_PROJECT_ID:-your-vercel-project-id}

# === AUTHENTICATION SECRETS ===
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# === API CONFIGURATION ===
NEXT_PUBLIC_API_URL=https://${APP_DOMAIN}
API_URL=https://${APP_DOMAIN}

# === GITHUB INTEGRATION ===
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
GITHUB_TOKEN=${GITHUB_TOKEN}

# === UPSTASH REDIS ===
UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}

# === TERRAGON API ===
TERRAGON_API_KEY=${TERRAGON_API_KEY}
TERRAGON_API_URL=https://api.terragonlabs.com/v1
TERRAGON_WEBHOOK_SECRET=${TERRAGON_WEBHOOK_SECRET}

# === MONITORING & ANALYTICS ===
SENTRY_DSN=${SENTRY_DSN}
SENTRY_ORG=${SENTRY_ORG:-your-org}
SENTRY_PROJECT=claude-cli-web-ui

# === SECURITY CONFIGURATION ===
ALLOWED_ORIGINS=https://${APP_DOMAIN}${CUSTOM_DOMAIN:+,https://${CUSTOM_DOMAIN}}
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=60

# === FEATURE FLAGS ===
ENABLE_AUTH=true
ENABLE_RATE_LIMITING=true
ENABLE_GITHUB_INTEGRATION=true
ENABLE_TERRAGON_INTEGRATION=true
ENABLE_MONITORING=true

# === LOGGING ===
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true

# === CUSTOM DOMAIN ===
CUSTOM_DOMAIN=${CUSTOM_DOMAIN}

# === ENCRYPTION KEYS ===
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# === SESSION CONFIGURATION ===
SESSION_SECRET=${SESSION_SECRET}
SESSION_MAX_AGE=86400

# === ADMIN USER ===
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ChangeThisImmediately123!
ADMIN_EMAIL=admin@${APP_DOMAIN}

# === NOTIFICATIONS ===
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}

# === PERFORMANCE ===
MAX_CONCURRENT_WORKERS=10
WORKER_TIMEOUT=300000
ENABLE_CACHING=true
CACHE_TTL=3600

# === DEPLOYMENT METADATA ===
DEPLOYMENT_VERSION=1.0.0
DEPLOYMENT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo
echo -e "${GREEN}✅ Environment configuration created!${NC}"
echo

# Validate configuration
echo -e "${BLUE}🔍 Validating configuration...${NC}"

# Check required fields
MISSING_FIELDS=()
[ -z "$VERCEL_TOKEN" ] && MISSING_FIELDS+=("VERCEL_TOKEN")
[ -z "$GITHUB_CLIENT_ID" ] && MISSING_FIELDS+=("GITHUB_CLIENT_ID")
[ -z "$GITHUB_CLIENT_SECRET" ] && MISSING_FIELDS+=("GITHUB_CLIENT_SECRET")
[ -z "$GITHUB_TOKEN" ] && MISSING_FIELDS+=("GITHUB_TOKEN")
[ -z "$UPSTASH_REDIS_REST_URL" ] && MISSING_FIELDS+=("UPSTASH_REDIS_REST_URL")
[ -z "$UPSTASH_REDIS_REST_TOKEN" ] && MISSING_FIELDS+=("UPSTASH_REDIS_REST_TOKEN")
[ -z "$TERRAGON_API_KEY" ] && MISSING_FIELDS+=("TERRAGON_API_KEY")

if [ ${#MISSING_FIELDS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Missing required fields:${NC}"
    printf '%s\n' "${MISSING_FIELDS[@]}"
    echo
    echo "Please edit .env.production and fill in the missing values."
    echo "Refer to ENVIRONMENT_SETUP_GUIDE.md for instructions."
else
    echo -e "${GREEN}✅ All required fields are configured${NC}"
fi

echo
echo -e "${BLUE}📚 Next Steps:${NC}"
echo "1. Review .env.production and update any placeholder values"
echo "2. Read ENVIRONMENT_SETUP_GUIDE.md for detailed setup instructions"
echo "3. Run: ./deploy.sh production deploy"
echo
echo -e "${GREEN}🚀 Ready to deploy!${NC}"