/**
 * Server-Sent Events endpoint for real-time updates
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  cors, 
  sendError, 
  allowMethods, 
  asyncHandler,
  requireAuth,
  checkRateLimit,
  setRateLimitHeaders,
} from '../../src/utils/api';
import { RedisService } from '../../src/lib/redis';
import { SSEMessage } from '../../src/types';

let redisService: RedisService | null = null;

// Initialize Redis service
try {
  redisService = new RedisService();
} catch (error) {
  console.warn('Redis service initialization failed:', error);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow GET method
  if (!allowMethods(req, res, ['GET'])) return;

  // Authenticate user
  const auth = requireAuth(req);
  if (!auth.success) {
    return sendError(res, auth.error, 'AUTHENTICATION_REQUIRED', auth.status);
  }

  // Check rate limit (more lenient for SSE connections)
  const rateLimit = checkRateLimit(req, auth.user, 300); // 300 requests per minute
  setRateLimitHeaders(res, rateLimit.info);
  
  if (!rateLimit.allowed) {
    return sendError(res, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
  }

  const channel = req.query.channel as string;
  if (!channel) {
    return sendError(res, 'Channel is required', 'CHANNEL_REQUIRED', 400);
  }

  // Validate channel format (prevent access to unauthorized channels)
  const allowedChannels = [
    'tasks',
    'queues',
    'workers',
    `user:${auth.user.user_id}`,
    `project:${req.query.project_id}`,
  ].filter(Boolean);

  if (!allowedChannels.some(allowed => channel.startsWith(allowed))) {
    return sendError(res, 'Access to channel not allowed', 'CHANNEL_FORBIDDEN', 403);
  }

  try {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    // Send initial connection message
    const connectionMessage = {
      id: `connect_${Date.now()}`,
      event: 'connected',
      data: {
        channel,
        user_id: auth.user.user_id,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date(),
    };

    sendSSEMessage(res, connectionMessage);

    if (!redisService) {
      // Send error message and close connection
      const errorMessage = {
        id: `error_${Date.now()}`,
        event: 'error',
        data: {
          message: 'Real-time service not available',
          code: 'SERVICE_UNAVAILABLE',
        },
        timestamp: new Date(),
      };
      sendSSEMessage(res, errorMessage);
      res.end();
      return;
    }

    // Get since parameter for catching up on missed messages
    const since = req.query.since 
      ? new Date(req.query.since as string) 
      : new Date(Date.now() - 5 * 60 * 1000); // Last 5 minutes

    // Send recent messages
    try {
      const recentMessages = await redisService.getSSEMessages(channel, since);
      for (const message of recentMessages) {
        sendSSEMessage(res, message);
      }
    } catch (error) {
      console.warn('Failed to get recent messages:', error);
    }

    // Set up polling for new messages (in a real implementation, you'd use Redis pub/sub)
    const pollInterval = setInterval(async () => {
      try {
        if (res.writableEnded) {
          clearInterval(pollInterval);
          return;
        }

        // Get new messages since last poll
        const lastPoll = new Date(Date.now() - 10000); // Last 10 seconds
        const newMessages = await redisService!.getSSEMessages(channel, lastPoll);
        
        for (const message of newMessages) {
          sendSSEMessage(res, message);
        }

        // Send heartbeat every 30 seconds
        if (Date.now() % 30000 < 10000) {
          const heartbeat = {
            id: `heartbeat_${Date.now()}`,
            event: 'heartbeat',
            data: {
              timestamp: new Date().toISOString(),
              channel,
            },
            timestamp: new Date(),
          };
          sendSSEMessage(res, heartbeat);
        }
      } catch (error) {
        console.error('SSE polling error:', error);
        // Don't send error message during polling to avoid breaking the connection
      }
    }, 10000); // Poll every 10 seconds

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
      console.log(`SSE connection closed for channel ${channel}`);
    });

    req.on('error', (error) => {
      clearInterval(pollInterval);
      console.error('SSE connection error:', error);
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAlive);
        return;
      }
      res.write(': keep-alive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });

  } catch (error) {
    console.error('SSE setup error:', error);
    sendError(res, 'Failed to establish event stream', 'SSE_ERROR', 500);
  }
}

/**
 * Send SSE message to client
 */
function sendSSEMessage(res: VercelResponse, message: SSEMessage): void {
  try {
    const data = JSON.stringify(message.data);
    res.write(`id: ${message.id}\n`);
    res.write(`event: ${message.event}\n`);
    res.write(`data: ${data}\n\n`);
  } catch (error) {
    console.error('Failed to send SSE message:', error);
  }
}

export default asyncHandler(handler);