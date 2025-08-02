/**
 * API utility functions for Vercel serverless environment
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { ApiResponse, RateLimitInfo, User } from '../types';
import { AuthManager, RateLimiter, extractToken, getClientId } from '../lib/auth';
import jwt from 'jsonwebtoken';

/**
 * CORS middleware for API routes
 */
export function cors(req: VercelRequest, res: VercelResponse): boolean {
  // Define allowed origins
  const allowedOrigins = [
    'https://claudeui-6gykcm69k-bhuman.vercel.app',
    'https://claudeui-rouge.vercel.app',
    'https://claudeui-jwyp7qcq4-bhuman.vercel.app',
    'https://claudeui-fvw6ne2mm-bhuman.vercel.app',
    'https://claude-cli-frontend.vercel.app', 
    'https://bhumanai.github.io',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'https://localhost:5173'
  ];

  const origin = req.headers.origin;
  
  // Set CORS headers
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // Fallback to wildcard for development or unknown origins
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-GitHub-Repo-Owner, X-GitHub-Repo-Name, X-GitHub-Token');
  res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.setHeader('Vary', 'Origin'); // Important for caching

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false; // Don't continue processing
  }

  return true; // Continue processing
}

/**
 * Create standardized API response
 */
export function createApiResponse<T>(
  data: T | null = null,
  error: { message: string; code: string; details?: any } | null = null,
  meta?: any
): ApiResponse<T> {
  const response: ApiResponse<T> = {
    data,
    error
  };
  
  if (meta) {
    (response as any).meta = meta;
  }
  
  return response;
}

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: VercelResponse,
  data: T,
  status: number = 200,
  meta?: any
): void {
  const response = createApiResponse(data, null, meta);
  res.status(status).json(response);
}

/**
 * Send error response
 */
export function sendError(
  res: VercelResponse,
  message: string,
  code: string,
  status: number = 400,
  details?: any
): void {
  const response = createApiResponse(null, { message, code, details });
  res.status(status).json(response);
}

/**
 * Validate request body against Zod schema
 */
export function validateBody<T>(
  req: VercelRequest,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(req.body);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return { success: false, error: `Validation error: ${messages.join(', ')}` };
    }
    return { success: false, error: 'Invalid request body' };
  }
}

/**
 * Validate query parameters against Zod schema
 */
export function validateQuery<T>(
  req: VercelRequest,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(req.query);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return { success: false, error: `Query validation error: ${messages.join(', ')}` };
    }
    return { success: false, error: 'Invalid query parameters' };
  }
}

/**
 * Authentication middleware
 */
export function requireAuth(
  req: VercelRequest
): { success: true; user: User } | { success: false; error: string; status: number } {
  const token = extractToken(req);
  
  if (!token) {
    return {
      success: false,
      error: 'Authorization token required',
      status: 401,
    };
  }

  const user = AuthManager.getUserFromToken(token);
  
  if (!user) {
    return {
      success: false,
      error: 'Invalid or expired token',
      status: 401,
    };
  }

  if (!user.is_active) {
    return {
      success: false,
      error: 'User account is inactive',
      status: 403,
    };
  }

  return { success: true, user };
}

/**
 * Rate limiting middleware
 */
export function checkRateLimit(
  req: VercelRequest,
  user?: User,
  customLimit?: number
): { allowed: true; info: RateLimitInfo } | { allowed: false; info: RateLimitInfo } {
  const clientId = getClientId(req, user);
  const limit = customLimit || (user ? 120 : 60); // Authenticated users get higher limits
  
  const result = RateLimiter.checkRateLimit(clientId, limit);
  
  return {
    allowed: result.allowed,
    info: result.info,
  };
}

/**
 * Apply rate limit headers to response
 */
export function setRateLimitHeaders(res: VercelResponse, info: RateLimitInfo): void {
  res.setHeader('X-RateLimit-Limit', info.limit.toString());
  res.setHeader('X-RateLimit-Remaining', info.remaining.toString());
  res.setHeader('X-RateLimit-Reset', info.reset.toString());
  res.setHeader('X-RateLimit-Window', info.window?.toString() || '0');
}

/**
 * Permission check middleware
 */
export function requirePermission(
  user: User,
  requiredPermission: string
): { success: true } | { success: false; error: string; status: number } {
  if (!user.permissions?.includes(requiredPermission) && !user.permissions?.includes('admin')) {
    return {
      success: false,
      error: `Permission required: ${requiredPermission}`,
      status: 403,
    };
  }

  return { success: true };
}

/**
 * Async error handler wrapper
 */
export function asyncHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('API Error:', error);
      
      if (error instanceof Error) {
        sendError(res, error.message, 'INTERNAL_ERROR', 500);
      } else {
        sendError(res, 'Internal server error', 'INTERNAL_ERROR', 500);
      }
    }
  };
}

/**
 * Method validation middleware
 */
export function allowMethods(
  req: VercelRequest,
  res: VercelResponse,
  methods: string[]
): boolean {
  if (!methods.includes(req.method || 'GET')) {
    res.setHeader('Allow', methods.join(', '));
    sendError(res, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED', 405);
    return false;
  }
  return true;
}

/**
 * Pagination helper
 */
export function getPagination(req: VercelRequest): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): any {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    total_pages: totalPages,
  };
}

/**
 * Verify authentication from request
 */
export async function verifyAuth(req: VercelRequest): Promise<{
  isAuthenticated: boolean;
  user?: any;
}> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { isAuthenticated: false };
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      isAuthenticated: true,
      user: decoded
    };
  } catch (error) {
    return { isAuthenticated: false };
  }
}

/**
 * Input sanitization
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove dangerous characters and limit length
    return input
      .replace(/[<>\"'&]/g, '') // Remove HTML/script characters
      .substring(0, 10000); // Limit length
  }
  
  if (Array.isArray(input)) {
    return input.slice(0, 100).map(sanitizeInput); // Limit array size
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Limit object keys and sanitize values
      if (Object.keys(sanitized).length < 50) {
        sanitized[sanitizeInput(key)] = sanitizeInput(value);
      }
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Command validation for security
 */
export function validateCommand(command: string): {
  valid: boolean;
  error?: string;
  sanitized?: string;
} {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command is required and must be a string' };
  }

  if (command.length > 10000) {
    return { valid: false, error: 'Command is too long' };
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /rm\s+-rf/i,
    /sudo/i,
    /passwd/i,
    /su\s+/i,
    /chmod\s+777/i,
    /\/etc\/passwd/i,
    /\/etc\/shadow/i,
    /curl.*\|.*sh/i,
    /wget.*\|.*sh/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { 
        valid: false, 
        error: `Command contains potentially dangerous pattern: ${pattern.source}` 
      };
    }
  }

  // Sanitize the command
  const sanitized = command
    .replace(/[;&|`$(){}[\]]/g, '') // Remove shell metacharacters
    .trim();

  if (sanitized !== command) {
    return {
      valid: true,
      sanitized,
      error: 'Command was sanitized by removing shell metacharacters',
    };
  }

  return { valid: true, sanitized: command };
}