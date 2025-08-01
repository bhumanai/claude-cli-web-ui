# Claude CLI Web UI Backend - Setup Guide

This guide will help you set up and run the Claude CLI Web UI backend server.

## Prerequisites

- Python 3.8 or higher
- Claude CLI installed and accessible via `claude` command
- Terminal/Command Prompt access

## Installation

### 1. Navigate to Backend Directory

```bash
cd /Users/don/D3/tasks/task-001-claude-cli-web-ui/backend
```

### 2. Create Virtual Environment (Recommended)

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration (optional)
nano .env  # or use your preferred editor
```

## Running the Server

### Development Mode (Recommended for testing)

```bash
python start_server.py --debug
```

This will start the server with:
- Debug mode enabled
- Auto-reload on code changes
- Detailed logging
- Server at http://localhost:8000

### Production Mode

```bash
python start_server.py
```

### Custom Configuration

```bash
# Different port
python start_server.py --port 8080

# Different host (for network access)
python start_server.py --host 0.0.0.0

# Custom log level
python start_server.py --log-level DEBUG
```

## Verification

### 1. Check Server Status

Visit http://localhost:8000/api/health in your browser. You should see:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-01-30T12:30:00Z",
  "uptime": 123.45
}
```

### 2. Run Test Suite

```bash
python test_server.py
```

This will test:
- Health endpoint
- Session creation
- WebSocket connection
- Command suggestions

### 3. Check API Documentation

Visit http://localhost:8000/api/docs to see the interactive API documentation.

## Usage Examples

### Create a Session

```bash
curl -X POST http://localhost:8000/api/sessions/
```

### Get Command Suggestions

```bash
curl http://localhost:8000/api/commands/suggestions
```

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/your-session-id');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);
};

// Send a command
ws.send(JSON.stringify({
    type: 'execute_command',
    command: 'claude help'
}));
```

## Configuration Options

### Environment Variables

Key settings in `.env`:

```bash
# Server
HOST=127.0.0.1
PORT=8000
DEBUG=False

# Security
RATE_LIMIT_PER_MINUTE=60
ALLOWED_ORIGINS=["http://localhost:5173"]

# Claude CLI
CLAUDE_CLI_COMMAND=claude
CLAUDE_CLI_TIMEOUT=300
MAX_CONCURRENT_COMMANDS=5

# Sessions
SESSION_TIMEOUT=3600
MAX_SESSIONS=100
```

### Command Line Options

```bash
python start_server.py --help
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
# Error: Address already in use
# Solution: Use different port
python start_server.py --port 8001
```

#### 2. Claude CLI Not Found

```bash
# Error: Command 'claude' not found
# Solution: Install Claude CLI or set custom command
export CLAUDE_CLI_COMMAND=/path/to/claude
```

#### 3. Permission Denied

```bash
# Error: Permission denied on port 80/443
# Solution: Use higher port number or run with sudo (not recommended)
python start_server.py --port 8000
```

#### 4. Import Errors

```bash
# Error: ModuleNotFoundError
# Solution: Ensure virtual environment is activated and dependencies installed
source venv/bin/activate
pip install -r requirements.txt
```

### Debug Mode

For detailed troubleshooting, run with debug enabled:

```bash
python start_server.py --debug --log-level DEBUG
```

### Logs

Check server logs for detailed error information:

```bash
# With debug mode, logs go to console
# In production, configure log files in your deployment
```

## Next Steps

Once the backend is running successfully:

1. **Frontend Development**: Proceed to Phase 2 to build the React frontend
2. **Integration Testing**: Test the complete system with frontend + backend
3. **Production Deployment**: Configure for production environment

## Security Notes

- The default configuration binds to `127.0.0.1` (localhost only)
- Rate limiting is enabled by default (60 requests/minute)
- Dangerous commands are blocked by the security layer
- For network access, configure `ALLOWED_ORIGINS` properly

## Performance

The backend is designed to handle:
- 10+ concurrent sessions
- Real-time command streaming
- <100ms API response times
- <100MB memory usage

## Support

If you encounter issues:

1. Check this setup guide
2. Review the main README.md
3. Run the test suite to identify specific problems
4. Check server logs for detailed error messages

## API Endpoints Summary

Once running, these endpoints are available:

- `GET /api/health/` - Health check
- `POST /api/sessions/` - Create session
- `POST /api/commands/execute` - Execute command
- `WS /ws/{session_id}` - WebSocket connection
- `GET /api/docs` - API documentation

The backend is now ready for frontend integration!