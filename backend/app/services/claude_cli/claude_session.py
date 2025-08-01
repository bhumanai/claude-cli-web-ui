"""Claude CLI session management with state machine and PTY integration."""

import asyncio
import enum
import json
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set

from app.core.logging_config import get_logger
from app.services.claude_cli.pty_manager import PtyManager, PtyError
from app.services.claude_cli.pty_process import PtyProcess

logger = get_logger(__name__)


class SessionState(str, enum.Enum):
    """Claude CLI session states."""
    INITIALIZING = "initializing"
    AUTHENTICATING = "authenticating"
    READY = "ready"
    BUSY = "busy"
    IDLE = "idle"
    TERMINATING = "terminating"
    TERMINATED = "terminated"
    ERROR = "error"


class SessionConfig:
    """Configuration for Claude CLI session."""
    
    def __init__(
        self,
        session_id: Optional[str] = None,
        task_id: Optional[str] = None,
        project_path: Optional[str] = None,
        environment: Optional[Dict[str, str]] = None,
        timeout: int = 300,
        max_retries: int = 3,
        terminal_size: tuple[int, int] = (120, 40),
        auth_token: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.session_id = session_id or str(uuid.uuid4())
        self.task_id = task_id
        self.project_path = project_path or "."
        self.environment = environment or {}
        self.timeout = timeout
        self.max_retries = max_retries
        self.terminal_size = terminal_size  # (cols, rows)
        self.auth_token = auth_token
        self.metadata = metadata or {}
        self.created_at = datetime.utcnow()


class SessionOutput:
    """Container for session output data."""
    
    def __init__(self, output_type: str, content: str, timestamp: Optional[datetime] = None):
        self.type = output_type  # stdout, stderr, system
        self.content = content
        self.timestamp = timestamp or datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "type": self.type,
            "content": self.content,
            "timestamp": self.timestamp.isoformat()
        }


