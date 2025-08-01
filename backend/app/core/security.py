"""Security utilities and middleware."""

import hashlib
import secrets
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Set

from fastapi import HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class RateLimiter:
    """Rate limiter to prevent abuse."""
    
    def __init__(self, max_requests: int = 60, window_minutes: int = 1):
        self.max_requests = max_requests
        self.window_seconds = window_minutes * 60
        self.requests: Dict[str, list] = {}
    
    def is_allowed(self, client_id: str) -> bool:
        """
        Check if client is allowed to make a request.
        
        Args:
            client_id: Client identifier (IP, session, etc.)
            
        Returns:
            True if request is allowed
        """
        now = time.time()
        
        # Clean old requests
        if client_id in self.requests:
            self.requests[client_id] = [
                req_time for req_time in self.requests[client_id]
                if now - req_time < self.window_seconds
            ]
        else:
            self.requests[client_id] = []
        
        # Check rate limit
        if len(self.requests[client_id]) >= self.max_requests:
            return False
        
        # Add current request
        self.requests[client_id].append(now)
        return True
    
    def get_remaining_requests(self, client_id: str) -> int:
        """Get remaining requests for client."""
        if client_id not in self.requests:
            return self.max_requests
        
        now = time.time()
        recent_requests = [
            req_time for req_time in self.requests[client_id]
            if now - req_time < self.window_seconds
        ]
        
        return max(0, self.max_requests - len(recent_requests))
    
    def get_reset_time(self, client_id: str) -> Optional[datetime]:
        """Get when rate limit resets for client."""
        if client_id not in self.requests or not self.requests[client_id]:
            return None
        
        oldest_request = min(self.requests[client_id])
        reset_time = oldest_request + self.window_seconds
        
        return datetime.fromtimestamp(reset_time)


class SecurityManager:
    """Manages security features like authentication and rate limiting."""
    
    def __init__(self):
        self.settings = get_settings()
        self.rate_limiter = RateLimiter(
            max_requests=self.settings.RATE_LIMIT_PER_MINUTE,
            window_minutes=1
        )
        self.bearer_scheme = HTTPBearer(auto_error=False)
        self.blocked_ips: Set[str] = set()
    
    def get_client_id(self, request: Request) -> str:
        """
        Get client identifier for rate limiting.
        
        Args:
            request: FastAPI request
            
        Returns:
            Client identifier
        """
        # Use IP address as client ID
        client_ip = request.client.host if request.client else "unknown"
        
        # In production, might want to use authenticated user ID
        # or combine with other factors
        return client_ip
    
    def check_rate_limit(self, request: Request) -> bool:
        """
        Check if request passes rate limiting.
        
        Args:
            request: FastAPI request
            
        Returns:
            True if request is allowed
            
        Raises:
            HTTPException: If rate limit exceeded
        """
        client_id = self.get_client_id(request)
        
        # Check if IP is blocked
        if client_id in self.blocked_ips:
            logger.warning("Blocked IP attempted request", client_ip=client_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="IP address is blocked"
            )
        
        # Check rate limit
        if not self.rate_limiter.is_allowed(client_id):
            remaining = self.rate_limiter.get_remaining_requests(client_id)
            reset_time = self.rate_limiter.get_reset_time(client_id)
            
            logger.warning("Rate limit exceeded", 
                          client_ip=client_id,
                          remaining=remaining)
            
            headers = {
                "X-RateLimit-Limit": str(self.settings.RATE_LIMIT_PER_MINUTE),
                "X-RateLimit-Remaining": str(remaining),
            }
            
            if reset_time:
                headers["X-RateLimit-Reset"] = str(int(reset_time.timestamp()))
            
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded",
                headers=headers
            )
        
        return True
    
    def block_ip(self, ip_address: str) -> None:
        """
        Block an IP address.
        
        Args:
            ip_address: IP address to block
        """
        self.blocked_ips.add(ip_address)
        logger.info("IP address blocked", ip_address=ip_address)
    
    def unblock_ip(self, ip_address: str) -> bool:
        """
        Unblock an IP address.
        
        Args:
            ip_address: IP address to unblock
            
        Returns:
            True if IP was unblocked
        """
        if ip_address in self.blocked_ips:
            self.blocked_ips.remove(ip_address)
            logger.info("IP address unblocked", ip_address=ip_address)
            return True
        return False
    
    def is_ip_blocked(self, ip_address: str) -> bool:
        """Check if IP address is blocked."""
        return ip_address in self.blocked_ips
    
    def validate_command(self, command: str) -> bool:
        """
        Validate that a command is safe to execute.
        
        Args:
            command: Command to validate
            
        Returns:
            True if command is safe
        """
        if not command or not command.strip():
            return False
        
        command_lower = command.lower().strip()
        
        # Block dangerous commands
        dangerous_patterns = [
            'rm -rf',
            'sudo ',
            'chmod 777',
            'dd if=',
            'mkfs',
            'fdisk',
            '> /dev/',
            'curl | sh',
            'wget | sh',
            'eval ',
            'exec ',
            '$()',
            '`',  # Command substitution
            '&&',  # Command chaining (might be too restrictive)
            '||',  # Command chaining
            ';',   # Command separation (might be too restrictive)
        ]
        
        for pattern in dangerous_patterns:
            if pattern in command_lower:
                logger.warning("Blocked dangerous command", 
                             command=command[:100],
                             pattern=pattern)
                return False
        
        # Block file system manipulation outside of safe directories
        filesystem_patterns = [
            '/etc/',
            '/usr/',
            '/bin/',
            '/sbin/',
            '/var/',
            '/sys/',
            '/proc/',
            '/dev/',
        ]
        
        for pattern in filesystem_patterns:
            if pattern in command_lower:
                logger.warning("Blocked filesystem command", 
                             command=command[:100],
                             pattern=pattern)
                return False
        
        return True
    
    def sanitize_input(self, input_string: str) -> str:
        """
        Sanitize user input to prevent injection attacks.
        
        Args:
            input_string: Input to sanitize
            
        Returns:
            Sanitized input
        """
        if not input_string:
            return ""
        
        # Remove control characters
        sanitized = ''.join(char for char in input_string if ord(char) >= 32 or char in '\n\r\t')
        
        # Limit length to prevent DoS
        max_length = 10000
        if len(sanitized) > max_length:
            sanitized = sanitized[:max_length]
            logger.warning("Input truncated due to length", 
                          original_length=len(input_string),
                          truncated_length=len(sanitized))
        
        return sanitized
    
    def generate_session_token(self) -> str:
        """Generate a secure session token."""
        return secrets.token_urlsafe(32)
    
    def hash_password(self, password: str) -> str:
        """Hash a password securely."""
        salt = secrets.token_hex(32)
        pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return f"{salt}:{pwd_hash.hex()}"
    
    def verify_password(self, password: str, hashed: str) -> bool:
        """Verify a password against its hash."""
        try:
            salt, pwd_hash = hashed.split(':')
            return pwd_hash == hashlib.pbkdf2_hmac(
                'sha256', password.encode(), salt.encode(), 100000
            ).hex()
        except ValueError:
            return False


# Global security manager instance
security_manager = SecurityManager()