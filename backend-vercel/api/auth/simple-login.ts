/**
 * Simple authentication endpoint for single user
 */

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  const allowedOrigins = [
    'https://claudeui-rouge.vercel.app',
    'https://claudeui-6gykcm69k-bhuman.vercel.app',
    'https://claudeui-jwyp7qcq4-bhuman.vercel.app',
    'https://claudeui-fvw6ne2mm-bhuman.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password } = req.body;
    
    // Simple password check
    const SIMPLE_PASSWORD = process.env.SIMPLE_PASSWORD || 'claude123';
    
    if (password === SIMPLE_PASSWORD) {
      // Generate a simple session token
      const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      return res.status(200).json({
        success: true,
        token: sessionToken,
        user: {
          id: '1',
          username: 'admin',
          role: 'admin'
        }
      });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Invalid password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}