class ClaudeCliSession:
    """
    Manages a Claude CLI session with state machine, PTY integration, and output streaming.
    
    Each session represents an isolated Claude CLI instance with its own:
    - PTY process for proper terminal emulation
    - State management (INITIALIZING -> READY -> BUSY/IDLE -> TERMINATED)
    - Output capture and streaming
    - Authentication handling
    - Resource lifecycle management
    """
    
    def __init__(
        self,
        config: SessionConfig,
        pty_manager: PtyManager,
        output_callback: Optional[Callable[[SessionOutput], None]] = None
    ):
        self.config = config
        self.session_id = config.session_id
        self.task_id = config.task_id
        self.pty_manager = pty_manager
        self.output_callback = output_callback
        
        # State management
        self._state = SessionState.INITIALIZING
        self._state_lock = asyncio.Lock()
        self._state_transitions: List[tuple[SessionState, SessionState, datetime]] = []
        
        # PTY process
        self.pty_process: Optional[PtyProcess] = None
        self._pty_reader_task: Optional[asyncio.Task] = None
        
        # Output management
        self.output_buffer: List[SessionOutput] = []
        self._output_lock = asyncio.Lock()
        
        # Session metadata
        self.started_at: Optional[datetime] = None
        self.terminated_at: Optional[datetime] = None
        self.error_message: Optional[str] = None
        self.command_history: List[Dict[str, Any]] = []
        
        # Resource tracking
        self._cleanup_done = False
        self._active_commands: Set[str] = set()
        
        logger.info(
            "Created Claude CLI session",
            session_id=self.session_id,
            task_id=self.task_id,
            project_path=self.config.project_path
        )
    
    @property
    def state(self) -> SessionState:
        """Get current session state."""
        return self._state
    
    @property
    def is_active(self) -> bool:
        """Check if session is in an active state."""
        return self._state in (
            SessionState.READY,
            SessionState.BUSY,
            SessionState.IDLE,
            SessionState.AUTHENTICATING
        )
    
    @property
    def is_ready(self) -> bool:
        """Check if session is ready for commands."""
        return self._state in (SessionState.READY, SessionState.IDLE)
    
    async def _transition_state(self, new_state: SessionState) -> None:
        """
        Transition to a new state with validation.
        
        Args:
            new_state: Target state
            
        Raises:
            ValueError: If transition is invalid
        """
        async with self._state_lock:
            old_state = self._state
            
            # Validate state transition
            valid_transitions = {
                SessionState.INITIALIZING: {
                    SessionState.AUTHENTICATING,
                    SessionState.ERROR,
                    SessionState.TERMINATED
                },
                SessionState.AUTHENTICATING: {
                    SessionState.READY,
                    SessionState.ERROR,
                    SessionState.TERMINATED
                },
                SessionState.READY: {
                    SessionState.BUSY,
                    SessionState.IDLE,
                    SessionState.TERMINATING,
                    SessionState.ERROR
                },
                SessionState.BUSY: {
                    SessionState.READY,
                    SessionState.IDLE,
                    SessionState.TERMINATING,
                    SessionState.ERROR
                },
                SessionState.IDLE: {
                    SessionState.BUSY,
                    SessionState.READY,
                    SessionState.TERMINATING,
                    SessionState.ERROR
                },
                SessionState.TERMINATING: {
                    SessionState.TERMINATED,
                    SessionState.ERROR
                },
                SessionState.ERROR: {
                    SessionState.TERMINATING,
                    SessionState.TERMINATED
                },
                SessionState.TERMINATED: set()  # Terminal state
            }
            
            if new_state not in valid_transitions.get(old_state, set()):
                raise ValueError(
                    f"Invalid state transition: {old_state} -> {new_state}"
                )
            
            # Record transition
            self._state = new_state
            self._state_transitions.append((old_state, new_state, datetime.utcnow()))
            
            logger.info(
                "Session state transition",
                session_id=self.session_id,
                old_state=old_state.value,
                new_state=new_state.value
            )
    
    async def initialize(self) -> None:
        """
        Initialize the Claude CLI session by starting the PTY process.
        
        Raises:
            PtyError: If PTY creation fails
        """
        try:
            # Prepare environment
            env = dict(os.environ)
            env.update(self.config.environment)
            
            # Add Claude-specific environment variables
            env["CLAUDE_SESSION_ID"] = self.session_id
            if self.task_id:
                env["CLAUDE_TASK_ID"] = self.task_id
            
            # Create PTY process
            command = ["claude", "code"]  # Basic Claude CLI command
            self.pty_process = await self.pty_manager.create_pty(
                command=command,
                env=env,
                cwd=self.config.project_path,
                size=self.config.terminal_size
            )
            
            self.started_at = datetime.utcnow()
            
            # Start output reader
            self._pty_reader_task = asyncio.create_task(
                self._read_pty_output()
            )
            
            # Transition to authenticating if auth required
            if self.config.auth_token:
                await self._transition_state(SessionState.AUTHENTICATING)
                await self._authenticate()
            else:
                await self._transition_state(SessionState.READY)
            
            logger.info(
                "Initialized Claude CLI session",
                session_id=self.session_id,
                pid=self.pty_process.pid
            )
            
        except Exception as e:
            self.error_message = str(e)
            await self._transition_state(SessionState.ERROR)
            logger.error(
                "Failed to initialize session",
                session_id=self.session_id,
                error=str(e)
            )
            raise
    
    async def _authenticate(self) -> None:
        """Authenticate the Claude CLI session."""
        try:
            # Send auth token or perform authentication flow
            # This is a placeholder - actual implementation depends on Claude CLI auth
            if self.config.auth_token:
                await self.send_input(f"auth {self.config.auth_token}\n")
                
                # Wait for auth confirmation
                await asyncio.sleep(2)  # Simple wait, could be improved
                
            await self._transition_state(SessionState.READY)
            
        except Exception as e:
            self.error_message = f"Authentication failed: {e}"
            await self._transition_state(SessionState.ERROR)
            raise
    
    async def send_command(self, command: str) -> str:
        """
        Send a command to the Claude CLI session.
        
        Args:
            command: Command to execute
            
        Returns:
            Command ID for tracking
            
        Raises:
            RuntimeError: If session is not ready
        """
        if not self.is_ready:
            raise RuntimeError(
                f"Session not ready for commands (state: {self._state})"
            )
        
        command_id = str(uuid.uuid4())
        
        try:
            await self._transition_state(SessionState.BUSY)
            
            # Record command
            self.command_history.append({
                "id": command_id,
                "command": command,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "sent"
            })
            
            # Add to active commands
            self._active_commands.add(command_id)
            
            # Send command to PTY
            await self.send_input(command + "\n")
            
            logger.info(
                "Sent command to session",
                session_id=self.session_id,
                command_id=command_id,
                command_preview=command[:50] + "..." if len(command) > 50 else command
            )
            
            return command_id
            
        except Exception as e:
            self._active_commands.discard(command_id)
            await self._transition_state(SessionState.ERROR)
            raise
    
    async def send_input(self, data: str) -> None:
        """
        Send raw input to the PTY process.
        
        Args:
            data: Input data to send
        """
        if not self.pty_process or not self.pty_process.is_alive:
            raise RuntimeError("PTY process is not active")
        
        await self.pty_manager.write_to_pty(
            self.pty_process,
            data.encode("utf-8")
        )
    
    async def _read_pty_output(self) -> None:
        """Background task to read PTY output."""
        try:
            while self.is_active and self.pty_process and self.pty_process.is_alive:
                try:
                    # Read output with timeout
                    data = await self.pty_manager.read_from_pty(
                        self.pty_process,
                        timeout=0.1
                    )
                    
                    if data:
                        output = SessionOutput(
                            output_type="stdout",
                            content=data.decode("utf-8", errors="replace")
                        )
                        
                        await self._handle_output(output)
                    
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    logger.error(
                        "Error reading PTY output",
                        session_id=self.session_id,
                        error=str(e)
                    )
                    
        except asyncio.CancelledError:
            logger.debug("PTY reader task cancelled", session_id=self.session_id)
        except Exception as e:
            logger.error(
                "Fatal error in PTY reader",
                session_id=self.session_id,
                error=str(e)
            )
            self.error_message = str(e)
            await self._transition_state(SessionState.ERROR)
    
    async def _handle_output(self, output: SessionOutput) -> None:
        """
        Handle output from the PTY process.
        
        Args:
            output: Output data
        """
        async with self._output_lock:
            # Add to buffer
            self.output_buffer.append(output)
            
            # Limit buffer size
            max_buffer_size = 10000
            if len(self.output_buffer) > max_buffer_size:
                self.output_buffer = self.output_buffer[-max_buffer_size:]
        
        # Call output callback if provided
        if self.output_callback:
            try:
                self.output_callback(output)
            except Exception as e:
                logger.error(
                    "Error in output callback",
                    session_id=self.session_id,
                    error=str(e)
                )
        
        # Check for command completion patterns
        # This is simplified - real implementation would need better parsing
        if self._active_commands and "Command completed" in output.content:
            # Mark command as complete
            if self._active_commands:
                command_id = next(iter(self._active_commands))
                self._active_commands.discard(command_id)
                
                # Update command history
                for cmd in self.command_history:
                    if cmd["id"] == command_id:
                        cmd["status"] = "completed"
                        cmd["completed_at"] = datetime.utcnow().isoformat()
                        break
        
        # Update state if no active commands
        if not self._active_commands and self._state == SessionState.BUSY:
            await self._transition_state(SessionState.IDLE)
    
    async def get_output(
        self,
        since: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> List[SessionOutput]:
        """
        Get session output.
        
        Args:
            since: Get output since this timestamp
            limit: Maximum number of outputs to return
            
        Returns:
            List of session outputs
        """
        async with self._output_lock:
            outputs = self.output_buffer
            
            if since:
                outputs = [o for o in outputs if o.timestamp > since]
            
            if limit:
                outputs = outputs[-limit:]
            
            return outputs.copy()
    
    async def resize_terminal(self, cols: int, rows: int) -> None:
        """
        Resize the terminal window.
        
        Args:
            cols: Number of columns
            rows: Number of rows
        """
        if self.pty_process and self.pty_process.is_alive:
            await self.pty_manager.resize_pty(self.pty_process, cols, rows)
            self.config.terminal_size = (cols, rows)
            
            logger.debug(
                "Resized terminal",
                session_id=self.session_id,
                cols=cols,
                rows=rows
            )
    
    async def interrupt(self) -> None:
        """Send interrupt signal (Ctrl+C) to the session."""
        if self.pty_process and self.pty_process.is_alive:
            await self.pty_manager.send_signal(self.pty_process, signal.SIGINT)
            
            logger.info("Sent interrupt signal", session_id=self.session_id)
    
    async def terminate(self, force: bool = False) -> None:
        """
        Terminate the session.
        
        Args:
            force: Force termination without graceful shutdown
        """
        if self._state == SessionState.TERMINATED:
            return
        
        try:
            await self._transition_state(SessionState.TERMINATING)
            
            # Cancel reader task
            if self._pty_reader_task:
                self._pty_reader_task.cancel()
                try:
                    await self._pty_reader_task
                except asyncio.CancelledError:
                    pass
            
            # Terminate PTY process
            if self.pty_process:
                if not force:
                    # Try graceful shutdown first
                    await self.send_input("exit\n")
                    await asyncio.sleep(1)
                
                if self.pty_process.is_alive:
                    await self.pty_manager.send_signal(
                        self.pty_process,
                        signal.SIGTERM if not force else signal.SIGKILL
                    )
                
                # Wait for process to exit
                try:
                    await asyncio.wait_for(self.pty_process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    # Force kill if still alive
                    if self.pty_process.is_alive:
                        await self.pty_manager.send_signal(
                            self.pty_process,
                            signal.SIGKILL
                        )
            
            self.terminated_at = datetime.utcnow()
            await self._transition_state(SessionState.TERMINATED)
            
            logger.info(
                "Terminated session",
                session_id=self.session_id,
                force=force
            )
            
        except Exception as e:
            logger.error(
                "Error terminating session",
                session_id=self.session_id,
                error=str(e)
            )
            self.error_message = str(e)
            await self._transition_state(SessionState.ERROR)
    
    async def cleanup(self) -> None:
        """Clean up all session resources."""
        if self._cleanup_done:
            return
        
        self._cleanup_done = True
        
        try:
            # Ensure termination
            await self.terminate(force=True)
            
            # Clean up PTY process
            if self.pty_process:
                await self.pty_manager.cleanup_process(self.pty_process)
            
            # Clear buffers
            self.output_buffer.clear()
            self._active_commands.clear()
            
            logger.info("Cleaned up session", session_id=self.session_id)
            
        except Exception as e:
            logger.error(
                "Error during cleanup",
                session_id=self.session_id,
                error=str(e)
            )
    
    def get_info(self) -> Dict[str, Any]:
        """Get session information."""
        return {
            "session_id": self.session_id,
            "task_id": self.task_id,
            "state": self._state.value,
            "project_path": self.config.project_path,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "terminated_at": self.terminated_at.isoformat() if self.terminated_at else None,
            "error_message": self.error_message,
            "command_count": len(self.command_history),
            "active_commands": len(self._active_commands),
            "output_buffer_size": len(self.output_buffer),
            "pid": self.pty_process.pid if self.pty_process else None,
            "terminal_size": self.config.terminal_size,
            "metadata": self.config.metadata
        }
    
    def __del__(self):
        """Ensure cleanup on deletion."""
        if not self._cleanup_done:
            # Schedule cleanup in event loop if available
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self.cleanup())
            except:
                pass


# Import after class definition to avoid circular import
import os
import signal