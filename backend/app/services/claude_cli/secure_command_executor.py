"""Secure command execution service for Claude CLI with enhanced security measures."""

import asyncio
import os
import uuid
from datetime import datetime
from typing import AsyncIterator, Dict, Optional, List
from pathlib import Path

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
from app.services.claude_cli.security import (
    CommandSanitizer,
    EnvironmentSanitizer,
    PathValidator,
    SessionIsolator,
)

logger = get_logger(__name__)


class SecureCommandExecutor:
    """
    Secure command executor for Claude CLI with comprehensive security measures.
    
    Security features:
    - Command sanitization and validation
    - Environment variable filtering
    - Path restriction to project boundaries
    - Session isolation
    - Resource limits
    - Audit logging
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.pty_manager = PtyManager()
        
        # Security components
        self.command_sanitizer = CommandSanitizer()
        self.env_sanitizer = EnvironmentSanitizer()
        self.session_isolator = SessionIsolator()
        
        # Session management
        self.sessions: Dict[str, ClaudeCliSession] = {}
        self.session_paths: Dict[str, PathValidator] = {}
        
        # Resource limits
        self.command_semaphore = asyncio.Semaphore(self.settings.MAX_CONCURRENT_COMMANDS)
        self.session_limit_per_task = 5  # Max sessions per task
        self.max_output_size = 10 * 1024 * 1024  # 10MB max output
        
        # Audit log
        self.audit_log: List[Dict] = []
    
    async def create_session(
        self,
        task_id: str,
        project_path: str,
        session_id: Optional[str] = None
    ) -> str:
        """
        Create a new secure Claude CLI session.
        
        Args:
            task_id: Task identifier
            project_path: Project root directory
            session_id: Optional session ID
            
        Returns:
            Session ID
            
        Raises:
            ValueError: If security validation fails
        """
        session_id = session_id or str(uuid.uuid4())
        
        # Validate project path
        project_path = Path(project_path).resolve()
        if not project_path.exists() or not project_path.is_dir():
            raise ValueError(f"Invalid project path: {project_path}")
        
        # Check session limits
        task_sessions = sum(
            1 for s_id, session in self.sessions.items()
            if session.task_id == task_id and session.state != SessionState.TERMINATED
        )
        if task_sessions >= self.session_limit_per_task:
            raise ValueError(f"Session limit exceeded for task {task_id}")
        
        # Create path validator for this session
        self.session_paths[session_id] = PathValidator(str(project_path))
        
        # Create secure environment
        base_env = os.environ.copy()
        secure_env = self.env_sanitizer.sanitize_environment(
            base_env,
            allowed_vars={'CLAUDE_API_KEY', 'CLAUDE_PROJECT_PATH'}
        )
        
        # Add session-specific environment
        secure_env.update({
            'CLAUDE_SESSION_ID': session_id,
            'CLAUDE_TASK_ID': task_id,
            'CLAUDE_PROJECT_ROOT': str(project_path),
            'CLAUDE_SECURE_MODE': '1',  # Enable secure mode in Claude CLI
        })
        
        # Create session configuration
        config = SessionConfig(
            session_id=session_id,
            task_id=task_id,
            project_path=str(project_path),
            environment=secure_env,
            timeout=self.settings.CLAUDE_CLI_TIMEOUT,
            terminal_size=(120, 40),
        )
        
        # Create session with output callback
        def output_callback(output: SessionOutput):
            self._audit_output(session_id, output)
        
        session = ClaudeCliSession(
            config=config,
            pty_manager=self.pty_manager,
            output_callback=output_callback
        )
        
        # Initialize session
        await session.initialize()
        
        # Register session
        self.sessions[session_id] = session
        self.session_isolator.register_session(
            session_id, 
            session.pty_process.pid if session.pty_process else 0
        )
        
        # Audit log
        self._audit_log_action(
            action="session_created",
            session_id=session_id,
            task_id=task_id,
            project_path=str(project_path)
        )
        
        logger.info(
            "Created secure Claude CLI session",
            session_id=session_id,
            task_id=task_id
        )
        
        return session_id
    
    async def execute_command(
        self,
        command: str,
        session_id: str,
        timeout: Optional[int] = None
    ) -> AsyncIterator[CommandResponse]:
        """
        Execute a command in a secure Claude CLI session.
        
        Args:
            command: Command to execute
            session_id: Session identifier
            timeout: Optional timeout override
            
        Yields:
            CommandResponse objects with real-time updates
        """
        command_id = str(uuid.uuid4())
        
        # Get session
        session = self.sessions.get(session_id)
        if not session:
            response = CommandResponse(
                command_id=command_id,
                session_id=session_id,
                command=command,
                status=CommandStatus.FAILED,
                error="Session not found",
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow()
            )
            yield response
            return
        
        # Sanitize command
        is_valid, sanitized_command, error = self.command_sanitizer.sanitize_command(command)
        if not is_valid:
            response = CommandResponse(
                command_id=command_id,
                session_id=session_id,
                command=command,
                status=CommandStatus.FAILED,
                error=f"Command validation failed: {error}",
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow()
            )
            
            # Audit log security violation
            self._audit_log_action(
                action="command_blocked",
                session_id=session_id,
                command=command[:100],
                reason=error
            )
            
            yield response
            return
        
        # Execute with resource limits
        async with self.command_semaphore:
            try:
                # Initial response
                response = CommandResponse(
                    command_id=command_id,
                    session_id=session_id,
                    command=sanitized_command,
                    status=CommandStatus.RUNNING,
                    started_at=datetime.utcnow()
                )
                yield response
                
                # Audit log command execution
                self._audit_log_action(
                    action="command_executed",
                    session_id=session_id,
                    command_id=command_id,
                    command=sanitized_command[:100]
                )
                
                # Send command to session
                if sanitized_command.startswith('/'):
                    await session.send_input(sanitized_command + '\n')
                else:
                    await session.send_command(sanitized_command)
                
                # Stream output with size limits
                total_output_size = 0
                timeout = timeout or self.settings.CLAUDE_CLI_TIMEOUT
                start_time = asyncio.get_event_loop().time()
                
                while True:
                    # Check timeout
                    if asyncio.get_event_loop().time() - start_time > timeout:
                        response.status = CommandStatus.FAILED
                        response.error = f"Command timed out after {timeout} seconds"
                        response.completed_at = datetime.utcnow()
                        yield response
                        break
                    
                    # Get output from session
                    output_messages = await self._get_session_output(session, command_id)
                    
                    if output_messages:
                        for msg in output_messages:
                            # Check output size limit
                            total_output_size += len(msg.content)
                            if total_output_size > self.max_output_size:
                                response.status = CommandStatus.FAILED
                                response.error = "Output size limit exceeded"
                                response.completed_at = datetime.utcnow()
                                yield response
                                return
                            
                            # Add to response
                            if not response.output:
                                response.output = []
                            response.output.append(msg)
                        
                        yield response
                    
                    # Check if command completed
                    if session.state == SessionState.READY:
                        response.status = CommandStatus.COMPLETED
                        response.completed_at = datetime.utcnow()
                        yield response
                        break
                    
                    # Small delay to prevent tight loop
                    await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(
                    "Command execution failed",
                    command_id=command_id,
                    session_id=session_id,
                    error=str(e)
                )
                
                response.status = CommandStatus.FAILED
                response.error = f"Execution error: {str(e)}"
                response.completed_at = datetime.utcnow()
                yield response
    
    async def destroy_session(self, session_id: str) -> bool:
        """
        Destroy a Claude CLI session securely.
        
        Args:
            session_id: Session to destroy
            
        Returns:
            True if destroyed successfully
        """
        session = self.sessions.get(session_id)
        if not session:
            return False
        
        try:
            # Terminate session
            await session.terminate()
            
            # Clean up resources
            self.session_isolator.cleanup_session(session_id)
            
            # Remove from tracking
            del self.sessions[session_id]
            if session_id in self.session_paths:
                del self.session_paths[session_id]
            
            # Audit log
            self._audit_log_action(
                action="session_destroyed",
                session_id=session_id
            )
            
            logger.info("Destroyed session", session_id=session_id)
            return True
            
        except Exception as e:
            logger.error(
                "Failed to destroy session",
                session_id=session_id,
                error=str(e)
            )
            return False
    
    async def _get_session_output(
        self, 
        session: ClaudeCliSession, 
        command_id: str
    ) -> List[OutputMessage]:
        """Get and convert session output to OutputMessage objects."""
        messages = []
        
        # This is a simplified version - actual implementation would
        # read from the session's output buffer
        if hasattr(session, 'output_buffer') and session.output_buffer:
            for output in session.output_buffer:
                msg = OutputMessage(
                    type=OutputType.STDOUT if output.type == "stdout" else OutputType.STDERR,
                    content=output.content,
                    timestamp=output.timestamp
                )
                messages.append(msg)
            
            # Clear processed output
            session.output_buffer.clear()
        
        return messages
    
    def _audit_log_action(self, action: str, **kwargs):
        """Log security-relevant actions for audit trail."""
        entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'action': action,
            **kwargs
        }
        self.audit_log.append(entry)
        
        # Also log to system logger
        logger.info(f"Security audit: {action}", **kwargs)
    
    def _audit_output(self, session_id: str, output: SessionOutput):
        """Audit session output for security monitoring."""
        # Check for suspicious patterns in output
        suspicious_patterns = [
            'permission denied',
            'authentication failed',
            'access denied',
            'sudo password',
            'root@',
        ]
        
        content_lower = output.content.lower()
        for pattern in suspicious_patterns:
            if pattern in content_lower:
                self._audit_log_action(
                    action="suspicious_output",
                    session_id=session_id,
                    pattern=pattern,
                    content_preview=output.content[:100]
                )
    
    def get_session_info(self, session_id: str) -> Optional[Dict]:
        """Get information about a session."""
        session = self.sessions.get(session_id)
        if not session:
            return None
        
        return {
            'session_id': session_id,
            'task_id': session.task_id,
            'state': session.state.value,
            'created_at': session.config.created_at.isoformat(),
            'project_path': session.config.project_path,
            'uptime': (datetime.utcnow() - session.config.created_at).total_seconds()
        }
    
    def list_sessions(self, task_id: Optional[str] = None) -> List[Dict]:
        """List all active sessions, optionally filtered by task."""
        sessions = []
        
        for session_id, session in self.sessions.items():
            if task_id is None or session.task_id == task_id:
                info = self.get_session_info(session_id)
                if info:
                    sessions.append(info)
        
        return sessions
    
    def get_audit_log(
        self, 
        session_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        """
        Get audit log entries.
        
        Args:
            session_id: Filter by session ID
            limit: Maximum entries to return
            
        Returns:
            List of audit log entries
        """
        logs = self.audit_log
        
        if session_id:
            logs = [
                log for log in logs 
                if log.get('session_id') == session_id
            ]
        
        # Return most recent entries
        return logs[-limit:]