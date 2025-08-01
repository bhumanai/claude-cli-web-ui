const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8000;

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']
}));

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Claude CLI Backend is running', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Simple login endpoint
app.post('/api/auth/simple-login', (req, res) => {
  const { password } = req.body;
  
  if (password === 'claude123') {
    res.json({
      access_token: 'token-' + Date.now(),
      refresh_token: 'refresh-' + Date.now(),
      token_type: 'bearer',
      expires_in: 3600
    });
  } else {
    res.status(401).json({ detail: 'Invalid password' });
  }
});

// Session commands
const commandHistory = {};

app.post('/api/sessions/:sessionId/commands', (req, res) => {
  const { command } = req.body;
  const { sessionId } = req.params;
  
  if (!commandHistory[sessionId]) {
    commandHistory[sessionId] = [];
  }
  
  const commandResult = {
    id: 'cmd_' + Date.now(),
    command: command,
    output: `Executed command: ${command}\nOutput: Command processed successfully`,
    status: 'completed',
    timestamp: new Date().toISOString()
  };
  
  commandHistory[sessionId].push(commandResult);
  
  res.json(commandResult);
});

app.get('/api/sessions/:sessionId/commands', (req, res) => {
  const { sessionId } = req.params;
  res.json({ commands: commandHistory[sessionId] || [] });
});

// Messages endpoint for polling
app.get('/api/sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  res.json({ messages: [] });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'execute_command') {
        const response = {
          type: 'command_started',
          data: {
            id: 'cmd_' + Date.now(),
            command: data.data.command
          }
        };
        ws.send(JSON.stringify(response));
        
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'command_update',
            data: {
              id: response.data.id,
              output: `Output for: ${data.data.command}`,
              isPartial: false
            }
          }));
          
          ws.send(JSON.stringify({
            type: 'command_finished',
            data: {
              id: response.data.id,
              status: 'completed'
            }
          }));
        }, 100);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});