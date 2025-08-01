const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// In-memory storage
const sessions = {};
const commands = {};

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Claude CLI Backend is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Execute command
app.post('/api/sessions/:sessionId/commands', (req, res) => {
  const { sessionId } = req.params;
  const { command } = req.body;
  
  const commandId = `cmd_${Date.now()}`;
  const response = {
    id: commandId,
    command: command,
    output: `Mock output for: ${command}\n`,
    status: 'completed',
    timestamp: new Date().toISOString()
  };
  
  if (!commands[sessionId]) {
    commands[sessionId] = [];
  }
  commands[sessionId].push(response);
  
  res.json(response);
});

// Get messages for polling
app.get('/api/sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const messages = [];
  
  if (commands[sessionId]) {
    commands[sessionId].forEach(cmd => {
      messages.push({
        type: 'command_update',
        data: {
          id: cmd.id,
          output: cmd.output,
          isPartial: false
        }
      });
      messages.push({
        type: 'command_finished',
        data: {
          id: cmd.id,
          status: cmd.status
        }
      });
    });
  }
  
  res.json({ messages });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});