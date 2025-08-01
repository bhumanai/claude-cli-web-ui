# Frontend Deployment Guide

## Overview

This enhanced React TypeScript frontend provides a comprehensive UI for the Claude CLI Web application with:

- **Serverless Architecture**: Designed for Vercel deployment
- **Real-time Communication**: Server-Sent Events (SSE) instead of WebSocket
- **JWT Authentication**: Secure token-based authentication
- **Queue Management**: Drag & drop task queue interface
- **Agent Monitoring**: Real-time Terragon worker monitoring
- **GitHub Integration**: Issues and task synchronization

## Prerequisites

- Node.js 18+ installed
- Vercel CLI installed (`npm i -g vercel`)
- Backend deployed and accessible

## Environment Configuration

### 1. Environment Variables

Create `.env.local` for development:

```bash
# Backend API URL
VITE_API_URL=http://localhost:3000  # Development
# VITE_API_URL=https://your-backend.vercel.app  # Production

# Optional: Debug settings
VITE_DEBUG=false
VITE_DEV_MODE=false
```

### 2. Production Environment

For production deployment, configure these environment variables in Vercel:

- `VITE_API_URL`: Your backend Vercel app URL

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 3. Type Checking

```bash
npm run type-check
```

### 4. Testing

```bash
npm run test
npm run test:coverage
```

## Deployment to Vercel

### 1. First-time Setup

```bash
# Login to Vercel
vercel login

# Link project (run from frontend directory)
vercel

# Follow prompts to link to existing project or create new one
```

### 2. Deploy Preview

```bash
npm run deploy:preview
```

### 3. Deploy to Production

```bash
npm run deploy
```

### 4. Configure Environment Variables

In the Vercel dashboard:

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add:
   - `VITE_API_URL`: Your backend URL

## Architecture Changes

### 1. Authentication System

- **JWT-based authentication** with refresh tokens
- **Persistent login state** with localStorage
- **Automatic token refresh** before expiry
- **Secure logout** with token cleanup

### 2. Real-time Communication

- **Server-Sent Events (SSE)** instead of WebSocket
- **Automatic reconnection** with exponential backoff
- **Event-driven updates** for tasks, workers, and commands
- **Better error handling** and connection status

### 3. Enhanced UI Components

#### Queue Dashboard
- Drag & drop task reordering
- Real-time queue status
- Advanced filtering and search
- Priority-based task management

#### Agent Monitor
- Real-time worker metrics
- Resource usage visualization
- Worker lifecycle controls
- Cost tracking and analytics

#### GitHub Integration
- OAuth-based repository connection
- Issue to task conversion
- Bidirectional synchronization
- Audit trail via Issues

## API Integration

### 1. Updated Task Service

The `TaskService` now supports:
- JWT authentication headers
- New Vercel backend endpoints
- Enhanced error handling
- Response transformation

### 2. SSE Service

New `SSEService` provides:
- Event-typed subscriptions
- Connection health monitoring
- Automatic reconnection
- Performance metrics

### 3. Authentication Service

New `AuthService` handles:
- Login/logout flows
- Token management
- Session persistence
- React hooks integration

## Performance Optimizations

### 1. Build Optimizations

- **Tree shaking** for minimal bundle size
- **Code splitting** for faster initial load
- **Asset optimization** with Vite
- **TypeScript compilation** with strict mode

### 2. Runtime Optimizations

- **React.memo** for component optimization
- **useCallback/useMemo** for expensive operations
- **Lazy loading** for large components
- **Efficient re-renders** with proper dependencies

## Security Features

### 1. Authentication

- **JWT token validation** on every request
- **Automatic token refresh** before expiry
- **Secure token storage** with HttpOnly considerations
- **CSRF protection** with proper headers

### 2. Input Validation

- **Client-side validation** for user inputs
- **Sanitization** of dynamic content
- **XSS prevention** with React's built-in protection
- **Command injection** prevention

## Monitoring and Debugging

### 1. Error Reporting

- **Comprehensive error boundaries** at multiple levels
- **Context preservation** for debugging
- **User-friendly error messages**
- **Automatic error recovery** where possible

### 2. Performance Monitoring

- **SSE connection metrics** and health checks
- **Component render tracking**
- **Memory usage monitoring**
- **API response time tracking**

## Troubleshooting

### 1. Common Issues

**Authentication Errors**:
- Check `VITE_API_URL` configuration
- Verify backend is accessible
- Check browser network tab for 401/403 errors

**SSE Connection Issues**:
- Verify backend SSE endpoint is working
- Check browser EventSource support
- Monitor connection status in dev tools

**Build Failures**:
- Run `npm run type-check` to identify TypeScript errors
- Check for missing dependencies
- Verify Node.js version compatibility

### 2. Development Tools

**Browser DevTools**:
- Network tab for API debugging
- Application tab for localStorage inspection
- Console for SSE message monitoring

**Vercel Logs**:
- Function logs for runtime errors
- Build logs for deployment issues
- Analytics for performance monitoring

## Migration from WebSocket

### 1. Code Changes

- Replace `useWebSocket` with `useSSE`
- Update event handling patterns
- Modify connection management logic

### 2. Backend Compatibility

- Ensure backend supports SSE endpoints
- Verify authentication header handling
- Test event streaming functionality

## Future Enhancements

### 1. Progressive Web App (PWA)

- Service worker for offline capability
- Push notifications for task updates
- App-like installation experience

### 2. Advanced Features

- Real-time collaboration
- Voice command integration
- Advanced analytics dashboard
- Multi-workspace support

## Support

For deployment issues:
1. Check Vercel deployment logs
2. Verify environment variable configuration
3. Test backend connectivity
4. Review browser console for client-side errors

For development issues:
1. Run type checking and tests
2. Check dependency versions
3. Verify API endpoint availability
4. Review SSE connection status