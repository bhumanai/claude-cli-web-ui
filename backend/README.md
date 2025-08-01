# Claude CLI Web UI - Backend

A high-performance FastAPI backend server for the Claude CLI Web UI, providing real-time command execution and WebSocket communication.

## Features

- **FastAPI Framework**: Modern, fast web framework with automatic API documentation
- **Real-time Communication**: WebSocket support for live command output streaming
- **Command Execution**: Secure subprocess management for Claude CLI commands
- **Session Management**: Persistent sessions with command history
- **Security**: Rate limiting, input sanitization, and command validation
- **Monitoring**: Comprehensive logging and health checks
- **Development Ready**: Hot reload, debug mode, and detailed error reporting

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Copy the example environment file and customize it:

```bash
cp .env.example .env
# Edit .env with your preferred settings
```

### 3. Start the Server

**Development Mode:**
```bash
python start_server.py --debug
```

**Production Mode:**
```bash
python start_server.py
```

**Custom Configuration:**
```bash
python start_server.py --host 0.0.0.0 --port 8080 --log-level INFO
```

### 4. Access the API

- **Server**: http://localhost:8000
- **API Documentation**: http://localhost:8000/api/docs
- **Health Check**: http://localhost:8000/api/health

## API Endpoints

### Health & Monitoring

- `GET /api/health/` - Basic health check
- `GET /api/health/stats` - Detailed server statistics

### Command Execution

- `POST /api/commands/execute` - Execute a Claude CLI command (streaming)
- `POST /api/commands/cancel/{command_id}` - Cancel a running command
- `GET /api/commands/running` - List running commands
- `GET /api/commands/suggestions` - Get command suggestions

### Session Management

- `POST /api/sessions/` - Create a new session
- `GET /api/sessions/` - List all sessions
- `GET /api/sessions/{session_id}` - Get session info
- `DELETE /api/sessions/{session_id}` - Delete a session
- `GET /api/sessions/{session_id}/history` - Get command history
- `DELETE /api/sessions/{session_id}/history` - Clear command history

### WebSocket

- `WS /ws/{session_id}` - Real-time communication endpoint

## WebSocket Protocol

### Client to Server Messages

```json
{
  "type": "execute_command",
  "command": "claude code"
}
```

```json
{
  "type": "get_history",
  "limit": 50,
  "offset": 0
}
```

```json
{
  "type": "ping",
  "timestamp": 1234567890
}
```

### Server to Client Messages

```json
{
  "type": "command_update",
  "command_id": "uuid",
  "session_id": "uuid",
  "data": {
    "status": "running",
    "output": [...],
    "exit_code": null
  }
}
```

```json
{
  "type": "command_finished",
  "command_id": "uuid",
  "session_id": "uuid",
  "data": {
    "status": "completed",
    "exit_code": 0
  }
}
```

## Configuration

### Environment Variables

All configuration is done through environment variables. See `.env.example` for all available options.

**Key Settings:**

- `HOST`: Server host (default: 127.0.0.1)
- `PORT`: Server port (default: 8000)
- `DEBUG`: Enable debug mode (default: False)
- `CLAUDE_CLI_COMMAND`: Claude CLI command (default: claude)
- `RATE_LIMIT_PER_MINUTE`: API rate limit (default: 60)
- `SESSION_TIMEOUT`: Session timeout in seconds (default: 3600)

### Security Configuration

- `ENABLE_AUTH`: Enable authentication (default: False)
- `SECRET_KEY`: JWT secret key for authentication
- `ALLOWED_ORIGINS`: CORS allowed origins

## Development

### Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── commands.py      # Command execution endpoints
│   │   │   ├── health.py        # Health check endpoints
│   │   │   └── sessions.py      # Session management endpoints
│   │   └── router.py            # Main API router
│   ├── core/
│   │   ├── logging_config.py    # Logging configuration
│   │   ├── middleware.py        # Custom middleware
│   │   └── security.py          # Security utilities
│   ├── models/
│   │   └── schemas.py           # Pydantic data models
│   ├── services/
│   │   ├── command_executor.py  # Command execution service
│   │   └── session_manager.py   # Session management service
│   ├── config.py                # Application configuration
│   └── websocket.py             # WebSocket handlers
├── main.py                      # FastAPI application factory
├── start_server.py              # Server startup script
└── requirements.txt             # Python dependencies
```

### Running Tests

```bash
pytest
```

### Code Quality

```bash
# Type checking
mypy app/

# Linting
ruff check app/

# Formatting
ruff format app/
```

## Security Features

### Rate Limiting

- Configurable rate limiting per IP address
- Automatic blocking of abusive clients
- Graceful error responses with retry information

### Command Validation

- Whitelist-based command validation
- Prevention of dangerous filesystem operations
- Input sanitization and length limits

### Secure Headers

- Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

## Performance

### Optimization Features

- Async/await throughout for maximum concurrency
- Connection pooling for WebSocket management
- Efficient memory usage with streaming responses
- Background cleanup tasks for session management

### Monitoring

- Structured logging with correlation IDs
- Request timing and performance metrics
- Memory and CPU usage tracking
- WebSocket connection statistics

## Production Deployment

### Docker (Recommended)

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["python", "start_server.py"]
```

### Systemd Service

```ini
[Unit]
Description=Claude CLI Web UI Backend
After=network.target

[Service]
Type=simple
User=claude
WorkingDirectory=/opt/claude-web-ui
ExecStart=/opt/claude-web-ui/venv/bin/python start_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   python start_server.py --port 8001
   ```

2. **Claude CLI Not Found**
   - Ensure `claude` command is in your PATH
   - Set `CLAUDE_CLI_COMMAND` environment variable

3. **WebSocket Connection Issues**
   - Check CORS settings in `ALLOWED_ORIGINS`
   - Verify firewall allows WebSocket connections

4. **High Memory Usage**
   - Reduce `MAX_SESSIONS` and `SESSION_TIMEOUT`
   - Clear old command history regularly

### Logs

View server logs for debugging:

```bash
# Development
python start_server.py --debug --log-level DEBUG

# Production
tail -f /var/log/claude-web-ui/server.log
```

## Contributing

1. Follow the existing code style
2. Add type hints for all functions
3. Include docstrings for public methods
4. Write tests for new features
5. Update documentation

## License

This project is part of the Claude CLI Web UI system.