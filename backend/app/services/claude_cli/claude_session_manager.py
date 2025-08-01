"""Enhanced session manager for Claude CLI sessions with PTY integration."""

import asyncio
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set

from app.core.logging_config import get_logger
from app.models.schemas import CommandResponse, SessionInfo
from app.services.claude_cli.claude_session import (
    ClaudeCliSession,
    SessionConfig,
    SessionOutput,
    SessionState,
)
from app.services.claude_cli.pty_manager import PtyManager
from app.services.session_manager import SessionManager

logger = get_logger(__name__)


class ClaudeSessionManager(SessionManager):
    """
    Enhanced session manager that manages Claude CLI sessions with PTY support.
    
    Extends the base SessionManager to add:
    - Claude CLI session lifecycle management
    - PTY process management per session
    - Task-to-session mapping
    - Output streaming capabilities
    - Resource isolation between sessions
    """
    
    def __init__(self):
        super().__init__()
        
        # Claude-specific components
        self.pty_manager = PtyManager()
        self.claude_sessions: Dict[str, ClaudeCliSession] = {}
        self.task_to_session: Dict[str, str] = {}  # task_id -> session_id
        self._session_lock = asyncio.Lock()
        
        # Output callbacks registry
        self._output_callbacks: Dict[str, List[Callable[[str, SessionOutput], None]]] = {}
        
        logger.info("Initialized Claude session manager")
    
    async def start(self) -> None:
        """Start the session manager and related services."""
        await super().start()
        logger.info("Started Claude session manager")
    
    async def stop(self) -> None:
        """Stop the session manager and cleanup all sessions."""
        logger.info("Stopping Claude session manager")
        
        # Terminate all Claude sessions
        async with self._session_lock:
            sessions = list(self.claude_sessions.values())
            for session in sessions:
                try:
                    await session.terminate()
                    await session.cleanup()
                except Exception as e:
                    logger.error(
                        "Error terminating session",
                        session_id=session.session_id,
                        error=str(e)
                    )
        
        # Clean up PTY manager
        await self.pty_manager.cleanup_all()
        
        # Stop base session manager
        await super().stop()
        
        logger.info("Stopped Claude session manager")
    
    async def create_claude_session(
        self,
        config: SessionConfig,
        output_callback: Optional[Callable[[SessionOutput], None]] = None
    ) -> ClaudeCliSession:
        """
        Create a new Claude CLI session.
        
        Args:
            config: Session configuration
            output_callback: Callback for output streaming
            
        Returns:
            Created Claude CLI session
            
        Raises:
            RuntimeError: If session creation fails
        """
        async with self._session_lock:
            # Check if session already exists
            if config.session_id in self.claude_sessions:
                raise RuntimeError(
                    f"Session {config.session_id} already exists"
                )
            
            # Create base session info
            session_info = await self.create_session(config.session_id)
            
            # Create Claude CLI session
            claude_session = ClaudeCliSession(
                config=config,
                pty_manager=self.pty_manager,
                output_callback=output_callback
            )
            
            # Initialize the session
            try:
                await claude_session.initialize()
                
                # Store session
                self.claude_sessions[config.session_id] = claude_session
                
                # Map task to session if task_id provided
                if config.task_id:
                    self.task_to_session[config.task_id] = config.session_id
                
                # Register output callback
                if output_callback:
                    if config.session_id not in self._output_callbacks:
                        self._output_callbacks[config.session_id] = []
                    self._output_callbacks[config.session_id].append(
                        lambda output: output_callback(output)
                    )
                
                logger.info(
                    "Created Claude CLI session",
                    session_id=config.session_id,
                    task_id=config.task_id
                )
                
                return claude_session
                
            except Exception as e:
                # Clean up on failure
                await claude_session.cleanup()
                await self.delete_session(config.session_id)
                raise RuntimeError(f"Failed to create Claude session: {e}")
    
    async def get_claude_session(self, session_id: str) -> Optional[ClaudeCliSession]:
        """
        Get a Claude CLI session by ID.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Claude CLI session if found, None otherwise
        """
        async with self._session_lock:
            return self.claude_sessions.get(session_id)
    
    async def get_session_by_task(self, task_id: str) -> Optional[ClaudeCliSession]:
        """
        Get a Claude CLI session by task ID.
        
        Args:
            task_id: Task identifier
            
        Returns:
            Claude CLI session if found, None otherwise
        """
        session_id = self.task_to_session.get(task_id)
        if session_id:
            return await self.get_claude_session(session_id)
        return None
    
    async def send_command_to_session(
        self,
        session_id: str,
        command: str,
        timeout: Optional[int] = None
    ) -> CommandResponse:
        """
        Send a command to a Claude CLI session.
        
        Args:
            session_id: Session identifier
            command: Command to execute
            timeout: Command timeout in seconds
            
        Returns:
            Command response
            
        Raises:
            ValueError: If session not found
            RuntimeError: If session not ready
        """
        claude_session = await self.get_claude_session(session_id)
        if not claude_session:
            raise ValueError(f"Session {session_id} not found")
        
        if not claude_session.is_ready:
            raise RuntimeError(
                f"Session {session_id} not ready (state: {claude_session.state})"
            )
        
        # Create command response
        command_response = CommandResponse(
            command_id=str(uuid.uuid4()),
            session_id=session_id,
            command=command,
            status=CommandStatus.RUNNING,
            output=[],
            started_at=datetime.utcnow()
        )
        
        try:
            # Send command to Claude session
            command_id = await claude_session.send_command(command)
            command_response.command_id = command_id
            
            # Add to history
            await self.add_command_to_history(session_id, command_response)
            
            # Set up timeout if specified
            if timeout:
                asyncio.create_task(
                    self._handle_command_timeout(session_id, command_id, timeout)
                )
            
            return command_response
            
        except Exception as e:
            command_response.status = CommandStatus.FAILED
            command_response.error = str(e)
            command_response.completed_at = datetime.utcnow()
            
            # Update history
            await self.update_command_in_history(
                session_id,
                command_response.command_id,
                command_response
            )
            
            raise
    
    async def _handle_command_timeout(
        self,
        session_id: str,
        command_id: str,
        timeout: int
    ) -> None:
        """Handle command timeout."""
        try:
            await asyncio.sleep(timeout)
            
            # Check if command is still active
            claude_session = await self.get_claude_session(session_id)
            if claude_session and command_id in claude_session._active_commands:
                # Interrupt the command
                await claude_session.interrupt()
                
                logger.warning(
                    "Command timed out",
                    session_id=session_id,
                    command_id=command_id,
                    timeout=timeout
                )
                
        except asyncio.CancelledError:
            pass
    
    async def get_session_output(
        self,
        session_id: str,
        since: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> List[SessionOutput]:
        """
        Get output from a Claude CLI session.
        
        Args:
            session_id: Session identifier
            since: Get output since this timestamp
            limit: Maximum number of outputs
            
        Returns:
            List of session outputs
            
        Raises:
            ValueError: If session not found
        """
        claude_session = await self.get_claude_session(session_id)
        if not claude_session:
            raise ValueError(f"Session {session_id} not found")
        
        return await claude_session.get_output(since=since, limit=limit)
    
    async def resize_session_terminal(
        self,
        session_id: str,
        cols: int,
        rows: int
    ) -> None:
        """
        Resize a session's terminal.
        
        Args:
            session_id: Session identifier
            cols: Number of columns
            rows: Number of rows
            
        Raises:
            ValueError: If session not found
        """
        claude_session = await self.get_claude_session(session_id)
        if not claude_session:
            raise ValueError(f"Session {session_id} not found")
        
        await claude_session.resize_terminal(cols, rows)
    
    async def interrupt_session(self, session_id: str) -> None:
        """
        Send interrupt signal to a session.
        
        Args:
            session_id: Session identifier
            
        Raises:
            ValueError: If session not found
        """
        claude_session = await self.get_claude_session(session_id)
        if not claude_session:
            raise ValueError(f"Session {session_id} not found")
        
        await claude_session.interrupt()
    
    async def terminate_claude_session(
        self,
        session_id: str,
        force: bool = False
    ) -> None:
        """
        Terminate a Claude CLI session.
        
        Args:
            session_id: Session identifier
            force: Force termination
            
        Raises:
            ValueError: If session not found
        """
        async with self._session_lock:
            claude_session = self.claude_sessions.get(session_id)
            if not claude_session:
                raise ValueError(f"Session {session_id} not found")
            
            # Terminate session
            await claude_session.terminate(force=force)
            await claude_session.cleanup()
            
            # Remove from tracking
            del self.claude_sessions[session_id]
            
            # Remove task mapping
            if claude_session.task_id in self.task_to_session:
                del self.task_to_session[claude_session.task_id]
            
            # Remove output callbacks
            if session_id in self._output_callbacks:
                del self._output_callbacks[session_id]
            
            logger.info(
                "Terminated Claude session",
                session_id=session_id,
                force=force
            )
    
    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session and its Claude CLI session if exists.
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if deleted, False if not found
        """
        # Terminate Claude session if exists
        try:
            await self.terminate_claude_session(session_id, force=True)
        except ValueError:
            # Claude session doesn't exist, continue with base deletion
            pass
        
        # Delete base session
        return await super().delete_session(session_id)
    
    async def list_claude_sessions(self) -> List[Dict[str, Any]]:
        """
        List all active Claude CLI sessions.
        
        Returns:
            List of session information
        """
        async with self._session_lock:
            sessions = []
            for session_id, claude_session in self.claude_sessions.items():
                sessions.append(claude_session.get_info())
            return sessions
    
    async def get_claude_session_stats(self) -> Dict[str, Any]:
        """
        Get statistics for Claude CLI sessions.
        
        Returns:
            Session statistics
        """
        async with self._session_lock:
            total_sessions = len(self.claude_sessions)
            
            state_counts = {}
            for state in SessionState:
                state_counts[state.value] = 0
            
            active_commands = 0
            total_output_size = 0
            
            for claude_session in self.claude_sessions.values():
                state_counts[claude_session.state.value] += 1
                active_commands += len(claude_session._active_commands)
                total_output_size += len(claude_session.output_buffer)
            
            return {
                "total_claude_sessions": total_sessions,
                "state_counts": state_counts,
                "active_commands": active_commands,
                "total_output_buffer_size": total_output_size,
                "task_mappings": len(self.task_to_session)
            }
    
    async def register_output_callback(
        self,
        session_id: str,
        callback: Callable[[str, SessionOutput], None]
    ) -> None:
        """
        Register an output callback for a session.
        
        Args:
            session_id: Session identifier
            callback: Callback function
        """
        if session_id not in self._output_callbacks:
            self._output_callbacks[session_id] = []
        self._output_callbacks[session_id].append(callback)
    
    async def unregister_output_callback(
        self,
        session_id: str,
        callback: Callable[[str, SessionOutput], None]
    ) -> None:
        """
        Unregister an output callback for a session.
        
        Args:
            session_id: Session identifier
            callback: Callback function
        """
        if session_id in self._output_callbacks:
            try:
                self._output_callbacks[session_id].remove(callback)
            except ValueError:
                pass
    
    async def broadcast_to_session_callbacks(
        self,
        session_id: str,
        output: SessionOutput
    ) -> None:
        """
        Broadcast output to all registered callbacks for a session.
        
        Args:
            session_id: Session identifier
            output: Session output
        """
        if session_id in self._output_callbacks:
            for callback in self._output_callbacks[session_id]:
                try:
                    callback(session_id, output)
                except Exception as e:
                    logger.error(
                        "Error in output callback",
                        session_id=session_id,
                        error=str(e)
                    )
    
    async def cleanup_expired_claude_sessions(self) -> None:
        """Clean up expired Claude CLI sessions."""
        async with self._session_lock:
            expired_sessions = []
            
            for session_id, claude_session in self.claude_sessions.items():
                # Check if session is terminated or in error state
                if claude_session.state in (SessionState.TERMINATED, SessionState.ERROR):
                    expired_sessions.append(session_id)
                    continue
                
                # Check if base session is expired
                base_session = await self.get_session(session_id)
                if not base_session or not base_session.is_active:
                    expired_sessions.append(session_id)
            
            # Clean up expired sessions
            for session_id in expired_sessions:
                try:
                    await self.terminate_claude_session(session_id, force=True)
                except Exception as e:
                    logger.error(
                        "Error cleaning up expired session",
                        session_id=session_id,
                        error=str(e)
                    )
        
        if expired_sessions:
            logger.info(
                "Cleaned up expired Claude sessions",
                count=len(expired_sessions)
            )


# Import after class definition to avoid circular import
import uuid
from app.models.schemas import CommandStatus