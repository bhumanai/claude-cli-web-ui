# Claude CLI Integration Technical Specification

## Executive Summary

This specification details the integration of Claude CLI (`claude code`) into the existing FastAPI web UI backend. The solution replaces the current simple command executor with a full PTY-based terminal emulation system that provides each task with its own isolated Claude CLI session, supporting all Claude CLI commands with real-time streaming output.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React/TypeScript)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                              WebSocket Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Task Events  │  │Output Stream │  │ Command Exec │  │Session Mgmt│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                          FastAPI Backend Services                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Claude CLI Session Manager                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │  │
│  │  │ Session Pool│  │PTY Manager  │  │Auth Manager │              │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Command Execution Engine                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │  │
│  │  │Input Parser │  │Output Parser│  │State Machine│              │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                          System Layer (PTY)                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Task 1 PTY  │  Task 2 PTY  │  Task 3 PTY  │  ...  │  Task N PTY │  │
│  │  ┌─────────┐ │  ┌─────────┐ │  ┌─────────┐ │       │  ┌───────┐ │  │
│  │  │claude   │ │  │claude   │ │  │claude   │ │       │  │claude │ │  │
│  │  │code     │ │  │code     │ │  │code     │ │       │  │code   │ │  │
│  │  └─────────┘ │  └─────────┘ │  └─────────┘ │       │  └───────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Claude CLI Session Manager

**Purpose**: Manages lifecycle of Claude CLI sessions per task

```python
class ClaudeCliSessionManager:
    """
    Manages Claude CLI sessions with PTY support.
    Each task gets its own isolated session.
    """
    
    def __init__(self):
        self.sessions: Dict[str, ClaudeCliSession] = {}
        self.auth_manager = ClaudeAuthManager()
        self.pty_manager = PtyManager()
        
    async def create_session(
        self, 
        task_id: str,
        project_path: str,
        options: SessionOptions
    ) -> ClaudeCliSession:
        """Create new Claude CLI session for a task."""
        
    async def get_session(self, task_id: str) -> Optional[ClaudeCliSession]:
        """Get existing session by task ID."""
        
    async def destroy_session(self, task_id: str) -> bool:
        """Terminate and cleanup session."""
```

### 2. PTY Manager

**Purpose**: Handles pseudo-terminal creation and management

```python
class PtyManager:
    """
    Manages PTY (Pseudo-Terminal) instances for proper terminal emulation.
    Provides full terminal capabilities including:
    - ANSI escape sequences
    - Terminal resizing
    - Signal handling
    - Interactive prompts
    """
    
    async def create_pty(
        self,
        command: List[str],
        env: Dict[str, str],
        cwd: str,
        size: Tuple[int, int] = (80, 24)
    ) -> PtyProcess:
        """Create new PTY process."""
        
    async def resize_pty(
        self,
        process: PtyProcess,
        cols: int,
        rows: int
    ) -> None:
        """Resize terminal window."""
        
    async def write_to_pty(
        self,
        process: PtyProcess,
        data: bytes
    ) -> None:
        """Write data to PTY stdin."""
        
    async def read_from_pty(
        self,
        process: PtyProcess,
        timeout: float = 0.1
    ) -> Optional[bytes]:
        """Read data from PTY stdout."""
```

### 3. Claude CLI Session

**Purpose**: Represents a single Claude CLI session

```python
class ClaudeCliSession:
    """
    Represents an active Claude CLI session with full state management.
    """
    
    def __init__(
        self,
        task_id: str,
        pty_process: PtyProcess,
        project_path: str
    ):
        self.task_id = task_id
        self.session_id = str(uuid.uuid4())
        self.pty_process = pty_process
        self.project_path = project_path
        self.created_at = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        self.command_history: List[CommandHistory] = []
        self.state = SessionState.READY
        self.output_buffer = OutputBuffer()
        
    async def execute_command(
        self,
        command: str,
        timeout: Optional[int] = None
    ) -> AsyncIterator[CommandOutput]:
        """Execute command in this session."""
        
    async def interrupt(self) -> None:
        """Send interrupt signal (Ctrl+C) to session."""
        
    async def resize(self, cols: int, rows: int) -> None:
        """Resize terminal window."""
```

