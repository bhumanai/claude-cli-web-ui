import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    return res.json({ 
      hasToken: false, 
      message: 'GITHUB_TOKEN not set in environment'
    });
  }
  
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.ok) {
      const user = await response.json();
      return res.json({
        hasToken: true,
        tokenWorks: true,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 4) + '...',
        user: user.login
      });
    } else {
      return res.json({
        hasToken: true,
        tokenWorks: false,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 4) + '...',
        error: response.status
      });
    }
  } catch (error) {
    return res.json({
      hasToken: true,
      tokenWorks: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}