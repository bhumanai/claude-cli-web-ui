/**
 * Queue status endpoint - Get queue status and statistics
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  cors, 
  sendSuccess, 
  sendError, 
  allowMethods, 
  asyncHandler,
  requireAuth,
  requirePermission,
  checkRateLimit,
  setRateLimitHeaders
} from '../../../src/utils/api';
import { RedisService } from '../../../src/lib/redis';

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

  // Check read permission
  const permission = requirePermission(auth.user, 'read');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  // Check rate limit
  const rateLimit = checkRateLimit(req, auth.user);
  setRateLimitHeaders(res, rateLimit.info);
  
  if (!rateLimit.allowed) {
    return sendError(res, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
  }

  const queueId = req.query.id as string;
  if (!queueId) {
    return sendError(res, 'Queue ID is required', 'QUEUE_ID_REQUIRED', 400);
  }

  try {
    if (!redisService) {
      return sendError(res, 'Queue service not available', 'SERVICE_UNAVAILABLE', 503);
    }

    // Get queue status
    const queueStatus = await redisService.getQueueStatus(queueId);
    
    // Get recent tasks for more detailed status
    const recentTasks = await redisService.listQueueTasks(queueId, 'all');
    const recentTasksSample = recentTasks.slice(0, 10); // Last 10 tasks

    const detailedStatus = {
      ...queueStatus,
      recent_tasks: recentTasksSample.map(task => ({
        id: task.id,
        name: task.name,
        status: task.status,
        priority: task.priority,
        created_at: task.created_at,
        updated_at: task.updated_at,
      })),
      health: {
        is_healthy: (queueStatus.failed_tasks || queueStatus.failed) < (queueStatus.completed_tasks || queueStatus.completed) * 0.1, // Less than 10% failure rate
        total_processed: (queueStatus.completed_tasks || queueStatus.completed) + (queueStatus.failed_tasks || queueStatus.failed),
        success_rate: (queueStatus.completed_tasks || queueStatus.completed) > 0 
          ? ((queueStatus.completed_tasks || queueStatus.completed) / ((queueStatus.completed_tasks || queueStatus.completed) + (queueStatus.failed_tasks || queueStatus.failed))) * 100 
          : 100,
      },
    };

    sendSuccess(res, detailedStatus);
  } catch (error) {
    console.error('Get queue status error:', error);
    sendError(res, 'Failed to get queue status', 'QUEUE_STATUS_ERROR', 500);
  }
}

export default asyncHandler(handler);