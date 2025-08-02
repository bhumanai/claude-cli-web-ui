import { VercelRequest, VercelResponse } from '@vercel/node';
import { connections } from '../../github';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { project_id } = req.query;
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Find connection for this project
    const connection = Array.from(connections.values()).find(
      conn => conn.project_id === project_id && conn.status === 'active'
    );

    if (connection) {
      // Return WITHOUT token for security
      const { token, ...safeConnection } = connection;
      return res.status(200).json(safeConnection);
    } else {
      return res.status(200).json(null);
    }
  }

  if (req.method === 'DELETE') {
    // Find and deactivate connection
    let found = false;
    for (const [id, conn] of connections.entries()) {
      if (conn.project_id === project_id && conn.status === 'active') {
        conn.status = 'inactive';
        found = true;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ 
        error: 'No active GitHub connection found for this project' 
      });
    }

    return res.status(200).json({ 
      message: 'GitHub repository disconnected successfully' 
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}