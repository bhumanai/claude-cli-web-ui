"""Command execution service for running Claude CLI commands."""

import asyncio
import json
import os
import shlex
import signal
import uuid
from datetime import datetime
from typing import AsyncIterator, Dict, List, Optional, Set, Callable

import psutil
from pydantic import ValidationError

from app.config import get_settings
from app.core.logging_config import get_logger
from app.models.schemas import (
    CommandResponse,
    CommandStatus,
    OutputMessage,
    OutputType,
)
from app.services.claude_cli.claude_session import (
    ClaudeCliSession,
    SessionConfig,
    SessionState,
    SessionOutput,
)
from app.services.claude_cli.pty_manager import PtyManager
from app.services.claude_cli.security import CommandSanitizer

logger = get_logger(__name__)


class CommandExecutor:
    """Handles execution of Claude CLI commands with PTY-based sessions and real-time output streaming."""
    
    def __init__(self):
        self.settings = get_settings()
        self.pty_manager = PtyManager()
        self.command_sanitizer = CommandSanitizer()
        self.running_commands: Dict[str, ClaudeCliSession] = {}
        self.command_sessions: Dict[str, ClaudeCliSession] = {}  # Track session by command_id
        self.command_semaphore = asyncio.Semaphore(self.settings.MAX_CONCURRENT_COMMANDS)
        self._session_output_buffers: Dict[str, List[SessionOutput]] = {}  # Buffer output per command
    
    async def execute_command(
        self,
        command: str,
        session_id: str,
        timeout: Optional[int] = None,
        project_path: Optional[str] = None,
        environment: Optional[Dict[str, str]] = None
    ) -> AsyncIterator[CommandResponse]:
        """
        Execute a Claude CLI command using PTY session and yield real-time updates.
        
        Args:
            command: The command to execute
            session_id: Session identifier
            timeout: Command timeout in seconds
            project_path: Working directory for the command
            environment: Additional environment variables
            
        Yields:
            CommandResponse objects with real-time updates
        """
        command_id = str(uuid.uuid4())
        timeout = timeout or self.settings.CLAUDE_CLI_TIMEOUT
        
        # Initial response
        response = CommandResponse(
            command_id=command_id,
            session_id=session_id,
            command=command,
            status=CommandStatus.PENDING,
            started_at=datetime.utcnow()
        )
        
        logger.info("Starting command execution", 
                   command_id=command_id, 
                   session_id=session_id, 
                   command=command[:100])
        
        claude_session: Optional[ClaudeCliSession] = None
        
        try:
            async with self.command_semaphore:
                # Enhanced command validation using CommandSanitizer
                is_valid, sanitized_command, error_msg = self.command_sanitizer.sanitize_command(command)
                if not is_valid:
                    response.status = CommandStatus.FAILED
                    response.error = error_msg or "Invalid or potentially dangerous command"
                    response.completed_at = datetime.utcnow()
                    logger.warning("Command blocked by sanitizer", command=command[:100], error=error_msg)
                    yield response
                    return
                
                # Use sanitized command
                command = sanitized_command
                
                # Initialize output buffer for this command
                self._session_output_buffers[command_id] = []
                
                # Create output callback
                def output_callback(output: SessionOutput):
                    """Callback to handle session output."""
                    self._session_output_buffers[command_id].append(output)
                
                # Create session configuration
                session_config = SessionConfig(
                    session_id=session_id,
                    project_path=project_path or os.getcwd(),
                    environment=environment or {},
                    timeout=timeout,
                    terminal_size=(120, 40),  # Standard terminal size
                    metadata={"command_id": command_id}
                )
                
                # Create Claude CLI session
                claude_session = ClaudeCliSession(
                    config=session_config,
                    pty_manager=self.pty_manager,
                    output_callback=output_callback
                )
                
                # Initialize the session
                await claude_session.initialize()
                
                # Track the session
                self.running_commands[command_id] = claude_session
                self.command_sessions[command_id] = claude_session
                
                response.status = CommandStatus.RUNNING
                yield response
                
                # For Claude CLI commands starting with '/', send directly as input
                # Otherwise, treat as regular commands
                if command.strip().startswith('/'):
                    # Send slash command directly to the session
                    await claude_session.send_input(command + '\n')
                else:
                    # Send as a regular command
                    await claude_session.send_command(command)
                
                # Stream output with timeout
                async for updated_response in self._stream_pty_output(
                    claude_session, command_id, response, timeout
                ):
                    yield updated_response
                    
        except asyncio.TimeoutError:
            logger.warning("Command timed out", command_id=command_id)
            response.status = CommandStatus.FAILED
            response.error = f"Command timed out after {timeout} seconds"
            response.completed_at = datetime.utcnow()
            yield response
            
        except Exception as e:
            logger.error("Command execution failed", 
                        command_id=command_id, 
                        error=str(e))
            response.status = CommandStatus.FAILED
            response.error = str(e)
            response.completed_at = datetime.utcnow()
            yield response
            
        finally:
            # Cleanup
            if command_id in self.running_commands:
                del self.running_commands[command_id]
            
            if command_id in self._session_output_buffers:
                del self._session_output_buffers[command_id]
                
            if claude_session:
                try:
                    await claude_session.terminate()
                    await claude_session.cleanup()
                except Exception as e:
                    logger.error("Error cleaning up session", error=str(e))
    
    async def cancel_command(self, command_id: str) -> bool:
        """
        Cancel a running command.
        
        Args:
            command_id: The command to cancel
            
        Returns:
            True if command was cancelled, False if not found
        """
        if command_id not in self.running_commands:
            return False
        
        session = self.running_commands[command_id]
        
        try:
            # Send interrupt signal first (Ctrl+C)
            await session.interrupt()
            
            # Wait briefly for graceful shutdown
            await asyncio.sleep(2.0)
            
            # If still running, terminate the session
            if session.is_active:
                await session.terminate(force=False)
                
                # Wait for termination
                try:
                    await asyncio.wait_for(
                        self._wait_for_session_termination(session), 
                        timeout=5.0
                    )
                except asyncio.TimeoutError:
                    # Force terminate if still alive
                    await session.terminate(force=True)
            
            logger.info("Command cancelled successfully", command_id=command_id)
            return True
            
        except Exception as e:
            logger.error("Failed to cancel command", 
                        command_id=command_id, 
                        error=str(e))
            return False
    
    async def _wait_for_session_termination(self, session: ClaudeCliSession) -> None:
        """Wait for session to reach terminated state."""
        while session.state != SessionState.TERMINATED:
            await asyncio.sleep(0.1)
    
    async def get_running_commands(self) -> List[str]:
        """Get list of currently running command IDs."""
        return list(self.running_commands.keys())
    
    def _is_valid_command(self, command: str) -> bool:
        """
        Validate that the command is safe to execute.
        
        Args:
            command: Command to validate
            
        Returns:
            True if command is valid and safe
        """
        # Remove leading/trailing whitespace
        command = command.strip()
        
        if not command:
            return False
        
        # Dangerous commands to block
        dangerous_patterns = [
            'rm -rf',
            'sudo',
            'chmod 777',
            'dd if=',
            'mkfs',
            'fdisk',
            '> /dev/',
            'curl | sh',
            'wget | sh',
            'eval',
            'exec',
        ]
        
        command_lower = command.lower()
        for pattern in dangerous_patterns:
            if pattern in command_lower:
                logger.warning("Blocked dangerous command", 
                             command=command[:100], 
                             pattern=pattern)
                return False
        
        return True
    
    def _build_command(self, command: str) -> List[str]:
        """
        Build the full command to execute.
        
        Args:
            command: User-provided command
            
        Returns:
            List of command arguments
        """
        command = command.strip()
        
        # Handle Claude CLI specific commands
        if command.startswith('/'):
            # Direct Claude CLI commands like /plan, /smart-task, etc.
            # These are sent directly to the Claude CLI session
            return ['claude', 'code', command]
        
        # If command already starts with claude, use as-is
        if command.startswith('claude'):
            return shlex.split(command)
        
        # Otherwise, prepend claude command
        claude_cmd = self.settings.CLAUDE_CLI_COMMAND
        if command.startswith('code'):
            # Handle 'code' shorthand
            return [claude_cmd, 'code'] + shlex.split(command[4:].strip())
        else:
            # Assume it's a claude code command
            return [claude_cmd, 'code'] + shlex.split(command)
    
    async def _stream_pty_output(
        self,
        session: ClaudeCliSession,
        command_id: str,
        response: CommandResponse,
        timeout: int
    ) -> AsyncIterator[CommandResponse]:
        """
        Stream PTY session output in real-time.
        
        Args:
            session: The Claude CLI session
            command_id: Command ID for output buffer
            response: Initial response object
            timeout: Command timeout
            
        Yields:
            Updated CommandResponse objects
        """
        try:
            # Run with timeout
            async with asyncio.timeout(timeout):
                last_output_index = 0
                command_completed = False
                
                while not command_completed and session.is_active:
                    # Check for new output in buffer
                    if command_id in self._session_output_buffers:
                        buffer = self._session_output_buffers[command_id]
                        
                        if len(buffer) > last_output_index:
                            # Process new output
                            new_outputs = buffer[last_output_index:]
                            
                            for session_output in new_outputs:
                                # Convert SessionOutput to OutputMessage
                                output_type = self._map_output_type(session_output.type)
                                output_msg = OutputMessage(
                                    type=output_type,
                                    content=session_output.content,
                                    timestamp=session_output.timestamp
                                )
                                response.output.append(output_msg)
                                
                                # Check for command completion patterns
                                if self._is_command_complete(session_output.content):
                                    command_completed = True
                                    
                                # Check for error patterns
                                if self._is_error_output(session_output.content):
                                    response.status = CommandStatus.FAILED
                                    if not response.error:
                                        response.error = self._extract_error_message(session_output.content)
                            
                            last_output_index = len(buffer)
                            yield response
                    
                    # Check session state
                    if session.state == SessionState.ERROR:
                        response.status = CommandStatus.FAILED
                        response.error = session.error_message or "Session error"
                        response.completed_at = datetime.utcnow()
                        yield response
                        return
                    
                    # If no active commands in session, consider it complete
                    if session.state == SessionState.IDLE and not session._active_commands:
                        command_completed = True
                    
                    # Small delay to prevent busy waiting
                    if not command_completed:
                        await asyncio.sleep(0.1)
                
                # Command completed
                response.status = CommandStatus.COMPLETED if response.status != CommandStatus.FAILED else response.status
                response.completed_at = datetime.utcnow()
                response.exit_code = 0 if response.status == CommandStatus.COMPLETED else 1
                yield response
                
        except asyncio.TimeoutError:
            # Interrupt and terminate on timeout
            try:
                await session.interrupt()
                await asyncio.sleep(1)
                await session.terminate(force=True)
            except:
                pass
            raise
    
    def _map_output_type(self, session_type: str) -> OutputType:
        """Map session output type to OutputType enum."""
        mapping = {
            "stdout": OutputType.STDOUT,
            "stderr": OutputType.STDERR,
            "system": OutputType.SYSTEM,
            "error": OutputType.ERROR
        }
        return mapping.get(session_type, OutputType.STDOUT)
    
    def _is_command_complete(self, content: str) -> bool:
        """
        Check if output indicates command completion.
        
        Args:
            content: Output content to check
            
        Returns:
            True if command appears complete
        """
        completion_patterns = [
            "Command completed",
            "Task completed",
            "Done.",
            "Finished.",
            "✓",  # Success checkmark
            "✅",  # Success emoji
            "Human:",  # Claude waiting for next input
            "Assistant:",  # Claude response complete
            r"^\s*$",  # Empty line after output
        ]
        
        content_lower = content.lower().strip()
        for pattern in completion_patterns:
            if pattern.lower() in content_lower:
                return True
                
        return False
    
    def _is_error_output(self, content: str) -> bool:
        """
        Check if output indicates an error.
        
        Args:
            content: Output content to check
            
        Returns:
            True if output appears to be an error
        """
        error_patterns = [
            "error:",
            "failed:",
            "exception:",
            "traceback",
            "fatal:",
            "❌",  # Error emoji
            "⚠️",  # Warning emoji
            "permission denied",
            "command not found",
            "no such file",
        ]
        
        content_lower = content.lower()
        for pattern in error_patterns:
            if pattern in content_lower:
                return True
                
        return False
    
    def _extract_error_message(self, content: str) -> str:
        """
        Extract error message from output content.
        
        Args:
            content: Output content containing error
            
        Returns:
            Extracted error message
        """
        # Try to extract specific error message
        lines = content.strip().split('\n')
        for line in lines:
            line_lower = line.lower()
            if any(pattern in line_lower for pattern in ["error:", "failed:", "exception:"]):
                return line.strip()
        
        # Return first non-empty line as fallback
        for line in lines:
            if line.strip():
                return line.strip()
                
        return "Command execution failed"
    
    async def send_input(self, command_id: str, input_data: str) -> bool:
        """
        Send input to an active command session.
        
        Args:
            command_id: Command ID
            input_data: Input data to send
            
        Returns:
            True if input was sent successfully
        """
        if command_id not in self.command_sessions:
            logger.warning("Command session not found", command_id=command_id)
            return False
            
        session = self.command_sessions[command_id]
        
        try:
            await session.send_input(input_data)
            logger.debug("Sent input to command", command_id=command_id, input_length=len(input_data))
            return True
        except Exception as e:
            logger.error("Failed to send input", command_id=command_id, error=str(e))
            return False
    
    async def resize_terminal(self, command_id: str, cols: int, rows: int) -> bool:
        """
        Resize terminal for an active command session.
        
        Args:
            command_id: Command ID
            cols: Number of columns
            rows: Number of rows
            
        Returns:
            True if resize was successful
        """
        if command_id not in self.command_sessions:
            return False
            
        session = self.command_sessions[command_id]
        
        try:
            await session.resize_terminal(cols, rows)
            return True
        except Exception as e:
            logger.error("Failed to resize terminal", command_id=command_id, error=str(e))
            return False
    
    async def cleanup(self) -> None:
        """Clean up all active sessions and resources."""
        logger.info("Cleaning up command executor")
        
        # Cancel all running commands
        command_ids = list(self.running_commands.keys())
        for command_id in command_ids:
            try:
                await self.cancel_command(command_id)
            except Exception as e:
                logger.error("Error cancelling command", command_id=command_id, error=str(e))
        
        # Clean up PTY manager
        try:
            await self.pty_manager.cleanup_all()
        except Exception as e:
            logger.error("Error cleaning up PTY manager", error=str(e))
        
        # Clear all tracking dictionaries
        self.running_commands.clear()
        self.command_sessions.clear()
        self._session_output_buffers.clear()
        
        logger.info("Command executor cleanup complete")