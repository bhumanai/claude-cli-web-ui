# Deployment Guide - Claude CLI Vercel Backend

This guide covers deploying the Claude CLI serverless backend to Vercel with all cloud integrations.

## 🚀 Quick Deployment

### Option 1: One-Click Deploy (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/claude-cli-backend-vercel)

### Option 2: Manual Deployment

```bash
# 1. Clone the repository
git clone https://github.com/your-username/claude-cli-backend-vercel
cd backend-vercel

# 2. Install Vercel CLI
npm i -g vercel

# 3. Login to Vercel
vercel login

# 4. Deploy
vercel --prod
```

## ⚙️ Environment Setup

### 1. GitHub Issues Integration

1. **Create a GitHub Repository** for task storage:
   ```bash
   # Create a new repository named 'claude-cli-tasks'
   gh repo create claude-cli-tasks --public
   ```

2. **Generate Personal Access Token**:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo`, `read:user`
   - Copy the token (starts with `ghp_`)

3. **Set Environment Variables**:
   ```bash
   vercel env add GITHUB_TOKEN
   vercel env add GITHUB_REPO_OWNER
   vercel env add GITHUB_REPO_NAME
   ```

### 2. Upstash Redis Setup

1. **Create Upstash Redis Database**:
   - Go to https://console.upstash.com/redis
   - Click "Create Database"
   - Choose a region close to your users
   - Select "REST API" in the dashboard

2. **Get Connection Details**:
   ```bash
   # Copy from Upstash dashboard
   UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token
   ```

3. **Set Environment Variables**:
   ```bash
   vercel env add UPSTASH_REDIS_REST_URL
   vercel env add UPSTASH_REDIS_REST_TOKEN
   ```

### 3. Terragon API Setup

1. **Get Terragon API Key**:
   - Sign up at https://terragon.ai
   - Go to Dashboard → API Keys
   - Create a new API key

2. **Set Environment Variables**:
   ```bash
   vercel env add TERRAGON_API_KEY
   vercel env add TERRAGON_BASE_URL  # Optional, defaults to https://api.terragon.ai
   ```

### 4. Authentication & Security

1. **Generate Strong JWT Secret**:
   ```bash
   # Generate a strong random secret
   openssl rand -hex 64
   ```

2. **Set Security Variables**:
   ```bash
   vercel env add JWT_SECRET
   vercel env add NODE_ENV production
   ```

### 5. Callback Configuration

1. **Set Callback URL** (after deployment):
   ```bash
   vercel env add CALLBACK_BASE_URL https://your-app.vercel.app
   ```

## 📋 Complete Environment Checklist

### Required Variables ✅
- [ ] `JWT_SECRET` - Strong random string for JWT signing
- [ ] `GITHUB_TOKEN` - GitHub personal access token
- [ ] `GITHUB_REPO_OWNER` - Your GitHub username
- [ ] `GITHUB_REPO_NAME` - Repository name for tasks
- [ ] `UPSTASH_REDIS_REST_URL` - Upstash Redis REST URL
- [ ] `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- [ ] `TERRAGON_API_KEY` - Terragon API key
- [ ] `CALLBACK_BASE_URL` - Your deployment URL

### Optional Variables
- [ ] `TERRAGON_BASE_URL` - Custom Terragon endpoint
- [ ] `NODE_ENV` - Environment (production/development)
- [ ] `RATE_LIMIT_PER_MINUTE` - Custom rate limit

## 🔧 Local Development Setup

1. **Clone and Install**:
   ```bash
   git clone https://github.com/your-repo/claude-cli-backend-vercel
   cd backend-vercel
   npm install
   ```

2. **Environment File**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```

4. **Test API**:
   ```bash
   curl http://localhost:3000/api/health
   ```

## 🧪 Testing the Deployment

### 1. Health Check
```bash
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2024-01-30T10:00:00.000Z",
    "services": {
      "redis": true,
      "github": true,
      "terragon": true
    }
  }
}
```

### 2. Authentication Test
```bash
# Login with default credentials
curl -X POST https://your-app.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### 3. Create a Project
```bash
# Use token from login response
curl -X POST https://your-app.vercel.app/api/projects \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "description": "Testing deployment"}'
```

### 4. Create a Task
```bash
curl -X POST https://your-app.vercel.app/api/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PROJECT_ID_FROM_ABOVE",
    "name": "Test Task",
    "command": "echo Hello World",
    "priority": "medium"
  }'
```

## 🔍 Monitoring & Debugging

### Vercel Functions Dashboard
- View function logs: https://vercel.com/dashboard
- Monitor performance and errors
- Check function execution times

### Debug Common Issues

1. **Environment Variables Missing**:
   ```bash
   vercel env ls
   ```

2. **GitHub API Errors**:
   - Check token permissions
   - Verify repository exists
   - Monitor GitHub API rate limits

3. **Redis Connection Issues**:
   ```bash
   # Test Redis connection
   curl -X GET "https://your-redis.upstash.io/get/test" \
     -H "Authorization: Bearer YOUR_REDIS_TOKEN"
   ```

4. **Terragon API Issues**:
   - Verify API key is valid
   - Check Terragon dashboard for quotas
   - Review worker creation logs

### Enable Debug Logging
Set `NODE_ENV=development` for detailed error messages and request logging.

## 🚀 Production Optimization

### 1. Performance
- Enable Vercel Edge Network
- Configure Redis caching TTL
- Optimize API response sizes

### 2. Security
- Use strong JWT secrets (64+ characters)
- Enable CORS only for your frontend domain
- Monitor rate limiting effectiveness

### 3. Cost Optimization
- Set appropriate Redis TTL values
- Monitor Terragon worker costs
- Use efficient GitHub API pagination

### 4. Reliability
- Set up Vercel monitoring alerts
- Configure GitHub webhook backups
- Monitor Redis memory usage

## 🔄 CI/CD Pipeline

### GitHub Actions Example
```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## 📈 Scaling Considerations

### High Traffic
- Vercel handles auto-scaling
- Monitor function execution limits
- Consider Redis connection pooling

### Multi-Region
- Deploy to multiple Vercel regions
- Use regional Redis instances
- Configure geographically distributed workers

### Enterprise Features
- Vercel Pro/Enterprise for advanced features
- Upstash Pro for higher Redis limits
- Terragon enterprise plans for dedicated resources

---

## ✅ Deployment Complete!

Your Claude CLI serverless backend is now deployed and ready for production use with:

- ✅ Secure JWT authentication
- ✅ GitHub Issues task persistence
- ✅ Redis-based task queuing
- ✅ Terragon worker deployment
- ✅ Real-time SSE updates
- ✅ Production-grade security
- ✅ Global edge deployment

**Next Steps**: Update your frontend to point to the new Vercel backend URL!