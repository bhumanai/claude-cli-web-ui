const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Simple login endpoint
app.post('/api/auth/simple-login', (req, res) => {
  const { password } = req.body;
  
  if (password === 'claude123') {
    res.json({
      access_token: 'simple-token-' + Date.now(),
      refresh_token: 'refresh-token-' + Date.now(),
      token_type: 'bearer',
      expires_in: 3600
    });
  } else {
    res.status(401).json({ detail: 'Invalid password' });
  }
});

// Command execution endpoint
app.post('/api/sessions/:sessionId/commands', (req, res) => {
  const { command } = req.body;
  const { sessionId } = req.params;
  
  res.json({
    id: 'cmd_' + Date.now(),
    command: command,
    output: `Executed: ${command}`,
    status: 'completed',
    timestamp: new Date().toISOString()
  });
});

// Export for Vercel
module.exports = app;