import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';

interface GitHubConnectionRequest {
  token: string;
  repository: string;
  project_id: string;
}

interface GitHubConnectionResponse {
  id: string;
  repository: string;
  username: string;
  connected_at: string;
  project_id: string;
  status: string;
}

// Mock database for demo (in production, use a real database)
const connections: Map<string, GitHubConnectionResponse> = new Map();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url?.split('?')[0];
  const pathParts = path?.split('/').filter(Boolean) || [];
  
  console.log(`${req.method} ${path}`);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/github/health
  if (req.method === 'GET' && pathParts.length === 3 && pathParts[2] === 'health') {
    return res.status(200).json({
      status: 'healthy',
      service: 'github-integration',
      features: {
        repository_connection: true,
        issue_fetching: true,
        task_creation: true,
        token_encryption: false
      }
    });
  }

  // POST /api/github/connect
  if (req.method === 'POST' && pathParts.length === 3 && pathParts[2] === 'connect') {
    try {
      const { token, repository, project_id } = req.body as GitHubConnectionRequest;

      // Validate request
      if (!token || !repository || !project_id) {
        return res.status(400).json({ 
          error: 'Missing required fields: token, repository, project_id' 
        });
      }

      // Validate repository format
      if (!repository.includes('/')) {
        return res.status(400).json({ 
          error: 'Repository must be in format "owner/repo"' 
        });
      }

      // Check if connection already exists (simplified)
      const existingConnection = Array.from(connections.values()).find(
        conn => conn.project_id === project_id && conn.repository === repository
      );
      
      if (existingConnection) {
        return res.status(409).json({ 
          error: 'Repository already connected to this project' 
        });
      }

      // Create new connection (simplified - in production, validate token with GitHub API)
      const connectionId = randomUUID();
      const connection: GitHubConnectionResponse = {
        id: connectionId,
        repository,
        username: 'demo_user', // In production, get from GitHub API
        connected_at: new Date().toISOString(),
        project_id,
        status: 'active'
      };

      connections.set(connectionId, connection);

      console.log(`Successfully connected repository ${repository}`);
      return res.status(200).json(connection);

    } catch (error) {
      console.error('Error connecting repository:', error);
      return res.status(500).json({ 
        error: 'Internal server error connecting to GitHub' 
      });
    }
  }

  // GET /api/github/connections/{project_id}
  if (req.method === 'GET' && pathParts.length === 4 && pathParts[2] === 'connections') {
    const project_id = pathParts[3];
    
    // Find connection for this project
    const connection = Array.from(connections.values()).find(
      conn => conn.project_id === project_id && conn.status === 'active'
    );

    if (connection) {
      return res.status(200).json(connection);
    } else {
      return res.status(200).json(null);
    }
  }

  // DELETE /api/github/connections/{project_id}
  if (req.method === 'DELETE' && pathParts.length === 4 && pathParts[2] === 'connections') {
    const project_id = pathParts[3];
    
    // Find and deactivate connection
    let found = false;
    for (const [id, conn] of connections.entries()) {
      if (conn.project_id === project_id && conn.status === 'active') {
        conn.status = 'inactive';
        found = true;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ 
        error: 'No active GitHub connection found for this project' 
      });
    }

    return res.status(200).json({ 
      message: 'GitHub repository disconnected successfully' 
    });
  }

  return res.status(404).json({ error: 'Endpoint not found' });
}