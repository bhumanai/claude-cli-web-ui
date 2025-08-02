import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { Octokit } from '@octokit/rest';
import { connections } from '../github';

interface GitHubConnectionRequest {
  token: string;
  repository: string;
  project_id: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // REAL GITHUB API VALIDATION
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
    const connection = {
      id: connectionId,
      repository,
      username: realUsername,
      connected_at: new Date().toISOString(),
      project_id,
      status: 'active' as const,
      token
    };

    connections.set(connectionId, connection);

    // Try to create webhook for real-time updates
    try {
      const webhookUrl = `${process.env.VERCEL_URL || 'https://backend-vercel-rcd0ssuv3-bhuman.vercel.app'}/api/github/webhook`;
      
      const { data: webhook } = await octokit.rest.repos.createWebhook({
        owner,
        repo,
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: process.env.GITHUB_WEBHOOK_SECRET || undefined
        },
        events: ['issues', 'issue_comment']
      });
      
      console.log(`Created GitHub webhook for ${owner}/${repo}: ${webhook.id}`);
      connection.webhook_id = webhook.id;
    } catch (webhookError: any) {
      // Webhook creation is optional - don't fail the connection
      console.warn('Failed to create webhook (optional):', webhookError.message);
    }

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