"""Authentication and authorization system for Claude CLI Web UI."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, List, Any

import jwt
from fastapi import HTTPException, Request, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from pydantic import BaseModel

from app.config import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


class TokenData(BaseModel):
    """Token payload data."""
    user_id: str
    username: str
    session_id: str
    exp: datetime
    iat: datetime
    type: str  # "access" or "refresh"


class User(BaseModel):
    """User model."""
    user_id: str
    username: str
    hashed_password: str
    is_active: bool = True
    created_at: datetime
    last_login: Optional[datetime] = None
    permissions: List[str] = []


class LoginRequest(BaseModel):
    """Login request model."""
    username: str
    password: str


class TokenResponse(BaseModel):
    """Token response model."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthManager:
    """Manages authentication and authorization."""
    
    def __init__(self):
        self.settings = get_settings()
        self.bearer_scheme = HTTPBearer(auto_error=False)
        # In production, this would be a proper database
        self._users: Dict[str, User] = {}
        self._active_sessions: Dict[str, Dict[str, Any]] = {}
        self._initialize_default_user()
    
    def _initialize_default_user(self):
        """Initialize default admin user."""
        # Create default user in both development and production for now
        # In production, this should be replaced with proper user registration/management
        admin_user = User(
            user_id="admin",
            username="admin",
            hashed_password=self.hash_password("admin123"),
            is_active=True,
            created_at=datetime.now(timezone.utc),
            permissions=["admin", "execute_commands", "manage_sessions"]
        )
        self._users["admin"] = admin_user
        
        # Also add a simple user for the simple-login endpoint
        if not self.settings.DEBUG:
            # In production, use the simple password as the admin password too
            admin_user.hashed_password = self.hash_password(self.settings.SIMPLE_PASSWORD)
        
        logger.info("Default admin user created (username: admin)")
        if self.settings.DEBUG:
            logger.info("Development mode - password: admin123")
        else:
            logger.info("Production mode - using SIMPLE_PASSWORD configuration")
    
    def hash_password(self, password: str) -> str:
        """Hash a password securely."""
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)
    
    def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """
        Authenticate a user with username and password.
        
        Args:
            username: Username
            password: Plain text password
            
        Returns:
            User object if authentication successful, None otherwise
        """
        user = self._users.get(username)
        if not user or not user.is_active:
            logger.warning("Login attempt for inactive/non-existent user", username=username)
            return None
        
        if not self.verify_password(password, user.hashed_password):
            logger.warning("Failed password attempt", username=username)
            return None
        
        # Update last login
        user.last_login = datetime.now(timezone.utc)
        logger.info("User authenticated successfully", username=username)
        return user
    
    def create_access_token(self, user: User, session_id: str) -> str:
        """
        Create a JWT access token.
        
        Args:
            user: User object
            session_id: Session identifier
            
        Returns:
            JWT access token
        """
        now = datetime.now(timezone.utc)
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        payload = {
            "user_id": user.user_id,
            "username": user.username,
            "session_id": session_id,
            "exp": expire,
            "iat": now,
            "type": "access",
            "permissions": user.permissions
        }
        
        token = jwt.encode(payload, self.settings.SECRET_KEY, algorithm=ALGORITHM)
        logger.debug("Access token created", user_id=user.user_id, session_id=session_id)
        return token
    
    def create_refresh_token(self, user: User, session_id: str) -> str:
        """
        Create a JWT refresh token.
        
        Args:
            user: User object
            session_id: Session identifier
            
        Returns:
            JWT refresh token
        """
        now = datetime.now(timezone.utc)
        expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        
        payload = {
            "user_id": user.user_id,
            "username": user.username,
            "session_id": session_id,
            "exp": expire,
            "iat": now,
            "type": "refresh"
        }
        
        token = jwt.encode(payload, self.settings.SECRET_KEY, algorithm=ALGORITHM)
        logger.debug("Refresh token created", user_id=user.user_id, session_id=session_id)
        return token
    
    def verify_token(self, token: str) -> Optional[TokenData]:
        """
        Verify and decode a JWT token.
        
        Args:
            token: JWT token to verify
            
        Returns:
            TokenData if valid, None otherwise
        """
        try:
            payload = jwt.decode(token, self.settings.SECRET_KEY, algorithms=[ALGORITHM])
            
            # Validate required fields
            required_fields = ["user_id", "username", "session_id", "exp", "iat", "type"]
            for field in required_fields:
                if field not in payload:
                    logger.warning("Token missing required field", field=field)
                    return None
            
            # Check if token is expired
            exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
            if exp < datetime.now(timezone.utc):
                logger.debug("Token expired", user_id=payload.get("user_id"))
                return None
            
            # Check if user still exists and is active
            user = self._users.get(payload["username"])
            if not user or not user.is_active:
                logger.warning("Token for inactive/non-existent user", username=payload.get("username"))
                return None
            
            return TokenData(
                user_id=payload["user_id"],
                username=payload["username"],
                session_id=payload["session_id"],
                exp=exp,
                iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
                type=payload["type"]
            )
            
        except jwt.PyJWTError as e:
            logger.warning("JWT decode error", error=str(e))
            return None
        except Exception as e:
            logger.error("Unexpected error verifying token", error=str(e))
            return None
    
    def login(self, username: str, password: str) -> Optional[TokenResponse]:
        """
        Perform user login and return tokens.
        
        Args:
            username: Username
            password: Password
            
        Returns:
            TokenResponse if successful, None otherwise
        """
        user = self.authenticate_user(username, password)
        if not user:
            return None
        
        # Generate session ID
        session_id = secrets.token_urlsafe(32)
        
        # Create tokens
        access_token = self.create_access_token(user, session_id)
        refresh_token = self.create_refresh_token(user, session_id)
        
        # Store active session
        self._active_sessions[session_id] = {
            "user_id": user.user_id,
            "username": user.username,
            "created_at": datetime.now(timezone.utc),
            "last_activity": datetime.now(timezone.utc),
            "access_token": access_token,
            "refresh_token": refresh_token
        }
        
        logger.info("User login successful", username=username, session_id=session_id)
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
    
    def logout(self, session_id: str) -> bool:
        """
        Logout user and invalidate session.
        
        Args:
            session_id: Session to invalidate
            
        Returns:
            True if logout successful
        """
        if session_id in self._active_sessions:
            username = self._active_sessions[session_id]["username"]
            del self._active_sessions[session_id]
            logger.info("User logout successful", username=username, session_id=session_id)
            return True
        return False
    
    def refresh_token(self, refresh_token: str) -> Optional[TokenResponse]:
        """
        Refresh access token using refresh token.
        
        Args:
            refresh_token: Valid refresh token
            
        Returns:
            New TokenResponse if successful
        """
        token_data = self.verify_token(refresh_token)
        if not token_data or token_data.type != "refresh":
            return None
        
        # Check if session is still active
        if token_data.session_id not in self._active_sessions:
            logger.warning("Refresh token for inactive session", session_id=token_data.session_id)
            return None
        
        user = self._users.get(token_data.username)
        if not user:
            return None
        
        # Create new access token
        new_access_token = self.create_access_token(user, token_data.session_id)
        
        # Update session
        self._active_sessions[token_data.session_id]["access_token"] = new_access_token
        self._active_sessions[token_data.session_id]["last_activity"] = datetime.now(timezone.utc)
        
        logger.info("Token refreshed successfully", username=user.username, session_id=token_data.session_id)
        
        return TokenResponse(
            access_token=new_access_token,
            refresh_token=refresh_token,  # Keep the same refresh token
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
    
    def get_current_user(self, credentials: HTTPAuthorizationCredentials) -> User:
        """
        Get current user from JWT token.
        
        Args:
            credentials: HTTP authorization credentials
            
        Returns:
            Current user
            
        Raises:
            HTTPException: If authentication fails
        """
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication credentials required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        token_data = self.verify_token(credentials.credentials)
        if not token_data or token_data.type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if session is still active
        if token_data.session_id not in self._active_sessions:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user = self._users.get(token_data.username)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account inactive",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Update last activity
        self._active_sessions[token_data.session_id]["last_activity"] = datetime.now(timezone.utc)
        
        return user
    
    def require_permission(self, permission: str):
        """
        Decorator to require specific permission.
        
        Args:
            permission: Required permission
            
        Returns:
            Dependency function
        """
        def check_permission(current_user: User = Depends(self.get_current_user_dependency)):
            if permission not in current_user.permissions and "admin" not in current_user.permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission '{permission}' required"
                )
            return current_user
        return check_permission
    
    def get_current_user_dependency(self, credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())):
        """Dependency for getting current user."""
        return self.get_current_user(credentials)
    
    def cleanup_expired_sessions(self):
        """Clean up expired sessions."""
        now = datetime.now(timezone.utc)
        expired_sessions = []
        
        for session_id, session_data in self._active_sessions.items():
            last_activity = session_data["last_activity"]
            if now - last_activity > timedelta(hours=24):  # 24 hour session timeout
                expired_sessions.append(session_id)
        
        for session_id in expired_sessions:
            username = self._active_sessions[session_id]["username"]
            del self._active_sessions[session_id]
            logger.info("Expired session cleaned up", username=username, session_id=session_id)


# Global auth manager instance
auth_manager = AuthManager()


# Dependency functions for FastAPI
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())) -> User:
    """Get current authenticated user."""
    return auth_manager.get_current_user(credentials)


async def require_command_execution(current_user: User = Depends(get_current_user)) -> User:
    """Require command execution permission."""
    if "execute_commands" not in current_user.permissions and "admin" not in current_user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Command execution permission required"
        )
    return current_user


async def require_session_management(current_user: User = Depends(get_current_user)) -> User:
    """Require session management permission."""
    if "manage_sessions" not in current_user.permissions and "admin" not in current_user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session management permission required"
        )
    return current_user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin permission."""
    if "admin" not in current_user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required"
        )
    return current_user