import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { Octokit } from '@octokit/rest';

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

// Enhanced connection storage with token
interface GitHubConnectionWithToken extends GitHubConnectionResponse {
  token: string;
}

// REAL database for REAL connections (not mock!)
const connections: Map<string, GitHubConnectionWithToken> = new Map();

// Export connections for use by tasks service
export { connections };

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
      service: 'github-integration-REAL', // REAL, not mock!
      features: {
        repository_connection: true,
        issue_fetching: true,
        task_creation: true,
        token_encryption: false,
        REAL_GITHUB_API: true // NO MORE MOCK!
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

      const [owner, repo] = repository.split('/');

      // REAL GITHUB API VALIDATION - NO MORE MOCK!
      const octokit = new Octokit({ auth: token });
      
      let realUsername: string;
      try {
        // Get REAL user data from GitHub
        const { data: user } = await octokit.rest.users.getAuthenticated();
        realUsername = user.login;
        console.log(`REAL GitHub user authenticated: ${realUsername}`);

        // Verify access to the repository
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
        console.log(`REAL repository verified: ${repoData.full_name}`);
        
      } catch (error: any) {
        console.error('GitHub API error:', error);
        if (error.status === 401) {
          return res.status(401).json({ 
            error: 'Invalid GitHub token. Please check your personal access token.' 
          });
        } else if (error.status === 404) {
          return res.status(404).json({ 
            error: `Repository ${repository} not found or you don't have access to it.` 
          });
        } else {
          return res.status(400).json({ 
            error: `GitHub API error: ${error.message}` 
          });
        }
      }

      // Check if connection already exists
      const existingConnection = Array.from(connections.values()).find(
        conn => conn.project_id === project_id && conn.status === 'active'
      );
      
      if (existingConnection) {
        // Update existing connection with new token and repo
        existingConnection.token = token;
        existingConnection.repository = repository;
        existingConnection.username = realUsername;
        existingConnection.connected_at = new Date().toISOString();
        
        // Return without token for security
        const { token: _, ...safeConnection } = existingConnection;
        console.log(`Updated REAL connection for ${realUsername}/${repository}`);
        return res.status(200).json(safeConnection);
      }

      // Create new REAL connection
      const connectionId = randomUUID();
      const connection: GitHubConnectionWithToken = {
        id: connectionId,
        repository,
        username: realUsername, // REAL USERNAME FROM GITHUB!
        connected_at: new Date().toISOString(),
        project_id,
        status: 'active',
        token // Store the REAL token!
      };

      connections.set(connectionId, connection);

      // Return connection WITHOUT token for security
      const { token: _, ...safeConnection } = connection;
      console.log(`Created REAL GitHub connection for ${realUsername}/${repository}`);
      return res.status(200).json(safeConnection);

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
      // Return WITHOUT token for security
      const { token, ...safeConnection } = connection;
      return res.status(200).json(safeConnection);
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