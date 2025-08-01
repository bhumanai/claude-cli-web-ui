# Claude CLI Backend - Vercel Serverless

This is the Vercel serverless backend for the Claude CLI Web UI, migrated from FastAPI to provide serverless scalability with cloud integrations.

## 🏗️ Architecture

### Core Technologies
- **Runtime**: Vercel Serverless Functions (Node.js 18+)
- **Language**: TypeScript
- **Authentication**: JWT with bcrypt password hashing
- **Task Persistence**: GitHub Issues API
- **Queue Management**: Upstash Redis
- **Worker Deployment**: Terragon API
- **Real-time Updates**: Server-Sent Events (SSE)

### Key Features
- ✅ **Secure Authentication** - JWT tokens with rate limiting
- ✅ **Task Management** - Create, update, track task execution
- ✅ **GitHub Integration** - Tasks persisted as GitHub Issues
- ✅ **Redis Queuing** - Priority-based task queuing with Upstash
- ✅ **Worker Deployment** - Automatic worker creation with Terragon
- ✅ **Real-time Updates** - SSE for live task/queue status
- ✅ **Rate Limiting** - Protection against abuse
- ✅ **Input Validation** - Comprehensive security validation
- ✅ **Command Sanitization** - Secure command execution

## 📁 Project Structure

```
backend-vercel/
├── api/                          # Vercel API Routes
│   ├── auth/
│   │   ├── login.ts             # User authentication
│   │   ├── refresh.ts           # Token refresh
│   │   └── me.ts                # Current user info
│   ├── tasks/
│   │   ├── index.ts             # Create/list tasks
│   │   └── [id].ts              # Get/update/delete specific task
│   ├── projects/
│   │   └── index.ts             # Create/list projects
│   ├── queues/
│   │   └── [id]/status.ts       # Queue status and statistics
│   ├── workers/
│   │   ├── index.ts             # Create/list workers
│   │   └── callback.ts          # Worker completion callbacks
│   ├── events/
│   │   └── [channel].ts         # Server-Sent Events
│   └── health.ts                # Health check endpoint
├── src/
│   ├── lib/
│   │   ├── auth.ts              # Authentication utilities
│   │   ├── github.ts            # GitHub Issues integration
│   │   ├── redis.ts             # Upstash Redis client
│   │   └── terragon.ts          # Terragon API client
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   └── utils/
│       └── api.ts               # API utilities and middleware
├── package.json
├── tsconfig.json
├── vercel.json                  # Vercel configuration
└── README.md
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend-vercel
npm install
```

### 2. Environment Variables

Create environment variables in Vercel dashboard or `.env.local`:

```bash
# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# GitHub Issues Integration
GITHUB_TOKEN=ghp_your_github_personal_access_token
GITHUB_REPO_OWNER=your-username
GITHUB_REPO_NAME=your-tasks-repo

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Terragon API
TERRAGON_API_KEY=your-terragon-api-key
TERRAGON_BASE_URL=https://api.terragon.ai

# Callback URL (your Vercel deployment URL)
CALLBACK_BASE_URL=https://your-app.vercel.app

# Node Environment
NODE_ENV=production
```

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## 🔧 Local Development

```bash
# Start development server
npm run dev

# Type checking
npm run type-check

# Build
npm run build
```

The API will be available at `http://localhost:3000/api/`

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info

### Tasks
- `GET /api/tasks` - List tasks (with filtering)
- `POST /api/tasks` - Create new task
- `GET /api/tasks/[id]` - Get specific task
- `PUT /api/tasks/[id]` - Update task
- `DELETE /api/tasks/[id]` - Delete task

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create new project

### Queues
- `GET /api/queues/[id]/status` - Get queue status and statistics

### Workers
- `GET /api/workers` - List workers
- `POST /api/workers` - Create worker for task
- `POST /api/workers/callback` - Worker completion callback (internal)

### Real-time Events
- `GET /api/events/[channel]` - Server-Sent Events stream

### Health
- `GET /api/health` - Health check and service status

## 🔐 Security Features

### Authentication
- JWT tokens with secure signing
- Bcrypt password hashing (12 rounds)
- Token refresh mechanism
- User permissions system

### Rate Limiting
- Per-IP and per-user rate limiting
- Different limits for authenticated/unauthenticated users
- Rate limit headers in responses

### Input Validation
- Zod schema validation for all inputs
- Command sanitization for security
- Input size limits and sanitization
- SQL injection protection

### Security Headers
- CORS configuration
- Security middleware
- Request logging in development

## 🔄 Migration from FastAPI

This backend replaces the original FastAPI implementation with these improvements:

### What Changed
- **Runtime**: Python FastAPI → Node.js/TypeScript Serverless
- **WebSocket**: Real-time WebSocket → Server-Sent Events
- **Database**: SQLAlchemy → GitHub Issues + Redis
- **Deployment**: Docker containers → Vercel serverless

### What Stayed the Same
- **API Structure**: Same endpoint patterns and responses
- **Authentication**: JWT-based auth with same security level
- **Features**: All original functionality preserved
- **Security**: Enhanced security with same principles

### Migration Benefits
- ✅ **Serverless Scalability** - Automatic scaling with zero cold starts
- ✅ **Cost Efficiency** - Pay only for requests, no idle server costs
- ✅ **Cloud Integration** - Native GitHub, Redis, and Terragon integration
- ✅ **Global Edge** - Deployed globally on Vercel's edge network
- ✅ **Type Safety** - Full TypeScript with compile-time validation

## 🔗 Cloud Integrations

### GitHub Issues
- Tasks automatically persisted as GitHub Issues
- Issue labels track task status and priority
- Comments added for task progress and completion
- Automatic issue closure on task completion

### Upstash Redis
- Task queuing with priority support
- Real-time queue statistics
- Caching for performance
- SSE message storage

### Terragon API
- Automatic worker deployment for task execution
- Resource estimation based on task requirements
- Cost tracking and optimization
- Worker lifecycle management

## 📊 Monitoring

### Health Checks
The `/api/health` endpoint provides:
- Service availability status
- Environment information
- Cloud service connectivity
- System uptime

### Real-time Updates
Server-Sent Events provide live updates for:
- Task status changes
- Queue statistics
- Worker lifecycle events
- System notifications

## 🐛 Troubleshooting

### Common Issues

1. **Environment Variables Missing**
   - Check Vercel dashboard environment variables
   - Ensure all required variables are set

2. **GitHub API Rate Limits**
   - Use a GitHub token with sufficient permissions
   - Monitor GitHub API usage

3. **Redis Connection Issues**
   - Verify Upstash Redis URL and token
   - Check Redis instance status

4. **Worker Creation Failures**
   - Verify Terragon API key and quotas
   - Check task command validation

### Debug Mode
Set `NODE_ENV=development` for detailed logging and error messages.

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

---

**Ready for Production** ✅

This serverless backend is production-ready with comprehensive security, monitoring, and cloud integrations.