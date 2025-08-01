# Phase 1: Core PTY Infrastructure Implementation

## Overview
This phase implements the foundational PTY (Pseudo-Terminal) infrastructure required for proper Claude CLI integration. The PTY layer enables full terminal emulation, supporting interactive commands, ANSI escape sequences, and proper signal handling.

## Components to Implement

### 1. PtyManager Class (`app/services/claude_cli/pty_manager.py`)

```python
import os
import pty
import asyncio
import fcntl
import termios
import struct
from typing import Optional, Tuple, Dict, Any
import signal

class PtyManager:
    """
    Manages PTY (Pseudo-Terminal) instances for proper terminal emulation.
    Provides full terminal capabilities including:
    - ANSI escape sequences
    - Terminal resizing
    - Signal handling
    - Interactive prompts
    """
    
    def __init__(self):
        self.logger = get_logger(__name__)
        self._processes: Dict[int, PtyProcess] = {}
    
    async def create_pty(
        self,
        command: List[str],
        env: Dict[str, str],
        cwd: str,
        size: Tuple[int, int] = (80, 24)
    ) -> PtyProcess:
        """Create new PTY process with proper terminal setup."""
        
    async def resize_pty(
        self,
        process: PtyProcess,
        cols: int,
        rows: int
    ) -> None:
        """Resize terminal window dimensions."""
        
    async def write_to_pty(
        self,
        process: PtyProcess,
        data: bytes
    ) -> None:
        """Write data to PTY stdin with proper encoding."""
        
    async def read_from_pty(
        self,
        process: PtyProcess,
        timeout: float = 0.1
    ) -> Optional[bytes]:
        """Read data from PTY stdout with non-blocking I/O."""
```

### 2. PtyProcess Wrapper (`app/services/claude_cli/pty_process.py`)

```python
class PtyProcess:
    """
    Wrapper for a PTY subprocess with async I/O support.
    Handles the low-level PTY operations and process management.
    """
    
    def __init__(self, pid: int, master_fd: int, slave_fd: int):
        self.pid = pid
        self.master_fd = master_fd
        self.slave_fd = slave_fd
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.is_alive = True
        self.exit_code: Optional[int] = None
        
    async def setup_async_io(self):
        """Setup async readers/writers for the PTY."""
        
    async def send_signal(self, sig: int):
        """Send signal to the process (e.g., SIGINT for Ctrl+C)."""
        
    async def wait(self) -> int:
        """Wait for process to complete and return exit code."""
        
    def cleanup(self):
        """Clean up file descriptors and resources."""
```

### 3. Terminal Utilities (`app/services/claude_cli/terminal_utils.py`)

```python
def set_terminal_size(fd: int, rows: int, cols: int):
    """Set terminal window size using ioctl."""
    
def make_raw(fd: int):
    """Put terminal in raw mode for proper PTY operation."""
    
def restore_terminal(fd: int, old_attrs):
    """Restore terminal to original state."""
    
def setup_pty_pair() -> Tuple[int, int]:
    """Create a PTY master/slave pair."""
```

## Implementation Details

### Step 1: Basic PTY Creation
```python
async def create_pty(self, command: List[str], env: Dict[str, str], cwd: str, size: Tuple[int, int] = (80, 24)) -> PtyProcess:
    # Create PTY pair
    master_fd, slave_fd = pty.openpty()
    
    # Set terminal size
    set_terminal_size(slave_fd, size[1], size[0])
    
    # Fork process
    pid = os.fork()
    
    if pid == 0:  # Child process
        # Set up slave PTY
        os.setsid()
        os.dup2(slave_fd, 0)  # stdin
        os.dup2(slave_fd, 1)  # stdout
        os.dup2(slave_fd, 2)  # stderr
        
        # Close file descriptors
        os.close(master_fd)
        os.close(slave_fd)
        
        # Execute command
        os.execvpe(command[0], command, env)
    
    else:  # Parent process
        os.close(slave_fd)
        
        # Create PtyProcess wrapper
        process = PtyProcess(pid, master_fd, slave_fd)
        await process.setup_async_io()
        
        self._processes[pid] = process
        return process
```

### Step 2: Async I/O Setup
```python
async def setup_async_io(self):
    """Convert PTY file descriptors to async streams."""
    # Make master_fd non-blocking
    flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
    fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    
    # Create async reader/writer
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    
    transport, _ = await loop.connect_read_pipe(
        lambda: protocol, 
        os.fdopen(self.master_fd, 'rb', 0)
    )
    
    writer = asyncio.StreamWriter(transport, protocol, reader, loop)
    
    self.reader = reader
    self.writer = writer
```

### Step 3: Terminal Resizing
```python
def set_terminal_size(fd: int, rows: int, cols: int):
    """Set terminal window size using ioctl."""
    # TIOCSWINSZ constant
    TIOCSWINSZ = 0x5414
    
    # Pack window size struct
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    
    # Set window size
    fcntl.ioctl(fd, TIOCSWINSZ, winsize)
```

### Step 4: Signal Handling
```python
async def send_signal(self, sig: int):
    """Send signal to the process."""
    try:
        os.kill(self.pid, sig)
        self.logger.debug(f"Sent signal {sig} to process {self.pid}")
    except ProcessLookupError:
        self.logger.warning(f"Process {self.pid} not found")
        self.is_alive = False
```

## Testing Strategy

### Unit Tests (`tests/unit/services/test_pty_manager.py`)
```python
async def test_pty_creation():
    """Test basic PTY creation and cleanup."""
    
async def test_pty_write_read():
    """Test writing to and reading from PTY."""
    
async def test_pty_resize():
    """Test terminal resizing."""
    
async def test_pty_signal_handling():
    """Test sending signals to PTY process."""
    
async def test_pty_cleanup_on_exit():
    """Test proper cleanup when process exits."""
```

### Integration Tests
```python
async def test_echo_command():
    """Test simple echo command through PTY."""
    
async def test_interactive_python():
    """Test interactive Python session."""
    
async def test_ansi_escape_sequences():
    """Test ANSI color codes and cursor movement."""
```

## Error Handling

### Common PTY Errors
1. **PTY Creation Failure**: Handle ENXIO, ENOENT errors
2. **Fork Failure**: Handle resource exhaustion
3. **Read/Write Errors**: Handle EAGAIN, EINTR
4. **Process Death**: Detect and cleanup zombie processes

### Error Classes
```python
class PtyError(Exception):
    """Base PTY error"""

class PtyCreationError(PtyError):
    """Failed to create PTY"""

class PtyIOError(PtyError):
    """PTY I/O operation failed"""

class PtyProcessDiedError(PtyError):
    """PTY process died unexpectedly"""
```

## Performance Considerations

1. **Non-blocking I/O**: Always use non-blocking operations
2. **Buffer Management**: Limit output buffer size (10MB default)
3. **Read Timeouts**: Use short timeouts (100ms) for responsive streaming
4. **Process Limits**: Enforce maximum PTY processes per user

## Security Considerations

1. **PTY Isolation**: Each PTY runs in separate process
2. **Resource Limits**: Apply ulimits to PTY processes
3. **Input Validation**: Sanitize data before writing to PTY
4. **Signal Restrictions**: Only allow safe signals (SIGINT, SIGTERM)

## Next Steps

After completing Phase 1:
1. Verify PTY creation and basic I/O works
2. Test with simple commands (echo, cat, etc.)
3. Ensure proper cleanup on process exit
4. Move to Phase 2: Session Management