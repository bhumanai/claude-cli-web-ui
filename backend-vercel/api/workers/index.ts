/**
 * Workers endpoint - Create and list workers
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { 
  cors, 
  sendSuccess, 
  sendError, 
  allowMethods, 
  asyncHandler,
  requireAuth,
  requirePermission,
  validateBody,
  checkRateLimit,
  setRateLimitHeaders,
  getPagination,
  createPaginationMeta
} from '../../src/utils/api';
import { TerragoService } from '../../src/lib/terragon';
import { RedisService } from '../../src/lib/redis';

const WorkerCreateSchema = z.object({
  task_id: z.string().min(1).max(100),
});

let terragoService: TerragoService | null = null;
let redisService: RedisService | null = null;

// Initialize services
try {
  terragoService = new TerragoService();
  redisService = new RedisService();
} catch (error) {
  console.warn('Service initialization failed:', error);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow GET and POST methods
  if (!allowMethods(req, res, ['GET', 'POST'])) return;

  // Authenticate user
  const auth = requireAuth(req);
  if (!auth.success) {
    return sendError(res, auth.error, 'AUTHENTICATION_REQUIRED', auth.status);
  }

  // Check rate limit
  const rateLimit = checkRateLimit(req, auth.user);
  setRateLimitHeaders(res, rateLimit.info);
  
  if (!rateLimit.allowed) {
    return sendError(res, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
  }

  if (req.method === 'POST') {
    return await createWorker(req, res, auth.user);
  } else {
    return await listWorkers(req, res, auth.user);
  }
}

async function createWorker(req: VercelRequest, res: VercelResponse, user: any) {
  // Check write permission
  const permission = requirePermission(user, 'write');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  // Validate request body
  const validation = validateBody(req, WorkerCreateSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const { task_id } = validation.data;

  try {
    if (!terragoService) {
      return sendError(res, 'Worker service not available', 'SERVICE_UNAVAILABLE', 503);
    }

    if (!redisService) {
      return sendError(res, 'Queue service not available', 'SERVICE_UNAVAILABLE', 503);
    }

    // Get the task from Redis
    const task = await redisService.getTask(task_id);
    if (!task) {
      return sendError(res, 'Task not found', 'TASK_NOT_FOUND', 404);
    }

    // Check if task is already running or completed
    if (['running', 'completed', 'failed'].includes(task.status)) {
      return sendError(res, `Task is already ${task.status}`, 'TASK_INVALID_STATUS', 400);
    }

    // Estimate cost for the task
    const estimatedCost = await terragoService.estimateTaskCost(task);
    
    // Create worker with Terragon
    const worker = await terragoService.createWorker(task);
    
    // Update task with worker information
    task.worker_id = worker.id;
    task.status = 'running';
    task.started_at = new Date();
    await redisService.updateTask(task);

    // Send real-time update
    try {
      await redisService.publishSSE('tasks', {
        id: `task_update_${Date.now()}`,
        event: 'task_started',
        data: {
          task_id: task.id,
          worker_id: worker.id,
          status: 'running',
          estimated_cost: estimatedCost,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      console.warn('Failed to publish SSE message:', error);
    }

    sendSuccess(res, {
      worker,
      task: {
        id: task.id,
        status: task.status,
        worker_id: worker.id,
        started_at: task.started_at,
      },
      estimated_cost: estimatedCost,
    }, 201);
  } catch (error) {
    console.error('Create worker error:', error);
    sendError(res, 'Failed to create worker', 'CREATE_WORKER_ERROR', 500);
  }
}

async function listWorkers(req: VercelRequest, res: VercelResponse, user: any) {
  // Check read permission
  const permission = requirePermission(user, 'read');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  const { page, limit } = getPagination(req);

  try {
    if (!terragoService) {
      return sendError(res, 'Worker service not available', 'SERVICE_UNAVAILABLE', 503);
    }

    // Get all workers from Terragon
    const workers = await terragoService.listWorkers();
    
    // Apply pagination
    const total = workers.length;
    const offset = (page - 1) * limit;
    const paginatedWorkers = workers.slice(offset, offset + limit);

    // Enhance workers with task information if Redis is available
    if (redisService) {
      for (const worker of paginatedWorkers) {
        if (worker.task_id) {
          try {
            const task = await redisService.getTask(worker.task_id);
            if (task) {
              (worker as any).task = {
                id: task.id,
                name: task.name,
                status: task.status,
                priority: task.priority,
              };
            }
          } catch (error) {
            console.warn(`Failed to get task ${worker.task_id}:`, error);
          }
        }
      }
    }

    // Create pagination metadata
    const paginationMeta = createPaginationMeta(page, limit, total);

    sendSuccess(res, paginatedWorkers, 200, {
      pagination: paginationMeta,
    });
  } catch (error) {
    console.error('List workers error:', error);
    sendError(res, 'Failed to list workers', 'LIST_WORKERS_ERROR', 500);
  }
}

export default asyncHandler(handler);