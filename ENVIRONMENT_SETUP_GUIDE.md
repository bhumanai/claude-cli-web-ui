# Environment Configuration Setup Guide

This guide will help you obtain all the required credentials and tokens for your `.env.production` file.

## 🚀 Quick Setup Steps

### 1. Vercel Configuration
1. **Create Vercel Account** (if you don't have one):
   - Go to https://vercel.com/signup
   - Sign up with GitHub for easier integration

2. **Get Vercel Token**:
   - Go to https://vercel.com/account/tokens
   - Click "Create Token"
   - Name it "Claude CLI Deployment"
   - Copy and save as `VERCEL_TOKEN`

3. **Get Organization and Project IDs**:
   ```bash
   # After installing Vercel CLI
   npm i -g vercel
   vercel login
   
   # In your project directory
   vercel link
   # This will create .vercel/project.json with your IDs
   ```

### 2. GitHub OAuth App Setup
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Claude CLI Web UI
   - **Homepage URL**: https://your-app.vercel.app
   - **Authorization callback URL**: https://your-app.vercel.app/api/auth/github/callback
4. Save your:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`

5. **Create Personal Access Token**:
   - Go to https://github.com/settings/tokens
   - Generate new token (classic)
   - Select scopes: `repo`, `workflow`
   - Save as `GITHUB_TOKEN`

### 3. Upstash Redis Setup
1. Go to https://console.upstash.com
2. Create new Redis database
3. Select region closest to your users
4. Copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 4. Terragon API Setup
1. Sign up at https://terragonlabs.com
2. Go to API Keys section
3. Create new API key
4. Save:
   - `TERRAGON_API_KEY`
   - Note the API URL (usually https://api.terragonlabs.com/v1)

### 5. Generate Security Keys
```bash
# Generate JWT secrets
openssl rand -hex 32  # Use for JWT_SECRET
openssl rand -hex 32  # Use for JWT_REFRESH_SECRET

# Generate webhook secrets
openssl rand -hex 32  # Use for GITHUB_WEBHOOK_SECRET
openssl rand -hex 32  # Use for TERRAGON_WEBHOOK_SECRET

# Generate other secrets
openssl rand -hex 32  # Use for SESSION_SECRET
openssl rand -hex 32  # Use for ENCRYPTION_KEY
```

### 6. Optional: Monitoring Setup

#### Sentry (Error Tracking)
1. Sign up at https://sentry.io
2. Create new project (Select Next.js)
3. Copy your DSN from project settings
4. Get auth token from https://sentry.io/settings/account/api/auth-tokens/

#### Slack Notifications
1. Go to https://api.slack.com/apps
2. Create new app
3. Add "Incoming Webhooks"
4. Copy webhook URL

## 📝 Environment File Template

Here's a filled example with dummy values:

```env
# === VERCEL CONFIGURATION ===
VERCEL_TOKEN=CbjXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VERCEL_ORG_ID=team_XXXXXXXXXXXXXXXXXX
VERCEL_PROJECT_ID=prj_XXXXXXXXXXXXXXXXXX

# === AUTHENTICATION SECRETS ===
JWT_SECRET=a7f2e9b5c8d1e4f7a2b5c8d1e4f7a2b5c8d1e4f7a2b5c8d1e4f7a2b5c8d1e4f7
JWT_REFRESH_SECRET=b8g3f0c6d9e2f5g8b3c6d9e2f5g8b3c6d9e2f5g8b3c6d9e2f5g8b3c6d9e2f5g8

# === GITHUB INTEGRATION ===
GITHUB_CLIENT_ID=Iv1.8a7b6c5d4e3f2g1h
GITHUB_CLIENT_SECRET=1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t
GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# === UPSTASH REDIS ===
UPSTASH_REDIS_REST_URL=https://us1-settling-python-00000.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXXXASQgNjE3ODk5ZTAtZDU4Yi00YmY2LWEyMGItNzQwZGE3ZmI5Njg5

# === TERRAGON API ===
TERRAGON_API_KEY=tg_live_XXXXXXXXXXXXXXXXXXXXXXXXXX
```

## 🔒 Security Best Practices

1. **Never commit `.env.production` to git**
   - Add to `.gitignore`
   - Use Vercel environment variables for production

2. **Rotate secrets regularly**
   - Set calendar reminders for quarterly rotation
   - Update both local and Vercel environment variables

3. **Use strong passwords**
   - Minimum 32 characters for secrets
   - Use cryptographically secure random generators

4. **Limit token scopes**
   - Only grant necessary permissions
   - Use read-only tokens where possible

## 🚀 Deployment Command

Once your `.env.production` is configured:

```bash
# First time setup
vercel link

# Deploy to production
./deploy.sh production deploy

# Or manually
vercel --prod
```

## 📊 Verifying Configuration

After deployment, check:
1. https://your-app.vercel.app/api/health - Should return "ok"
2. Vercel dashboard for environment variables
3. GitHub webhooks are receiving events
4. Redis connection is established
5. Terragon API is accessible

## 🆘 Troubleshooting

If deployment fails:
1. Check Vercel build logs
2. Verify all required environment variables are set
3. Ensure API keys have correct permissions
4. Check network connectivity to external services

Need help? Check the deployment logs or run:
```bash
./deploy.sh production validate
```