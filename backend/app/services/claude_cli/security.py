"""Security utilities for Claude CLI integration."""

import re
import shlex
from typing import Dict, List, Optional, Set, Tuple
from pathlib import Path

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class CommandSanitizer:
    """Sanitizes and validates commands for safe execution."""
    
    # Dangerous command patterns that should be blocked
    DANGEROUS_PATTERNS = [
        # File system destruction
        r'rm\s+-rf\s+/',
        r'rm\s+-rf\s+\*',
        r'rm\s+-fr',
        r'dd\s+if=.*of=/dev/',
        r'mkfs',
        r'fdisk',
        r'parted',
        
        # Privilege escalation
        r'sudo',
        r'su\s+-',
        r'chmod\s+777',
        r'chmod\s+\+s',
        r'chown.*root',
        
        # System modification
        r'systemctl.*stop',
        r'service.*stop',
        r'kill\s+-9',
        r'pkill',
        r'shutdown',
        r'reboot',
        r'halt',
        
        # Code execution
        r'eval\s*\(',
        r'exec\s*\(',
        r'curl.*\|\s*sh',
        r'wget.*\|\s*sh',
        r'curl.*\|\s*bash',
        r'wget.*\|\s*bash',
        
        # PTY escape sequences
        r'\\x1b\[',  # ANSI escape sequences
        r'\\033\[',  # Octal escape sequences
        r'\\e\[',    # Alternative escape notation
        
        # Command injection attempts
        r';\s*cat\s+/etc/passwd',
        r';\s*cat\s+/etc/shadow',
        r'&&\s*cat\s+/etc/passwd',
        r'\|\s*cat\s+/etc/passwd',
        r'`.*`',  # Command substitution
        r'\$\(.*\)',  # Command substitution
        
        # Network operations
        r'nc\s+-l',  # Netcat listener
        r'ncat\s+-l',
        r'socat.*LISTEN',
        
        # Dangerous redirections
        r'>\s*/dev/',
        r'>\s*/proc/',
        r'>\s*/sys/',
    ]
    
    # Allowed Claude CLI commands (whitelist)
    ALLOWED_CLAUDE_COMMANDS = {
        '/plan',
        '/smart-task',
        '/init-project',
        '/complete-task',
        '/test-task',
        '/help',
        '/status',
        '/cancel',
        '/clear',
        '/exit',
        '/quit',
        '/history',
        '/save',
        '/load',
        '/export',
        '/import',
        '/config',
        '/debug',
        '/version',
    }
    
    # Maximum command length to prevent buffer overflow attacks
    MAX_COMMAND_LENGTH = 4096
    
    # Maximum argument count to prevent resource exhaustion
    MAX_ARGUMENT_COUNT = 100
    
    def __init__(self):
        # Compile regex patterns for efficiency
        self._dangerous_patterns = [
            re.compile(pattern, re.IGNORECASE) 
            for pattern in self.DANGEROUS_PATTERNS
        ]
    
    def sanitize_command(self, command: str) -> Tuple[bool, str, Optional[str]]:
        """
        Sanitize and validate a command for execution.
        
        Args:
            command: Raw command string
            
        Returns:
            Tuple of (is_valid, sanitized_command, error_message)
        """
        try:
            # Basic validation
            if not command or not command.strip():
                return False, "", "Empty command"
            
            command = command.strip()
            
            # Length check
            if len(command) > self.MAX_COMMAND_LENGTH:
                return False, "", f"Command too long (max {self.MAX_COMMAND_LENGTH} chars)"
            
            # Check for null bytes (security issue)
            if '\x00' in command:
                return False, "", "Null bytes not allowed in commands"
            
            # Remove ANSI escape sequences
            command = self._remove_ansi_sequences(command)
            
            # Validate Claude CLI commands
            if command.startswith('/'):
                return self._validate_claude_command(command)
            
            # Check against dangerous patterns
            for pattern in self._dangerous_patterns:
                if pattern.search(command):
                    logger.warning(
                        "Blocked dangerous command pattern",
                        pattern=pattern.pattern,
                        command=command[:100]
                    )
                    return False, "", f"Command contains dangerous pattern"
            
            # Parse command to check argument count
            try:
                args = shlex.split(command)
                if len(args) > self.MAX_ARGUMENT_COUNT:
                    return False, "", f"Too many arguments (max {self.MAX_ARGUMENT_COUNT})"
            except ValueError as e:
                return False, "", f"Invalid command syntax: {e}"
            
            # Additional validation for specific commands
            if args and args[0] in ['rm', 'mv', 'cp']:
                valid, error = self._validate_file_operation(args)
                if not valid:
                    return False, "", error
            
            return True, command, None
            
        except Exception as e:
            logger.error("Error sanitizing command", error=str(e))
            return False, "", f"Command validation error: {e}"
    
    def _remove_ansi_sequences(self, text: str) -> str:
        """Remove ANSI escape sequences from text."""
        # Pattern to match ANSI escape sequences
        ansi_pattern = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_pattern.sub('', text)
    
    def _validate_claude_command(self, command: str) -> Tuple[bool, str, Optional[str]]:
        """Validate Claude CLI specific commands."""
        # Extract command name
        parts = command.split(maxsplit=1)
        cmd_name = parts[0].lower()
        
        # Check if command is in whitelist
        if cmd_name not in self.ALLOWED_CLAUDE_COMMANDS:
            return False, "", f"Unknown Claude command: {cmd_name}"
        
        # Additional validation for specific commands
        if cmd_name == '/smart-task' and len(parts) > 1:
            # Validate smart-task arguments
            args = parts[1]
            if len(args) > 1024:  # Reasonable limit for task description
                return False, "", "Task description too long"
        
        return True, command, None
    
    def _validate_file_operation(self, args: List[str]) -> Tuple[bool, Optional[str]]:
        """Validate file operation commands (rm, mv, cp)."""
        cmd = args[0]
        
        # Don't allow recursive operations on root directories
        if cmd == 'rm' and '-r' in args:
            for arg in args[1:]:
                if arg.startswith('/') and len(arg) < 5:  # e.g., /, /etc, /usr
                    return False, "Cannot perform recursive operations on system directories"
        
        # Check for operations on sensitive files
        sensitive_paths = [
            '/etc/passwd',
            '/etc/shadow',
            '/etc/sudoers',
            '~/.ssh/',
            '~/.gnupg/',
            '/proc/',
            '/sys/',
            '/dev/',
        ]
        
        for arg in args[1:]:
            if not arg.startswith('-'):  # Skip flags
                for sensitive in sensitive_paths:
                    if arg.startswith(sensitive) or sensitive in arg:
                        return False, f"Cannot operate on sensitive path: {sensitive}"
        
        return True, None