### 4. Command Execution Engine

**Purpose**: Handles command parsing, execution, and output streaming

```python
class CommandExecutionEngine:
    """
    Enhanced command executor with full Claude CLI support.
    """
    
    def __init__(self, session_manager: ClaudeCliSessionManager):
        self.session_manager = session_manager
        self.command_parser = ClaudeCommandParser()
        self.output_parser = ClaudeOutputParser()
        
    async def execute_command(
        self,
        task_id: str,
        command: str,
        create_session_if_missing: bool = True
    ) -> AsyncIterator[CommandOutput]:
        """
        Execute Claude CLI command in task's session.
        Supports all Claude CLI commands including:
        - /plan
        - /smart-task
        - /init-project
        - /complete-task
        - /test-task
        - etc.
        """
        
    async def stream_output(
        self,
        session: ClaudeCliSession,
        command_id: str
    ) -> AsyncIterator[CommandOutput]:
        """Stream output from PTY with proper parsing."""
```

### 5. Output Parser

**Purpose**: Parses Claude CLI output for structured responses

```python
class ClaudeOutputParser:
    """
    Parses Claude CLI output to extract:
    - Plain text
    - Code blocks
    - Markdown formatting
    - Progress indicators
    - Error messages
    - Interactive prompts
    """
    
    def parse_output(self, raw_output: bytes) -> ParsedOutput:
        """Parse raw PTY output into structured format."""
        
    def extract_code_blocks(self, content: str) -> List[CodeBlock]:
        """Extract code blocks with language detection."""
        
    def detect_prompt(self, content: str) -> Optional[InteractivePrompt]:
        """Detect interactive prompts requiring user input."""
```

## API Endpoints

### WebSocket Protocol Enhancement

```typescript
// Command execution with session management
interface ExecuteCommandMessage {
  type: 'execute_command';
  task_id: string;
  command: string;
  create_session?: boolean;
}

// Session management
interface SessionControlMessage {
  type: 'session_control';
  action: 'create' | 'destroy' | 'interrupt' | 'resize';
  task_id: string;
  options?: {
    project_path?: string;
    cols?: number;
    rows?: number;
  };
}

// Output streaming with rich formatting
interface CommandOutputMessage {
  type: 'command_output';
  task_id: string;
  command_id: string;
  output: {
    type: 'text' | 'code' | 'markdown' | 'error' | 'prompt';
    content: string;
    language?: string;  // For code blocks
    timestamp: string;
    sequence: number;
  };
}

// Session state updates
interface SessionStateMessage {
  type: 'session_state';
  task_id: string;
  state: 'creating' | 'ready' | 'busy' | 'waiting_input' | 'destroyed';
  session_info?: {
    session_id: string;
    created_at: string;
    last_activity: string;
    current_directory: string;
  };
}
```

### REST API Enhancements

```python
# Session management endpoints
GET    /api/sessions                    # List all active sessions
GET    /api/sessions/{task_id}          # Get session details
POST   /api/sessions                    # Create new session
DELETE /api/sessions/{task_id}          # Destroy session
POST   /api/sessions/{task_id}/resize   # Resize terminal

# Command execution enhancements
POST   /api/execute                     # Execute command (with task_id)
POST   /api/execute/{task_id}/interrupt # Send interrupt signal

# Claude CLI specific
GET    /api/claude/commands             # List available Claude commands
GET    /api/claude/auth/status          # Check auth status
POST   /api/claude/auth/refresh         # Refresh auth if needed
```

## Session Management Strategy

### 1. Session Lifecycle

```python
class SessionLifecycle:
    """
    1. Creation: When task starts or first command executed
    2. Authentication: Inherit from 'claude code' CLI auth
    3. Initialization: Set working directory, environment
    4. Active: Execute commands, maintain state
    5. Idle Management: Keep-alive with timeouts
    6. Cleanup: Graceful shutdown on task completion
    """
```

### 2. Session Isolation

- Each task gets dedicated PTY process
- Separate working directories per task
- Independent command history
- Isolated environment variables
- No cross-task interference

### 3. Resource Management

