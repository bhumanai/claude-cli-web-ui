# Claude CLI Session Management

This module provides a comprehensive session management system for Claude CLI with PTY (Pseudo-Terminal) integration, enabling proper terminal emulation and isolated execution environments.

## Architecture Overview

### Core Components

1. **ClaudeCliSession** (`claude_session.py`)
   - Manages individual Claude CLI sessions with state machine
   - Handles PTY process lifecycle
   - Provides output streaming and command execution
   - States: INITIALIZING → AUTHENTICATING → READY → BUSY/IDLE → TERMINATING → TERMINATED

2. **ClaudeSessionManager** (`claude_session_manager.py`)
   - Enhanced session manager extending base SessionManager
   - Manages multiple Claude CLI sessions
   - Provides task-to-session mapping
   - Handles resource isolation and cleanup

3. **SessionConfig**
   - Configuration for Claude CLI sessions
   - Includes task ID, project path, environment variables
   - Terminal size configuration
   - Authentication token support

## Key Features

### State Machine
- **INITIALIZING**: Session is being created
- **AUTHENTICATING**: Authentication in progress
- **READY**: Session ready for commands
- **BUSY**: Executing a command
- **IDLE**: No active commands
- **TERMINATING**: Shutting down
- **TERMINATED**: Session ended
- **ERROR**: Error state

### PTY Integration
- Full terminal emulation support
- ANSI escape sequences
- Terminal resizing
- Signal handling (interrupt, terminate)
- Interactive prompts support

### Resource Management
- Isolated sessions per task
- Automatic cleanup on termination
- Output buffer management
- Command history tracking
- Session timeout handling

## Usage Examples

### Basic Session Creation

```python
from app.services.claude_cli import ClaudeSessionManager, SessionConfig

# Create session manager
manager = ClaudeSessionManager()
await manager.start()

# Configure session
config = SessionConfig(
    task_id="task-001",
    project_path="/path/to/project",
    terminal_size=(120, 40),
    environment={"DEBUG": "true"}
)

# Create session
session = await manager.create_claude_session(config)

# Wait for ready state
while not session.is_ready:
    await asyncio.sleep(0.1)

# Execute commands
response = await manager.send_command_to_session(
    session.session_id,
    "ls -la",
    timeout=30
)
```

### Output Streaming

```python
# Define output handler
def handle_output(output: SessionOutput):
    print(f"[{output.type}] {output.content}")

# Create session with output callback
session = await manager.create_claude_session(
    config=config,
    output_callback=handle_output
)
```

### WebSocket Integration

```python
@app.websocket("/ws/sessions/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    # Register output callback
    async def send_output(output: SessionOutput):
        await websocket.send_json({
            "type": "output",
            "data": output.to_dict()
        })
    
    await manager.register_output_callback(
        session_id,
        lambda sid, output: asyncio.create_task(send_output(output))
    )
    
    # Handle WebSocket messages...
```

### Terminal Operations

```python
# Resize terminal
await manager.resize_session_terminal(session_id, 80, 24)

# Send interrupt (Ctrl+C)
await manager.interrupt_session(session_id)

# Terminate session
await manager.terminate_claude_session(session_id, force=False)
```

## API Endpoints

The implementation includes example FastAPI endpoints:

- `POST /api/v1/sessions/claude` - Create new session
- `POST /api/v1/sessions/{id}/commands` - Execute command
- `GET /api/v1/sessions/{id}` - Get session info
- `GET /api/v1/sessions/{id}/output` - Get session output
- `POST /api/v1/sessions/{id}/resize` - Resize terminal
- `POST /api/v1/sessions/{id}/interrupt` - Send interrupt
- `DELETE /api/v1/sessions/{id}` - Terminate session
- `GET /api/v1/sessions` - List all sessions
- `GET /api/v1/stats/claude` - Get statistics
- `WS /ws/sessions/{id}` - WebSocket for real-time output

## Testing

Run the test scripts to verify functionality:

```bash
# Test single session
python app/services/claude_cli/test_claude_session.py

# Test PTY functionality
python app/services/claude_cli/test_pty.py
```

## Error Handling

The implementation includes comprehensive error handling:

- PTY creation failures
- Authentication errors
- Command execution failures
- Session state violations
- Resource cleanup errors

## Performance Considerations

- Non-blocking I/O for PTY operations
- Async/await throughout
- Output buffer size limits (10,000 entries)
- Concurrent session support
- Efficient state management

## Security

- Session isolation
- Environment variable control
- Authentication token support
- Resource limits
- Safe signal handling

## Integration Points

1. **Task Management System**
   - Each task gets isolated Claude session
   - Task ID to session mapping
   - Automatic cleanup on task completion

2. **WebSocket Streaming**
   - Real-time output delivery
   - Command execution via WebSocket
   - Terminal resize support

3. **REST API**
   - Full session lifecycle management
   - Command execution with timeout
   - Output retrieval

## Future Enhancements

1. **Session Persistence**
   - Save/restore session state
   - Command history persistence
   - Output archival

2. **Advanced Features**
   - Session templates
   - Command macros
   - Output filtering/transformation

3. **Monitoring**
   - Session metrics
   - Performance tracking
   - Resource usage monitoring