class EnvironmentSanitizer:
    """Sanitizes environment variables for Claude CLI sessions."""
    
    # Environment variables that should never be passed through
    BLOCKED_ENV_VARS = {
        'LD_PRELOAD',  # Can be used for code injection
        'LD_LIBRARY_PATH',  # Can override system libraries
        'PYTHONPATH',  # Can inject malicious Python modules
        'NODE_PATH',  # Can inject malicious Node modules
        'PERL5LIB',  # Can inject malicious Perl modules
        'RUBYLIB',  # Can inject malicious Ruby modules
        'GCONV_PATH',  # Can be used for privilege escalation
        'TMPDIR',  # Can redirect temp files
        'TMP',
        'TEMP',
    }
    
    # Environment variables that should be sanitized
    SANITIZE_ENV_VARS = {
        'PATH': r'^[a-zA-Z0-9_\-/.:]+$',  # Only allow safe PATH characters
        'HOME': r'^/[a-zA-Z0-9_\-/]+$',   # Valid home directory path
        'USER': r'^[a-zA-Z0-9_\-]+$',     # Valid username
        'SHELL': r'^/[a-zA-Z0-9_\-/]+$',  # Valid shell path
    }
    
    def sanitize_environment(
        self, 
        env: Dict[str, str], 
        allowed_vars: Optional[Set[str]] = None
    ) -> Dict[str, str]:
        """
        Sanitize environment variables for safe execution.
        
        Args:
            env: Raw environment variables
            allowed_vars: Additional variables to allow
            
        Returns:
            Sanitized environment dictionary
        """
        sanitized = {}
        allowed = allowed_vars or set()
        
        for key, value in env.items():
            # Skip blocked variables
            if key in self.BLOCKED_ENV_VARS:
                logger.warning(f"Blocked environment variable: {key}")
                continue
            
            # Sanitize specific variables
            if key in self.SANITIZE_ENV_VARS:
                pattern = self.SANITIZE_ENV_VARS[key]
                if not re.match(pattern, value):
                    logger.warning(f"Invalid value for {key}: {value[:50]}")
                    continue
            
            # Allow whitelisted variables
            if key in allowed or key.startswith('CLAUDE_'):
                sanitized[key] = value
            
            # Allow safe standard variables
            elif key in ['LANG', 'LC_ALL', 'TERM', 'COLUMNS', 'LINES']:
                sanitized[key] = value
        
        return sanitized


class PathValidator:
    """Validates and restricts file system paths."""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root).resolve()
    
    def validate_path(self, path: str) -> Tuple[bool, Optional[Path], Optional[str]]:
        """
        Validate that a path is within the project boundaries.
        
        Args:
            path: Path to validate
            
        Returns:
            Tuple of (is_valid, resolved_path, error_message)
        """
        try:
            # Resolve the path
            resolved = Path(path).resolve()
            
            # Check if path is within project root
            try:
                resolved.relative_to(self.project_root)
                return True, resolved, None
            except ValueError:
                return False, None, "Path is outside project directory"
                
        except Exception as e:
            return False, None, f"Invalid path: {e}"
    
    def is_safe_directory(self, path: Path) -> bool:
        """Check if a directory is safe to operate in."""
        # List of unsafe directories
        unsafe_dirs = [
            '/etc',
            '/proc',
            '/sys',
            '/dev',
            '/boot',
            '/root',
            '/',
        ]
        
        path_str = str(path)
        for unsafe in unsafe_dirs:
            if path_str == unsafe or path_str.startswith(f"{unsafe}/"):
                return False
        
        return True


class SessionIsolator:
    """Ensures proper isolation between Claude CLI sessions."""
    
    def __init__(self):
        self.active_sessions: Dict[str, Set[int]] = {}  # session_id -> PIDs
    
    def register_session(self, session_id: str, pid: int):
        """Register a new session and its process."""
        if session_id not in self.active_sessions:
            self.active_sessions[session_id] = set()
        self.active_sessions[session_id].add(pid)
    
    def validate_session_access(
        self, 
        session_id: str, 
        resource_path: str
    ) -> bool:
        """
        Validate that a session can access a resource.
        
        Args:
            session_id: Session identifier
            resource_path: Path to resource
            
        Returns:
            True if access is allowed
        """
        # Each session should only access its own resources
        session_dir = f"/tmp/claude_sessions/{session_id}"
        return resource_path.startswith(session_dir)
    
    def cleanup_session(self, session_id: str):
        """Clean up session resources."""
        if session_id in self.active_sessions:
            # Terminate any remaining processes
            for pid in self.active_sessions[session_id]:
                try:
                    os.kill(pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            
            del self.active_sessions[session_id]