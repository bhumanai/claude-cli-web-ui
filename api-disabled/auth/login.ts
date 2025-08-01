/**
 * User login endpoint
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { 
  cors, 
  sendSuccess, 
  sendError, 
  allowMethods, 
  asyncHandler, 
  validateBody,
  checkRateLimit,
  setRateLimitHeaders
} from '../../src/utils/api';
import { AuthManager, UserService } from '../../src/lib/auth';

const LoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow POST method
  if (!allowMethods(req, res, ['POST'])) return;

  // Check rate limit (stricter for login attempts)
  const rateLimit = checkRateLimit(req, undefined, 10); // 10 login attempts per minute
  setRateLimitHeaders(res, rateLimit.info);
  
  if (!rateLimit.allowed) {
    return sendError(res, 'Too many login attempts', 'RATE_LIMIT_EXCEEDED', 429);
  }

  // Validate request body
  const validation = validateBody(req, LoginSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const { username, password } = validation.data;

  try {
    // Authenticate user
    const user = await UserService.authenticateUser(username, password);
    
    if (!user) {
      return sendError(res, 'Invalid username or password', 'AUTHENTICATION_FAILED', 401);
    }

    // Generate tokens
    const tokens = AuthManager.generateTokens(user);
    
    console.log(`User ${username} logged in successfully`);
    
    sendSuccess(res, {
      ...tokens,
      user: {
        user_id: user.user_id,
        username: user.username,
        permissions: user.permissions,
        last_login: user.last_login?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    sendError(res, 'Authentication failed', 'AUTHENTICATION_ERROR', 500);
  }
}

export default asyncHandler(handler);