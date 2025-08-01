/**
 * Health check endpoint
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { cors, sendSuccess, allowMethods, asyncHandler } from '../src/utils/api';

interface HealthCheck {
  status: string;
  version: string;
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    redis: boolean;
    github: boolean;
    terragon: boolean;
  };
}

const startTime = Date.now();

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow GET method
  if (!allowMethods(req, res, ['GET'])) return;

  // Calculate uptime
  const uptime = (Date.now() - startTime) / 1000;

  // Check service availability
  const services = {
    redis: !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN,
    github: !!process.env.GITHUB_TOKEN,
    terragon: !!process.env.TERRAGON_API_KEY,
  };

  const healthCheck: HealthCheck = {
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime,
    environment: process.env.NODE_ENV || 'development',
    services,
  };

  sendSuccess(res, healthCheck);
}

export default asyncHandler(handler);