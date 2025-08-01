import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { verifyAuth } from '../src/utils/api';

// Mock user database (in production, use a real database)
const users = new Map([
  ['admin', { 
    id: '1', 
    username: 'admin', 
    password: '$2a$10$X7hNgVjEQrV8eOY2cVxXP.8GKfgG0YmFv2E.CmnEk5eFxwK0mCqDa' // admin123
  }]
]);

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url?.split('?')[0];
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

  // POST /api/auth (login)
  if (req.method === 'POST' && path === '/api/auth') {
    try {
      const { username, password } = loginSchema.parse(req.body);
      
      const user = users.get(username);
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, username: user.username, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        access_token: token,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 86400
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/auth (me)
  if (req.method === 'GET' && path === '/api/auth') {
    try {
      const auth = await verifyAuth(req);
      if (!auth.isAuthenticated || !auth.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(200).json({
        id: auth.user.userId,
        username: auth.user.username,
        created_at: new Date().toISOString()
      });

    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // POST /api/auth/refresh
  if (req.method === 'POST' && path === '/api/auth/refresh') {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const decoded = jwt.verify(refresh_token, JWT_SECRET) as any;
      if (decoded.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const newToken = jwt.sign(
        { userId: decoded.userId, username: decoded.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, username: decoded.username, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        access_token: newToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: 86400
      });

    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}