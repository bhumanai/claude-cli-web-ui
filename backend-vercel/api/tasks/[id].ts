/**
 * Individual task endpoint - Get, update, and delete specific tasks
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
  sanitizeInput,
  validateCommand
} from '../../src/utils/api';
import { Task, TaskStatus, TaskPriority } from '../../src/types';
import { RedisService } from '../../src/lib/redis';
import { GitHubService } from '../../src/lib/github';

const TaskUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'timeout']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  scheduled_at: z.string().datetime().optional(),
  timeout: z.number().min(1).max(86400).optional(),
  max_retries: z.number().min(0).max(10).optional(),
  input_data: z.record(z.any()).optional(),
  output_data: z.record(z.any()).optional(),
  error_message: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.any()).optional(),
});

let redisService: RedisService | null = null;
let githubService: GitHubService | null = null;

// Initialize services
try {
  redisService = new RedisService();
  githubService = new GitHubService();
} catch (error) {
  console.warn('Service initialization failed:', error);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow GET, PUT, and DELETE methods
  if (!allowMethods(req, res, ['GET', 'PUT', 'DELETE'])) return;

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

  const taskId = req.query.id as string;
  if (!taskId) {
    return sendError(res, 'Task ID is required', 'TASK_ID_REQUIRED', 400);
  }

  if (req.method === 'GET') {
    return await getTask(req, res, auth.user, taskId);
  } else if (req.method === 'PUT') {
    return await updateTask(req, res, auth.user, taskId);
  } else if (req.method === 'DELETE') {
    return await deleteTask(req, res, auth.user, taskId);
  }
}

async function getTask(req: VercelRequest, res: VercelResponse, user: any, taskId: string) {
  // Check read permission
  const permission = requirePermission(user, 'read');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  try {
    let task: Task | null = null;

    // Try to get from Redis first
    if (redisService) {
      try {
        task = await redisService.getTask(taskId);
      } catch (error) {
        console.warn('Failed to get task from Redis:', error);
      }
    }

    // If not found in Redis, try GitHub Issues
    if (!task && githubService && taskId.startsWith('github_')) {
      try {
        const issueNumber = parseInt(taskId.replace('github_', ''));
        const issue = await githubService.getIssue(issueNumber);
        if (issue) {
          const taskData = githubService.parseTaskFromIssue(issue);
          if (taskData) {
            task = {
              ...taskData,
              id: taskId,
            } as Task;
          }
        }
      } catch (error) {
        console.warn('Failed to get task from GitHub:', error);
      }
    }

    if (!task) {
      return sendError(res, 'Task not found', 'TASK_NOT_FOUND', 404);
    }

    sendSuccess(res, task);
  } catch (error) {
    console.error('Get task error:', error);
    sendError(res, 'Failed to get task', 'GET_ERROR', 500);
  }
}

async function updateTask(req: VercelRequest, res: VercelResponse, user: any, taskId: string) {
  // Check write permission
  const permission = requirePermission(user, 'write');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  // Validate request body
  const validation = validateBody(req, TaskUpdateSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const updateData = validation.data;

  // Sanitize input data
  const sanitizedData = {
    ...updateData,
    input_data: updateData.input_data ? sanitizeInput(updateData.input_data) : undefined,
    output_data: updateData.output_data ? sanitizeInput(updateData.output_data) : undefined,
    metadata: updateData.metadata ? sanitizeInput(updateData.metadata) : undefined,
  };

  try {
    // Get existing task
    let task: Task | null = null;

    if (redisService) {
      try {
        task = await redisService.getTask(taskId);
      } catch (error) {
        console.warn('Failed to get task from Redis:', error);
      }
    }

    if (!task) {
      return sendError(res, 'Task not found', 'TASK_NOT_FOUND', 404);
    }

    // Update task properties, converting date strings to Date objects
    const updatedTask: Task = {
      ...task,
      ...sanitizedData,
      scheduled_at: sanitizedData.scheduled_at ? new Date(sanitizedData.scheduled_at) : task.scheduled_at,
      updated_at: new Date(),
    };

    // Update in Redis
    if (redisService) {
      try {
        await redisService.updateTask(updatedTask);
      } catch (error) {
        console.warn('Failed to update task in Redis:', error);
      }
    }

    // Update GitHub issue if available
    if (githubService && updatedTask.github_issue_number) {
      try {
        await githubService.updateTaskIssue(updatedTask.github_issue_number, updatedTask);
      } catch (error) {
        console.warn('Failed to update GitHub issue:', error);
      }
    }

    sendSuccess(res, updatedTask);
  } catch (error) {
    console.error('Update task error:', error);
    sendError(res, 'Failed to update task', 'UPDATE_ERROR', 500);
  }
}

async function deleteTask(req: VercelRequest, res: VercelResponse, user: any, taskId: string) {
  // Check write permission
  const permission = requirePermission(user, 'write');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  try {
    // Get existing task
    let task: Task | null = null;

    if (redisService) {
      try {
        task = await redisService.getTask(taskId);
      } catch (error) {
        console.warn('Failed to get task from Redis:', error);
      }
    }

    if (!task) {
      return sendError(res, 'Task not found', 'TASK_NOT_FOUND', 404);
    }

    // Close GitHub issue if available
    if (githubService && task.github_issue_number) {
      try {
        await githubService.closeIssue(task.github_issue_number, 'Task deleted by user');
      } catch (error) {
        console.warn('Failed to close GitHub issue:', error);
      }
    }

    // In Redis, we don't actually delete but mark as cancelled
    if (redisService) {
      try {
        const cancelledTask = {
          ...task,
          status: 'cancelled' as TaskStatus,
          updated_at: new Date(),
        };
        await redisService.updateTask(cancelledTask);
      } catch (error) {
        console.warn('Failed to cancel task in Redis:', error);
      }
    }

    sendSuccess(res, { message: 'Task deleted successfully', task_id: taskId });
  } catch (error) {
    console.error('Delete task error:', error);
    sendError(res, 'Failed to delete task', 'DELETE_ERROR', 500);
  }
}

export default asyncHandler(handler);