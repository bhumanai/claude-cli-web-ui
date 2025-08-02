import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Direct test with the token
  const token = process.env.GITHUB_TOKEN || 'token-not-found';
  
  try {
    const response = await fetch('https://api.github.com/repos/bhuman-ai/gesture_generator/issues', {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: '[Task] Direct Test - Working Now',
        body: 'Testing direct GitHub API call from Vercel',
        labels: ['task']
      })
    });
    
    if (response.ok) {
      const issue = await response.json();
      return res.json({ success: true, issue_number: issue.number, url: issue.html_url });
    } else {
      const error = await response.json();
      return res.json({ success: false, error: error.message, status: response.status });
    }
  } catch (error) {
    return res.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}