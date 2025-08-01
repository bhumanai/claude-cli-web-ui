import { VercelRequest, VercelResponse } from '@vercel/node';

const SIMPLE_PASSWORD = process.env.SIMPLE_PASSWORD || 'claude123';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      detail: 'Method not allowed' 
    });
  }

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ 
        detail: 'Password is required' 
      });
    }

    if (password !== SIMPLE_PASSWORD) {
      return res.status(401).json({ 
        detail: 'Invalid password' 
      });
    }

    // Generate a simple token
    const token = Buffer.from(`simple-auth:${Date.now()}`).toString('base64');

    return res.status(200).json({
      token,
      access_token: token,
      user: {
        username: 'claude-user',
        email: 'user@claude-cli.local'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      detail: 'Internal server error' 
    });
  }
}