# CommandExecutor PTY Integration

## Overview

The CommandExecutor has been updated to use PTY-based ClaudeCliSession instead of basic subprocess execution. This provides full terminal emulation capabilities, interactive command support, and better handling of Claude CLI specific features.

## Key Changes

### 1. PTY-Based Execution
- Replaced `asyncio.subprocess` with `ClaudeCliSession` and `PtyManager`
- Full terminal emulation with ANSI escape sequences support
- Proper handling of interactive prompts and user input
- Terminal resizing capabilities

### 2. Claude CLI Command Support
- Native support for slash commands (`/plan`, `/smart-task`, etc.)
- Commands starting with `/` are sent directly to the Claude CLI session
- Better parsing and handling of Claude CLI responses

### 3. Enhanced Output Streaming
- Real-time output streaming with proper buffering
- Output type mapping (stdout, stderr, system, error)
- Intelligent command completion detection
- Error pattern recognition and extraction

### 4. Interactive Features
- `send_input()` method for sending input to active sessions
- `resize_terminal()` for dynamic terminal sizing
- Support for interactive prompts and user responses

### 5. Improved State Management
- Session state tracking (INITIALIZING, READY, BUSY, IDLE, TERMINATED)
- Command history tracking
- Better cleanup and resource management

## API Changes

### New Parameters in execute_command()
```python
async def execute_command(
    self,
    command: str,
    session_id: str,
    timeout: Optional[int] = None,
    project_path: Optional[str] = None,  # NEW
    environment: Optional[Dict[str, str]] = None  # NEW
) -> AsyncIterator[CommandResponse]:
```

### New Methods
```python
# Send input to an active command
async def send_input(self, command_id: str, input_data: str) -> bool

# Resize terminal window
async def resize_terminal(self, command_id: str, cols: int, rows: int) -> bool

# Clean up all resources
async def cleanup(self) -> None
```

## Usage Examples

### Basic Command Execution
```python
executor = CommandExecutor()

async for response in executor.execute_command(
    command="echo 'Hello World'",
    session_id="session-123"
):
    print(f"Status: {response.status}")
    for msg in response.output:
        print(f"{msg.type}: {msg.content}")
```

### Claude CLI Slash Commands
```python
# Execute a Claude CLI slash command
async for response in executor.execute_command(
    command="/plan Create a new feature",
    session_id="session-456",
    project_path="/path/to/project"
):
    # Process response...
```

### Interactive Commands
```python
command_id = None

# Start interactive command
async for response in executor.execute_command(
    command="python3 -i",
    session_id="session-789"
):
    if not command_id:
        command_id = response.command_id
    
    # Check for prompt
    if any(">>>" in msg.content for msg in response.output):
        # Send Python code
        await executor.send_input(command_id, "print('Hello from Python!')\n")
```

### Terminal Resizing
```python
# Resize terminal to 150x50
await executor.resize_terminal(command_id, cols=150, rows=50)
```

## Command Completion Detection

The executor automatically detects command completion through various patterns:
- "Command completed"
- "Task completed"
- "Done." / "Finished."
- Success indicators (✓, ✅)
- Claude conversation markers ("Human:", "Assistant:")
- Empty lines after output

## Error Handling

Enhanced error detection includes:
- Error keywords (error:, failed:, exception:, traceback)
- System errors (permission denied, command not found)
- Error indicators (❌, ⚠️)
- Automatic error message extraction

## Backward Compatibility

The CommandExecutor maintains backward compatibility:
- Existing code using basic commands will continue to work
- The API surface remains largely the same
- New features are opt-in through additional parameters

## Performance Considerations

- PTY sessions have slightly more overhead than basic subprocess
- Output buffering prevents memory issues with large outputs
- Concurrent command execution is still limited by semaphore
- Proper cleanup is essential to prevent resource leaks

## Testing

See `tests/integration/test_command_executor_pty.py` for comprehensive tests covering:
- Simple command execution
- Claude CLI slash commands
- Command cancellation
- Concurrent command execution
- Error handling
- Interactive input

## Migration Guide

For existing code:
1. No changes required for basic usage
2. Add `project_path` and `environment` parameters for better control
3. Use `send_input()` for interactive commands
4. Call `cleanup()` when shutting down to ensure proper resource cleanup