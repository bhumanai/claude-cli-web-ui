/**
 * Tasks endpoint for specific project - Create and list tasks
 * Simplified version without complex dependencies
 */

import { VercelRequest, VercelResponse } from '@vercel/node';

interface Task {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  command?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'queued' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

// In-memory storage for tasks (in production, use a database)
const tasksStore = new Map<string, Task>();

// CORS helper
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET and POST methods
  if (!['GET', 'POST'].includes(req.method || '')) {
    return res.status(405).json({ 
      data: null, 
      error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } 
    });
  }

  const { project_id } = req.query;
  
  if (!project_id || typeof project_id !== 'string') {
    return res.status(400).json({ 
      data: null, 
      error: { message: 'Project ID is required', code: 'VALIDATION_ERROR' } 
    });
  }

  try {
    if (req.method === 'POST') {
      return await createTask(req, res, project_id);
    } else {
      return await listTasks(req, res, project_id);
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    });
  }
}

async function createTask(req: VercelRequest, res: VercelResponse, project_id: string) {
  const { name, description, command, priority = 'medium' } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ 
      data: null, 
      error: { message: 'Task name is required', code: 'VALIDATION_ERROR' } 
    });
  }

  try {
    // Create task object
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      project_id,
      name: name.trim(),
      description: description?.trim(),
      command: command?.trim() || `/plan ${name.trim()}`,
      status: 'pending',
      priority: priority || 'medium',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    };

    // Store task
    tasksStore.set(task.id, task);

    console.log(`Created task ${task.id}: ${task.name} for project ${project_id}`);

    return res.status(201).json({ data: task, error: null });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ 
      data: null, 
      error: { message: 'Failed to create task', code: 'CREATE_TASK_ERROR' } 
    });
  }
}

async function listTasks(req: VercelRequest, res: VercelResponse, project_id: string) {
  try {
    // Get all tasks for this project
    const allTasks = Array.from(tasksStore.values());
    const projectTasks = allTasks.filter(task => task.project_id === project_id);

    // Sort by created_at descending
    projectTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.status(200).json({ 
      data: projectTasks, 
      error: null,
      pagination: {
        page: 1,
        limit: 50,
        total: projectTasks.length,
        pages: 1
      }
    });
  } catch (error) {
    console.error('List tasks error:', error);
    return res.status(500).json({ 
      data: null, 
      error: { message: 'Failed to list tasks', code: 'LIST_TASKS_ERROR' } 
    });
  }
}