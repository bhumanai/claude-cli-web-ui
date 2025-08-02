/**
 * Authentication utilities for serverless environment
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { VercelRequest } from '@vercel/node';
import { User, AuthTokens, RateLimitInfo } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// Rate limiting storage (in production, use Redis)
const rateLimitStore = new Map<string, { requests: number[]; }>();

export class AuthManager {
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT tokens for user
   */
  static generateTokens(user: User): AuthTokens {
    const payload = {
      user_id: user.user_id,
      username: user.username,
      permissions: user.permissions,
    };

    const access_token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      issuer: 'claude-cli-api',
      audience: 'claude-cli-web',
    });

    const refresh_token = jwt.sign(
      { user_id: user.user_id, type: 'refresh' },
      JWT_SECRET,
      {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        issuer: 'claude-cli-api',
        audience: 'claude-cli-web',
      }
    );

    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour in seconds
    };
  }

  /**
   * Verify and decode JWT token
   */
  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET, {
        issuer: 'claude-cli-api',
        audience: 'claude-cli-web',
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract user from JWT token
   */
  static getUserFromToken(token: string): User | null {
    const decoded = this.verifyToken(token);
    if (!decoded || decoded.type === 'refresh') {
      return null;
    }

    return {
      id: decoded.user_id,
      user_id: decoded.user_id,
      username: decoded.username,
      is_active: true,
      permissions: decoded.permissions || [],
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Refresh access token using refresh token
   */
  static refreshAccessToken(refreshToken: string): string | null {
    const decoded = this.verifyToken(refreshToken);
    if (!decoded || decoded.type !== 'refresh') {
      return null;
    }

    // In production, validate user still exists and is active
    const newPayload = {
      user_id: decoded.user_id,
      username: decoded.username, // Would fetch from database
      permissions: [], // Would fetch from database
    };

    return jwt.sign(newPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      issuer: 'claude-cli-api',
      audience: 'claude-cli-web',
    });
  }
}

/**
 * Rate limiting middleware
 */
export class RateLimiter {
  private static readonly DEFAULT_WINDOW = 60 * 1000; // 1 minute
  private static readonly DEFAULT_LIMIT = 60; // 60 requests per minute

  /**
   * Check if request is within rate limit
   */
  static checkRateLimit(
    clientId: string,
    limit: number = this.DEFAULT_LIMIT,
    windowMs: number = this.DEFAULT_WINDOW
  ): { allowed: boolean; info: RateLimitInfo } {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create client record
    if (!rateLimitStore.has(clientId)) {
      rateLimitStore.set(clientId, { requests: [] });
    }

    const clientData = rateLimitStore.get(clientId)!;

    // Remove old requests outside the window
    clientData.requests = clientData.requests.filter(time => time > windowStart);

    // Check if limit exceeded
    const allowed = clientData.requests.length < limit;

    if (allowed) {
      clientData.requests.push(now);
    }

    const remaining = Math.max(0, limit - clientData.requests.length);
    const resetTime = Math.max(...clientData.requests, windowStart) + windowMs;

    return {
      allowed,
      info: {
        limit,
        remaining,
        reset: Math.floor(resetTime / 1000),
        window: Math.floor(windowMs / 1000),
      },
    };
  }
}

/**
 * Extract authorization token from request
 */
export function extractToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Get client ID for rate limiting (IP or user ID)
 */
export function getClientId(req: VercelRequest, user?: User): string {
  if (user) {
    return `user:${user.user_id}`;
  }
  
  // Try to get real IP from headers (Vercel provides these)
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  
  if (typeof forwarded === 'string') {
    return `ip:${forwarded.split(',')[0].trim()}`;
  }
  
  if (typeof realIp === 'string') {
    return `ip:${realIp}`;
  }
  
  return `ip:unknown`;
}

/**
 * Mock user database (in production, use real database)
 */
export class UserService {
  private static users: Map<string, User & { password_hash: string }> = new Map();

  static async createUser(username: string, password: string, permissions: string[] = []): Promise<User> {
    const password_hash = await AuthManager.hashPassword(password);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user: User & { password_hash: string } = {
      id: userId,
      user_id: userId,
      username,
      password_hash,
      is_active: true,
      permissions,
      created_at: new Date().toISOString(),
    };

    this.users.set(username, user);
    
    // Return user without password hash
    const { password_hash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static async authenticateUser(username: string, password: string): Promise<User | null> {
    const user = this.users.get(username);
    if (!user || !user.is_active) {
      return null;
    }

    const isValid = await AuthManager.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return null;
    }

    // Update last login
    user.last_login = new Date();
    
    // Return user without password hash
    const { password_hash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static async getUserById(userId: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.user_id === userId) {
        const { password_hash: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
    }
    return null;
  }

  // Initialize with default user for development
  static async initialize() {
    if (this.users.size === 0) {
      await this.createUser('admin', 'admin123', ['read', 'write', 'admin']);
      await this.createUser('user', 'user123', ['read', 'write']);
    }
  }
}

// Initialize default users
UserService.initialize();