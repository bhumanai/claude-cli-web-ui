/**
 * Get current user information endpoint
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  cors, 
  sendSuccess, 
  sendError, 
  allowMethods, 
  asyncHandler,
  requireAuth,
  checkRateLimit,
  setRateLimitHeaders
} from '../../src/utils/api';

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow GET method
  if (!allowMethods(req, res, ['GET'])) return;

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

  const user = auth.user;

  sendSuccess(res, {
    user_id: user.user_id,
    username: user.username,
    is_active: user.is_active,
    permissions: user.permissions,
    last_login: user.last_login?.toISOString(),
    created_at: user.created_at.toISOString(),
  });
}

export default asyncHandler(handler);