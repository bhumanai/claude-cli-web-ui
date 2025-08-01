/**
 * Simple Projects endpoint - Create and list projects
 * Simplified version without complex dependencies
 */

import { VercelRequest, VercelResponse } from '@vercel/node';

interface Project {
  id: string;
  name: string;
  description?: string;
  github_repo?: string;
  created_at: Date;
  updated_at: Date;
  status: 'active' | 'archived';
  metadata?: Record<string, any>;
}

// In-memory storage for projects (in production, use a database)
const projectsStore = new Map<string, Project>();

// CORS helper
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log(`${req.method} /api/projects - Headers:`, req.headers);
    console.log(`Request body:`, req.body);
    
    // Handle CORS
    setCorsHeaders(res);
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Only allow GET and POST methods
    if (!['GET', 'POST'].includes(req.method || '')) {
      console.log('Method not allowed:', req.method);
      return res.status(405).json({ 
        data: null, 
        error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } 
      });
    }

    if (req.method === 'POST') {
      return await createProject(req, res);
    } else {
      return await listProjects(req, res);
    }
  } catch (error) {
    console.error('API Handler Error:', error);
    return res.status(500).json({ 
      data: null, 
      error: { message: `Internal server error: ${error instanceof Error ? error.message : String(error)}`, code: 'INTERNAL_ERROR' } 
    });
  }
}

async function createProject(req: VercelRequest, res: VercelResponse) {
  try {
    console.log('Create project request body:', req.body);
    
    // Handle both form data and JSON body
    const body = req.body || {};
    const { name, description, path, github_repo, metadata } = body;
    
    // Use 'name' field or fall back to other fields
    const projectName = name || path || 'Unnamed Project';
    
    if (!projectName || typeof projectName !== 'string' || projectName.trim().length === 0) {
      console.error('Invalid project name:', projectName);
      return res.status(400).json({ 
        data: null, 
        error: { message: 'Project name is required', code: 'VALIDATION_ERROR' } 
      });
    }

    // Create project object
    const project: Project = {
      id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: projectName.trim(),
      description: description?.trim() || `GitHub repository: ${projectName}`,
      github_repo: github_repo?.trim() || `${path}/${projectName}`,
      created_at: new Date(),
      updated_at: new Date(),
      status: 'active',
      metadata: metadata || {},
    };

    // Store project
    projectsStore.set(project.id, project);

    console.log(`Created project ${project.id}: ${project.name}`);

    return res.status(201).json({ data: project, error: null });
  } catch (error) {
    console.error('Create project error:', error);
    return res.status(500).json({ 
      data: null, 
      error: { message: `Failed to create project: ${error.message}`, code: 'CREATE_PROJECT_ERROR' } 
    });
  }
}

async function listProjects(req: VercelRequest, res: VercelResponse) {
  try {
    // Initialize sample projects if store is empty
    if (projectsStore.size === 0) {
      const sampleProjects: Project[] = [
        {
          id: 'gesture-generator',
          name: 'Gesture Generator',
          description: 'AI-powered gesture generation system',
          github_repo: 'bhuman/gesture-generator',
          created_at: new Date('2024-01-01'),
          updated_at: new Date(),
          status: 'active',
          metadata: {
            tech_stack: ['Python', 'AI/ML', 'FastAPI'],
            team_size: 2,
          },
        },
        {
          id: 'claude-cli-web-ui',
          name: 'Claude CLI Web UI',
          description: 'Web interface for Claude CLI with task management',
          github_repo: 'bhuman/claude-cli-web-ui',
          created_at: new Date('2024-02-01'),
          updated_at: new Date(),
          status: 'active',
          metadata: {
            tech_stack: ['React', 'TypeScript', 'Vercel'],
            team_size: 1,
          },
        },
      ];

      for (const project of sampleProjects) {
        projectsStore.set(project.id, project);
      }

      console.log('Initialized sample projects');
    }

    // Get all projects
    const projects = Array.from(projectsStore.values());

    // Sort by updated_at descending
    projects.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());

    return res.status(200).json({ 
      data: projects, 
      error: null,
      pagination: {
        page: 1,
        limit: 50,
        total: projects.length,
        pages: 1
      }
    });
  } catch (error) {
    console.error('List projects error:', error);
    return res.status(500).json({ 
      data: null, 
      error: { message: 'Failed to list projects', code: 'LIST_PROJECTS_ERROR' } 
    });
  }
}