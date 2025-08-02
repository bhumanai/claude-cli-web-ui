/**
 * Debug endpoint to check environment variables (safely)
 */

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow in development or with secret key
  const debugKey = req.query.debug_key as string;
  if (debugKey !== 'debug-env-check-2025') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const envCheck = {
      hasGitHubToken: !!process.env.GITHUB_TOKEN,
      hasGitHubRepoOwner: !!process.env.GITHUB_REPO_OWNER,
      hasGitHubRepoName: !!process.env.GITHUB_REPO_NAME,
      tokenLength: process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.length : 0,
      tokenPrefix: process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.substring(0, 8) + '...' : 'none',
      repoOwner: process.env.GITHUB_REPO_OWNER || 'not set',
      repoName: process.env.GITHUB_REPO_NAME || 'not set',
      nodeEnv: process.env.NODE_ENV || 'not set',
      vercelEnv: process.env.VERCEL_ENV || 'not set'
    };

    return res.status(200).json(envCheck);
  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to check environment',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}