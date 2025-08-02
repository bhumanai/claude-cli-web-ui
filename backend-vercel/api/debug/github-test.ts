/**
 * GitHub API test endpoint to validate token and permissions
 */

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const token = process.env.GITHUB_TOKEN;
    
    if (!token) {
      return res.status(500).json({
        error: 'GITHUB_TOKEN not set in environment variables',
        hasToken: false
      });
    }

    // Test GitHub API access
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-CLI-WebUI'
      }
    });

    const userData = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: 'GitHub API authentication failed',
        status: response.status,
        message: userData.message,
        tokenPrefix: token.substring(0, 8) + '...',
        tokenLength: token.length
      });
    }

    // Test repository access
    const repoResponse = await fetch('https://api.github.com/repos/bhuman-ai/gesture_generator', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-CLI-WebUI'
      }
    });

    const repoData = await repoResponse.json();

    return res.status(200).json({
      success: true,
      tokenValid: true,
      tokenPrefix: token.substring(0, 8) + '...',
      tokenLength: token.length,
      user: {
        login: userData.login,
        name: userData.name,
        id: userData.id
      },
      repository: {
        accessible: repoResponse.ok,
        status: repoResponse.status,
        name: repoData.name,
        permissions: repoData.permissions
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: 'GitHub test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}