```python
class ResourceLimits:
    MAX_SESSIONS_PER_USER = 50
    SESSION_IDLE_TIMEOUT = 3600  # 1 hour
    MAX_OUTPUT_BUFFER_SIZE = 10 * 1024 * 1024  # 10MB
    PTY_READ_TIMEOUT = 0.1  # 100ms
    COMMAND_TIMEOUT_DEFAULT = 300  # 5 minutes
```

## File Structure

```
backend/
├── app/
│   ├── services/
│   │   ├── claude_cli/
│   │   │   ├── __init__.py
│   │   │   ├── session_manager.py      # Main session manager
│   │   │   ├── pty_manager.py          # PTY handling
│   │   │   ├── auth_manager.py         # Claude auth integration
│   │   │   ├── command_parser.py       # Command parsing
│   │   │   ├── output_parser.py        # Output parsing
│   │   │   └── models.py               # Claude-specific models
│   │   │
│   │   ├── command_executor.py         # Updated executor
│   │   └── websocket_handlers.py       # New WebSocket handlers
│   │
│   ├── api/
│   │   └── endpoints/
│   │       ├── claude_sessions.py      # New session endpoints
│   │       └── commands.py             # Updated command endpoints
│   │
│   └── models/
│       └── claude_schemas.py           # Claude-specific schemas
```

## Implementation Steps

### Phase 1: Core PTY Infrastructure (Days 1-3)
1. Implement PtyManager with proper terminal emulation
2. Create basic PTY process wrapper with async I/O
3. Test PTY creation, writing, reading, and cleanup
4. Handle signals and terminal resizing

### Phase 2: Session Management (Days 4-6)
1. Implement ClaudeCliSessionManager
2. Create session lifecycle management
3. Add authentication integration
4. Implement resource limits and cleanup

### Phase 3: Command Execution (Days 7-9)
1. Update CommandExecutor for PTY integration
2. Implement output parsing and streaming
3. Handle interactive prompts and user input
4. Add command history and state tracking

### Phase 4: WebSocket Integration (Days 10-12)
1. Enhance WebSocket protocol for sessions
2. Implement real-time output streaming
3. Add session control messages
4. Handle connection recovery

### Phase 5: Testing & Polish (Days 13-14)
1. Unit tests for all components
2. Integration tests with real Claude CLI
3. Load testing with multiple sessions
4. Error handling and edge cases

## Error Handling

### 1. PTY Errors
```python
class PtyError(Exception):
    """Base PTY error"""

class PtyCreationError(PtyError):
    """Failed to create PTY"""

class PtyIOError(PtyError):
    """PTY I/O operation failed"""

class PtyTimeoutError(PtyError):
    """PTY operation timed out"""
```

### 2. Session Errors
```python
class SessionError(Exception):
    """Base session error"""

class SessionNotFoundError(SessionError):
    """Session doesn't exist"""

class SessionLimitExceededError(SessionError):
    """Too many active sessions"""

class SessionAuthError(SessionError):
    """Authentication failed"""
```

### 3. Error Recovery
- Automatic session restart on crash
- Command retry with exponential backoff
- Graceful degradation on auth failure
- Clear error messages to frontend

## Testing Strategy

### 1. Unit Tests
```python
# Test PTY operations
test_pty_creation()
test_pty_write_read()
test_pty_resize()
test_pty_cleanup()

# Test session management
test_session_creation()
test_session_isolation()
test_session_timeout()
test_session_limits()

# Test command execution
test_command_parsing()
test_output_streaming()
test_interactive_prompts()
test_command_interruption()
```

### 2. Integration Tests
```python
# Test with real Claude CLI
test_claude_authentication()
test_claude_commands()
test_plan_command()
test_smart_task_command()
test_file_operations()

# Test WebSocket integration
test_websocket_session_creation()
test_websocket_command_execution()
test_websocket_output_streaming()
test_websocket_reconnection()
```

### 3. Load Tests
- 50 concurrent sessions
- 1000 commands per minute
- Large output streaming (10MB+)
- Session creation/destruction cycles

## Security Considerations

### 1. Authentication
- Use existing `claude code` CLI authentication
- No credentials stored in backend
- Auth tokens refreshed automatically
- Session-specific auth validation

