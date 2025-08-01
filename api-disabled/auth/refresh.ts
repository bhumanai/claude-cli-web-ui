/**
 * Token refresh endpoint
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  cors, 
  sendSuccess, 
  sendError, 
  allowMethods, 
  asyncHandler,
  checkRateLimit,
  setRateLimitHeaders,
  extractToken
} from '../../src/utils/api';
import { AuthManager } from '../../src/lib/auth';

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow POST method
  if (!allowMethods(req, res, ['POST'])) return;

  // Check rate limit
  const rateLimit = checkRateLimit(req, undefined, 30); // 30 refresh attempts per minute
  setRateLimitHeaders(res, rateLimit.info);
  
  if (!rateLimit.allowed) {
    return sendError(res, 'Too many refresh attempts', 'RATE_LIMIT_EXCEEDED', 429);
  }

  // Extract refresh token
  const refreshToken = extractToken(req);
  
  if (!refreshToken) {
    return sendError(res, 'Refresh token required', 'TOKEN_REQUIRED', 401);
  }

  try {
    // Refresh access token
    const newAccessToken = AuthManager.refreshAccessToken(refreshToken);
    
    if (!newAccessToken) {
      return sendError(res, 'Invalid or expired refresh token', 'TOKEN_INVALID', 401);
    }

    console.log('Token refreshed successfully');
    
    sendSuccess(res, {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    sendError(res, 'Token refresh failed', 'REFRESH_ERROR', 500);
  }
}

export default asyncHandler(handler);