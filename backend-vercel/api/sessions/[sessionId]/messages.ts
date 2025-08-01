/**
 * Session messages endpoint for polling
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;
    const since = req.query.since ? parseInt(req.query.since as string) : 0;
    
    // Return empty messages for now (no new messages)
    return res.status(200).json({
      messages: [],
      lastMessageId: since,
      sessionId: sessionId
    });
  } catch (error) {
    console.error('Messages error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}