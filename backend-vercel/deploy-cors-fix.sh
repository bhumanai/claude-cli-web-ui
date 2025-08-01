#!/bin/bash

echo "🚀 Deploying CORS fix to Vercel backend..."

# Change to backend directory
cd "$(dirname "$0")"

# Deploy to Vercel
vercel --prod

echo "✅ CORS fix deployed! Your backend should now accept requests from:"
echo "   https://claudeui-6gykcm69k-bhuman.vercel.app"
echo ""
echo "🔍 Test the fix by visiting:"
echo "   https://backend-vercel-ruby.vercel.app/api/health"
echo ""
echo "⚡ If you still get CORS errors, try these in Vercel UI:"
echo "   1. Go to your Vercel dashboard"
echo "   2. Select your backend project"
echo "   3. Go to Settings > Environment Variables"
echo "   4. Add: FRONTEND_URL = https://claudeui-6gykcm69k-bhuman.vercel.app"
echo "   5. Redeploy the project"