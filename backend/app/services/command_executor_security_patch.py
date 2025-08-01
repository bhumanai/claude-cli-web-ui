"""Security patch for CommandExecutor to add security measures."""

from typing import List, Tuple, Optional
import re
import os
import signal

from app.services.claude_cli.security import (
    CommandSanitizer,
    EnvironmentSanitizer,
    PathValidator,
)


def patch_command_executor():
    """
    Patch the existing CommandExecutor class with security enhancements.
    This function should be called during application startup.
    """
    from app.services.command_executor import CommandExecutor
    
    # Store original methods
    original_execute_command = CommandExecutor.execute_command
    original_is_valid_command = CommandExecutor._is_valid_command
    
    # Initialize security components
    command_sanitizer = CommandSanitizer()
    env_sanitizer = EnvironmentSanitizer()
    
    # Enhanced command validation
    def _is_valid_command_secure(self, command: str) -> bool:
        """Enhanced command validation with security measures."""
        # Use the secure command sanitizer
        is_valid, _, error = command_sanitizer.sanitize_command(command)
        if not is_valid:
            logger.warning(
                "Command failed security validation",
                command=command[:100],
                error=error
            )
        return is_valid
    
    # Patch the validation method
    CommandExecutor._is_valid_command = _is_valid_command_secure
    
    # Enhanced execute_command with security checks
    async def execute_command_secure(
        self,
        command: str,
        session_id: str,
        timeout: Optional[int] = None,
        project_path: Optional[str] = None,
        environment: Optional[Dict[str, str]] = None
    ):
        """Execute command with enhanced security."""
        # Sanitize environment if provided
        if environment:
            environment = env_sanitizer.sanitize_environment(
                environment,
                allowed_vars={'CLAUDE_API_KEY', 'CLAUDE_PROJECT_PATH'}
            )
        
        # Validate project path if provided
        if project_path:
            path_validator = PathValidator(os.getcwd())
            is_valid, resolved_path, error = path_validator.validate_path(project_path)
            if not is_valid:
                # Create error response
                command_id = str(uuid.uuid4())
                response = CommandResponse(
                    command_id=command_id,
                    session_id=session_id,
                    command=command,
                    status=CommandStatus.FAILED,
                    error=f"Invalid project path: {error}",
                    started_at=datetime.utcnow(),
                    completed_at=datetime.utcnow()
                )
                yield response
                return
            
            project_path = str(resolved_path)
        
        # Call original method with sanitized inputs
        async for response in original_execute_command(
            self, command, session_id, timeout, project_path, environment
        ):
            yield response
    
    # Patch the execute method
    CommandExecutor.execute_command = execute_command_secure
    
    # Add secure session cleanup
    def cleanup_session_secure(self, command_id: str):
        """Securely cleanup session resources."""
        if command_id in self.running_commands:
            session = self.running_commands[command_id]
            
            # Terminate child processes
            if hasattr(session, 'pty_process') and session.pty_process:
                try:
                    # Send SIGTERM first
                    os.kill(session.pty_process.pid, signal.SIGTERM)
                    # Give it time to cleanup
                    asyncio.sleep(0.5)
                    # Force kill if still running
                    os.kill(session.pty_process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            
            # Remove from tracking
            del self.running_commands[command_id]
            if command_id in self._session_output_buffers:
                del self._session_output_buffers[command_id]
    
    # Add the secure cleanup method
    CommandExecutor.cleanup_session_secure = cleanup_session_secure
    
    # Patch the PTY output streaming to sanitize output
    if hasattr(CommandExecutor, '_stream_pty_output'):
        original_stream_output = CommandExecutor._stream_pty_output
        
        async def _stream_pty_output_secure(
            self,
            session: ClaudeCliSession,
            command_id: str,
            response: CommandResponse,
            timeout: int
        ):
            """Stream PTY output with sanitization."""
            # Remove ANSI escape sequences from output
            ansi_pattern = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            
            async for output_response in original_stream_output(
                self, session, command_id, response, timeout
            ):
                # Sanitize output content
                if output_response.output:
                    for msg in output_response.output:
                        # Remove ANSI sequences
                        msg.content = ansi_pattern.sub('', msg.content)
                        
                        # Check for sensitive information patterns
                        sensitive_patterns = [
                            (r'password[:\s]*([^\s]+)', 'password: ***'),
                            (r'token[:\s]*([^\s]+)', 'token: ***'),
                            (r'api[_-]?key[:\s]*([^\s]+)', 'api_key: ***'),
                            (r'secret[:\s]*([^\s]+)', 'secret: ***'),
                        ]
                        
                        for pattern, replacement in sensitive_patterns:
                            msg.content = re.sub(
                                pattern, 
                                replacement, 
                                msg.content, 
                                flags=re.IGNORECASE
                            )
                
                yield output_response
        
        CommandExecutor._stream_pty_output = _stream_pty_output_secure
    
    return CommandExecutor


# Security configuration for middleware
SECURITY_CONFIG = {
    # Rate limiting
    'rate_limit': {
        'requests_per_minute': 60,
        'requests_per_hour': 1000,
        'burst_size': 10,
    },
    
    # Session limits
    'session_limits': {
        'max_sessions_per_user': 10,
        'max_sessions_per_task': 5,
        'session_timeout_minutes': 60,
        'idle_timeout_minutes': 15,
    },
    
    # Output limits
    'output_limits': {
        'max_output_size_mb': 10,
        'max_line_length': 4096,
        'max_lines_per_command': 10000,
    },
    
    # Command limits
    'command_limits': {
        'max_command_length': 4096,
        'max_concurrent_commands': 5,
        'command_timeout_seconds': 300,
    },
}


def apply_security_patches():
    """Apply all security patches to the command executor."""
    import logging
    
    logger = logging.getLogger(__name__)
    
    try:
        # Apply command executor patches
        patched_executor = patch_command_executor()
        logger.info("Successfully applied security patches to CommandExecutor")
        
        # Log security configuration
        logger.info("Security configuration applied", extra=SECURITY_CONFIG)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to apply security patches: {e}")
        return False