### 2. Command Validation
- Whitelist Claude CLI commands only
- No direct shell command execution
- Input sanitization before PTY write
- Output sanitization before streaming

### 3. Resource Protection
- Per-user session limits
- Output buffer size limits
- CPU/memory monitoring
- Automatic resource cleanup

### 4. Access Control
- Localhost-only by default
- Task-based session isolation
- No cross-session data access
- Audit logging for commands

## Performance Optimizations

### 1. Output Streaming
- Chunk output for efficient transmission
- Compress large outputs
- Buffer management to prevent memory issues
- Async I/O throughout

### 2. Session Pooling
- Pre-warm sessions for faster startup
- Reuse idle sessions when possible
- Efficient session cleanup
- Connection pooling for PTY operations

### 3. Caching
- Cache Claude command list
- Cache authentication status
- Cache parsed output formats
- Session state caching

## Code Examples

### 1. Creating a Claude CLI Session

```python
async def create_claude_session(task_id: str, project_path: str) -> ClaudeCliSession:
    """Create a new Claude CLI session for a task."""
    
    # Create PTY process
    pty_process = await pty_manager.create_pty(
        command=["claude", "code"],
        env={
            **os.environ,
            "CLAUDE_PROJECT_PATH": project_path,
            "TERM": "xterm-256color",
        },
        cwd=project_path,
        size=(120, 40)
    )
    
    # Create session
    session = ClaudeCliSession(
        task_id=task_id,
        pty_process=pty_process,
        project_path=project_path
    )
    
    # Wait for initial prompt
    await session.wait_for_ready()
    
    return session
```

### 2. Executing a Command

```python
async def execute_claude_command(
    task_id: str, 
    command: str
) -> AsyncIterator[CommandOutput]:
    """Execute a Claude CLI command in task's session."""
    
    # Get or create session
    session = await session_manager.get_or_create_session(task_id)
    
    # Write command to PTY
    await session.pty_process.write(f"{command}\n".encode())
    
    # Stream output
    async for output in session.read_output():
        # Parse output
        parsed = output_parser.parse_output(output)
        
        # Yield structured response
        yield CommandOutput(
            task_id=task_id,
            command_id=session.current_command_id,
            type=parsed.type,
            content=parsed.content,
            timestamp=datetime.utcnow()
        )
```

### 3. WebSocket Handler

```python
@websocket_router.websocket("/ws/{session_id}")
async def enhanced_websocket_endpoint(websocket: WebSocket, session_id: str):
    """Enhanced WebSocket endpoint with Claude CLI support."""
    
    await websocket.accept()
    connection_id = str(uuid.uuid4())
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "execute_command":
                task_id = message["task_id"]
                command = message["command"]
                
                # Execute in Claude CLI session
                async for output in execute_claude_command(task_id, command):
                    await websocket.send_json({
                        "type": "command_output",
                        "task_id": task_id,
                        "output": output.dict()
                    })
                    
            elif message["type"] == "session_control":
                # Handle session management
                await handle_session_control(message)
                
    except WebSocketDisconnect:
        await cleanup_connection(connection_id)
```

## Monitoring & Observability

### 1. Metrics
- Active sessions count
- Commands per minute
- Average command latency
- Output streaming bandwidth
- Error rates by type

### 2. Logging
- Session lifecycle events
- Command execution traces
- PTY I/O operations
- Error details with context
- Performance metrics

### 3. Health Checks
- PTY process health
- Session state validation
- Authentication status
- Resource usage monitoring

## Conclusion

This specification provides a comprehensive plan for integrating Claude CLI into the web UI backend with full PTY-based terminal emulation. The solution ensures each task has its own isolated Claude CLI session with complete support for all Claude commands, real-time output streaming, and proper error handling.

The architecture is designed for:
- **Production readiness**: Robust error handling and resource management
- **Scalability**: Support for multiple concurrent sessions
- **Security**: Proper isolation and authentication
- **Performance**: Efficient streaming and caching
- **Maintainability**: Clean separation of concerns

Implementation following this specification will provide users with a seamless Claude CLI experience through the web interface while maintaining the full power and flexibility of the command-line tool.