/**
 * Tasks endpoint - Create and list tasks
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
  validateQuery,
  checkRateLimit,
  setRateLimitHeaders,
  getPagination,
  createPaginationMeta,
  sanitizeInput,
  validateCommand
} from '../../src/utils/api';
import { Task, TaskCreateRequest, TaskPriority, TaskStatus } from '../../src/types';
import { RedisService } from '../../src/lib/redis';
import { GitHubService } from '../../src/lib/github';
import { GitHubServiceWithConnections } from '../../src/lib/github-with-connections';

const TaskCreateSchema = z.object({
  project_id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  command: z.string().min(1).max(10000),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  scheduled_at: z.string().datetime().optional(),
  timeout: z.number().min(1).max(86400).optional(), // Max 24 hours
  max_retries: z.number().min(0).max(10).optional(),
  input_data: z.record(z.any()).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.any()).optional(),
  parent_task_id: z.string().max(100).optional(),
});

const TaskListSchema = z.object({
  project_id: z.string().optional(),
  status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'timeout']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().max(200).optional(),
  parent_task_id: z.string().optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
});

let redisService: RedisService | null = null;
// Remove global githubService - we'll create per-project instances

// Initialize services
try {
  redisService = new RedisService();
} catch (error) {
  console.warn('Redis initialization failed:', error);
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
    return await createTask(req, res, auth.user);
  } else {
    return await listTasks(req, res, auth.user);
  }
}

async function createTask(req: VercelRequest, res: VercelResponse, user: any) {
  // Check write permission
  const permission = requirePermission(user, 'write');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  // Validate request body
  const validation = validateBody(req, TaskCreateSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const taskData = validation.data;

  // Validate and sanitize command
  const commandValidation = validateCommand(taskData.command);
  if (!commandValidation.valid) {
    return sendError(res, commandValidation.error!, 'INVALID_COMMAND', 400);
  }

  // Sanitize input data
  const sanitizedData = {
    ...taskData,
    command: commandValidation.sanitized!,
    input_data: taskData.input_data ? sanitizeInput(taskData.input_data) : undefined,
    metadata: taskData.metadata ? sanitizeInput(taskData.metadata) : undefined,
  };

  try {
    // Create task object
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      project_id: sanitizedData.project_id,
      name: sanitizedData.name,
      command: sanitizedData.command,
      description: sanitizedData.description,
      status: 'pending' as TaskStatus,
      priority: sanitizedData.priority as TaskPriority,
      created_at: new Date(),
      updated_at: new Date(),
      scheduled_at: sanitizedData.scheduled_at ? new Date(sanitizedData.scheduled_at) : undefined,
      timeout: sanitizedData.timeout,
      max_retries: sanitizedData.max_retries || 0,
      retry_count: 0,
      input_data: sanitizedData.input_data,
      tags: sanitizedData.tags,
      metadata: sanitizedData.metadata,
      parent_task_id: sanitizedData.parent_task_id,
    };

    // Create GitHub issue for task persistence using project-specific connection
    try {
      const projectGitHubService = new GitHubServiceWithConnections(sanitizedData.project_id);
      const issueNumber = await projectGitHubService.createTaskIssue(task);
      task.github_issue_number = issueNumber;
      console.log(`Created GitHub issue #${issueNumber} for task ${task.id} in project ${sanitizedData.project_id}`);
    } catch (error) {
      console.warn(`Failed to create GitHub issue for project ${sanitizedData.project_id}:`, error);
      // Don't continue without GitHub issue - inform the user
      return sendError(res, 'Failed to create task in GitHub. Please check your GitHub connection.', 'GITHUB_ERROR', 500);
    }

    // Add to Redis queue
    if (redisService) {
      try {
        const queueId = `project_${sanitizedData.project_id}`;
        await redisService.enqueueTask(queueId, task);
        task.status = 'queued';
        console.log(`Task ${task.id} added to queue ${queueId}`);
      } catch (error) {
        console.warn('Failed to enqueue task:', error);
        // Continue without queueing
      }
    }

    sendSuccess(res, task, 201);
  } catch (error) {
    console.error('Create task error:', error);
    sendError(res, 'Failed to create task', 'CREATE_ERROR', 500);
  }
}

async function listTasks(req: VercelRequest, res: VercelResponse, user: any) {
  // Check read permission
  const permission = requirePermission(user, 'read');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  // Validate query parameters
  const validation = validateQuery(req, TaskListSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const filters = validation.data;
  const { page, limit, offset } = getPagination(req);

  try {
    let tasks: Task[] = [];
    let total = 0;

    // Get tasks from GitHub Issues if project_id is specified
    if (filters.project_id) {
      try {
        const projectGitHubService = new GitHubServiceWithConnections(filters.project_id);
        const result = await projectGitHubService.listTaskIssues({
          state: filters.status ? (filters.status === 'completed' ? 'closed' : 'open') : 'all',
          labels: filters.tags,
          per_page: limit,
          page,
        });

        // Parse GitHub issues to tasks
        for (const issue of result.issues) {
          const taskData = projectGitHubService.parseTaskFromIssue(issue);
          if (taskData) {
            tasks.push({
              ...taskData,
              id: `github_${issue.number}`,
            } as Task);
          }
        }

        total = result.total_count;
      } catch (error) {
        console.warn(`Failed to fetch from GitHub for project ${filters.project_id}:`, error);
      }
    }

    // Get tasks from Redis if available and no GitHub data
    if (redisService && tasks.length === 0 && filters.project_id) {
      try {
        const queueId = `project_${filters.project_id}`;
        const redisTasks = await redisService.listQueueTasks(queueId, filters.status || 'all');
        
        // Apply filters
        tasks = redisTasks.filter(task => {
          if (filters.priority && task.priority !== filters.priority) return false;
          if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            if (!task.name.toLowerCase().includes(searchLower) &&
                !task.description?.toLowerCase().includes(searchLower) &&
                !task.command.toLowerCase().includes(searchLower)) {
              return false;
            }
          }
          if (filters.parent_task_id && task.parent_task_id !== filters.parent_task_id) return false;
          return true;
        });

        total = tasks.length;
        tasks = tasks.slice(offset, offset + limit);
      } catch (error) {
        console.warn('Failed to fetch from Redis:', error);
      }
    }

    // Create pagination metadata
    const paginationMeta = createPaginationMeta(page, limit, total);

    sendSuccess(res, tasks, 200, {
      pagination: paginationMeta,
    });
  } catch (error) {
    console.error('List tasks error:', error);
    sendError(res, 'Failed to list tasks', 'LIST_ERROR', 500);
  }
}

export default asyncHandler(handler);