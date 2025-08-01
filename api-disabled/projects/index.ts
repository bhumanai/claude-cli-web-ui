/**
 * Projects endpoint - Create and list projects
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
  sanitizeInput
} from '../../src/utils/api';
import { Project } from '../../src/types';
import { RedisService } from '../../src/lib/redis';

const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  github_repo: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

const ProjectListSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  search: z.string().max(200).optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
});

let redisService: RedisService | null = null;

// Initialize Redis service
try {
  redisService = new RedisService();
} catch (error) {
  console.warn('Redis service initialization failed:', error);
}

// In-memory storage for projects (in production, use a database)
const projectsStore = new Map<string, Project>();

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
    return await createProject(req, res, auth.user);
  } else {
    return await listProjects(req, res, auth.user);
  }
}

async function createProject(req: VercelRequest, res: VercelResponse, user: any) {
  // Check write permission
  const permission = requirePermission(user, 'write');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  // Validate request body
  const validation = validateBody(req, ProjectCreateSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const projectData = validation.data;

  // Sanitize input data
  const sanitizedData = {
    ...projectData,
    metadata: projectData.metadata ? sanitizeInput(projectData.metadata) : undefined,
  };

  try {
    // Create project object
    const project: Project = {
      id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: sanitizedData.name,
      description: sanitizedData.description,
      github_repo: sanitizedData.github_repo,
      created_at: new Date(),
      updated_at: new Date(),
      status: 'active',
      metadata: sanitizedData.metadata,
    };

    // Store project
    projectsStore.set(project.id, project);

    // Cache in Redis if available
    if (redisService) {
      try {
        await redisService.cache(`project:${project.id}`, project, 3600); // Cache for 1 hour
      } catch (error) {
        console.warn('Failed to cache project in Redis:', error);
      }
    }

    console.log(`Created project ${project.id}: ${project.name}`);

    sendSuccess(res, project, 201);
  } catch (error) {
    console.error('Create project error:', error);
    sendError(res, 'Failed to create project', 'CREATE_PROJECT_ERROR', 500);
  }
}

async function listProjects(req: VercelRequest, res: VercelResponse, user: any) {
  // Check read permission
  const permission = requirePermission(user, 'read');
  if (!permission.success) {
    return sendError(res, permission.error, 'PERMISSION_DENIED', permission.status);
  }

  // Validate query parameters
  const validation = validateQuery(req, ProjectListSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const filters = validation.data;
  const { page, limit, offset } = getPagination(req);

  try {
    // Get all projects
    let projects = Array.from(projectsStore.values());

    // Apply filters
    if (filters.status) {
      projects = projects.filter(project => project.status === filters.status);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      projects = projects.filter(project => 
        project.name.toLowerCase().includes(searchLower) ||
        project.description?.toLowerCase().includes(searchLower) ||
        project.github_repo?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by updated_at descending
    projects.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());

    const total = projects.length;

    // Apply pagination
    const paginatedProjects = projects.slice(offset, offset + limit);

    // Enhance projects with task statistics if Redis is available
    if (redisService) {
      for (const project of paginatedProjects) {
        try {
          const queueStatus = await redisService.getQueueStatus(`project_${project.id}`);
          (project as any).task_stats = {
            pending: queueStatus.pending_tasks,
            running: queueStatus.running_tasks,
            completed: queueStatus.completed_tasks,
            failed: queueStatus.failed_tasks,
            total: queueStatus.pending_tasks + queueStatus.running_tasks + 
                   queueStatus.completed_tasks + queueStatus.failed_tasks,
          };
        } catch (error) {
          console.warn(`Failed to get task stats for project ${project.id}:`, error);
          (project as any).task_stats = {
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
            total: 0,
          };
        }
      }
    }

    // Create pagination metadata
    const paginationMeta = createPaginationMeta(page, limit, total);

    sendSuccess(res, paginatedProjects, 200, {
      pagination: paginationMeta,
    });
  } catch (error) {
    console.error('List projects error:', error);
    sendError(res, 'Failed to list projects', 'LIST_PROJECTS_ERROR', 500);
  }
}

// Initialize with sample projects
async function initializeSampleProjects() {
  if (projectsStore.size === 0) {
    const sampleProjects: Project[] = [
      {
        id: 'project_sample_1',
        name: 'Claude CLI Web UI',
        description: 'Web interface for Claude CLI with task management',
        github_repo: 'https://github.com/claude-cli/web-ui',
        created_at: new Date('2024-01-01'),
        updated_at: new Date(),
        status: 'active',
        metadata: {
          tech_stack: ['React', 'FastAPI', 'Redis'],
          team_size: 3,
        },
      },
      {
        id: 'project_sample_2',
        name: 'AI Agent Framework',
        description: 'Framework for building and deploying AI agents',
        github_repo: 'https://github.com/claude-cli/agents',
        created_at: new Date('2024-02-01'),
        updated_at: new Date(),
        status: 'active',
        metadata: {
          tech_stack: ['Python', 'TypeScript', 'Docker'],
          team_size: 5,
        },
      },
    ];

    for (const project of sampleProjects) {
      projectsStore.set(project.id, project);
    }

    console.log('Initialized sample projects');
  }
}

// Initialize sample data
initializeSampleProjects();

export default asyncHandler(handler);