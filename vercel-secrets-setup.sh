#!/bin/bash
# Vercel Secrets Setup Script
# Run this script to securely configure environment variables for production

set -e

echo "🔐 Setting up Vercel secrets for Claude CLI Web UI..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Login to Vercel (if not already logged in)
echo "🔑 Verifying Vercel authentication..."
vercel whoami || vercel login

# Generate secure secrets
echo "🔒 Generating secure secrets..."
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

# Add secrets to Vercel
echo "📤 Adding secrets to Vercel..."

# Authentication secrets
vercel secrets add jwt-secret "$JWT_SECRET"
vercel secrets add jwt-refresh-secret "$JWT_REFRESH_SECRET"
vercel secrets add encryption-key "$ENCRYPTION_KEY"
vercel secrets add session-secret "$SESSION_SECRET"

# Prompt for external service tokens
echo ""
echo "🔧 Please provide the following external service credentials:"
echo ""

read -p "GitHub Token (from https://github.com/settings/tokens): " GITHUB_TOKEN
vercel secrets add github-token "$GITHUB_TOKEN"

read -p "Upstash Redis URL (from https://console.upstash.com): " UPSTASH_URL
vercel secrets add upstash-redis-url "$UPSTASH_URL"

read -p "Upstash Redis Token: " UPSTASH_TOKEN
vercel secrets add upstash-redis-token "$UPSTASH_TOKEN"

# Set environment variables
echo "🌍 Setting environment variables..."

vercel env add NODE_ENV Production "production"
vercel env add ENABLE_GUEST_ACCESS Production "true"
vercel env add ENABLE_PUBLIC_ROUTES Production "true"
vercel env add ENABLE_AUTH Production "true"
vercel env add ENABLE_RATE_LIMITING Production "true"
vercel env add LOG_LEVEL Production "info"

# Rate limiting configuration
vercel env add RATE_LIMIT_WINDOW Production "60000"
vercel env add RATE_LIMIT_MAX_REQUESTS Production "100"

# Security configuration
vercel env add ALLOWED_ORIGINS Production "https://claude-cli-web-ui.vercel.app"

echo ""
echo "✅ Vercel secrets and environment variables configured successfully!"
echo ""
echo "🚀 Next steps:"
echo "1. Deploy to production: npx vercel --prod"
echo "2. Verify deployment: curl -I https://your-deployment-url.vercel.app"
echo "3. Test authentication and public access"
echo ""
echo "🔐 Security Notes:"
echo "- All secrets are now stored securely in Vercel"
echo "- Remove any .env.production files from your repository"
echo "- Never commit secrets to version control"
echo ""