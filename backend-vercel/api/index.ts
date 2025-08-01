import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    message: 'Claude CLI Backend API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      auth: {
        login: 'POST /api/auth',
        me: 'GET /api/auth',
        refresh: 'POST /api/auth/refresh'
      },
      github: {
        health: 'GET /api/github/health',
        connect: 'POST /api/github/connect',
        connections: 'GET/DELETE /api/github/connections/{project_id}'
      },
      projects: 'GET/POST /api/projects',
      tasks: 'GET/POST /api/tasks',
      workers: 'GET/POST /api/workers'
    }
  });
}