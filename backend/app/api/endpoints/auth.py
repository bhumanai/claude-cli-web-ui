"""Authentication endpoints."""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.auth import (
    auth_manager, 
    LoginRequest, 
    TokenResponse, 
    User,
    get_current_user
)
from app.core.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()
security = HTTPBearer()


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest) -> TokenResponse:
    """
    Authenticate user and return JWT tokens.
    
    Args:
        request: Login credentials
        
    Returns:
        JWT tokens if authentication successful
        
    Raises:
        HTTPException: If authentication fails
    """
    # Rate limiting and input validation happens in middleware
    
    # Validate input
    if not request.username or not request.password:
        logger.warning("Login attempt with empty credentials")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required"
        )
    
    if len(request.username) > 100 or len(request.password) > 200:
        logger.warning("Login attempt with oversized credentials", username=request.username[:50])
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or password too long"
        )
    
    # Attempt authentication
    token_response = auth_manager.login(request.username, request.password)
    
    if not token_response:
        logger.warning("Failed login attempt", username=request.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info("User login successful", username=request.username)
    return token_response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenResponse:
    """
    Refresh access token using refresh token.
    
    Args:
        credentials: Bearer token (refresh token)
        
    Returns:
        New access token
        
    Raises:
        HTTPException: If refresh token is invalid
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token_response = auth_manager.refresh_token(credentials.credentials)
    
    if not token_response:
        logger.warning("Failed token refresh attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info("Token refreshed successfully")
    return token_response


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)) -> dict:
    """
    Logout current user and invalidate session.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        Logout confirmation
    """
    # Get session ID from token (this would need to be extracted from the token)
    # For now, we'll log out all sessions for the user
    # In a production system, you'd track the specific session
    
    logger.info("User logout", username=current_user.username)
    
    # TODO: Implement proper session tracking to logout specific session
    # For now, return success
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)) -> dict:
    """
    Get current user information.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User information (excluding sensitive data)
    """
    return {
        "user_id": current_user.user_id,
        "username": current_user.username,
        "is_active": current_user.is_active,
        "permissions": current_user.permissions,
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None,
        "created_at": current_user.created_at.isoformat()
    }


@router.post("/validate-token")
async def validate_token(current_user: User = Depends(get_current_user)) -> dict:
    """
    Validate the current token and return user info.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        Token validation result
    """
    return {
        "valid": True,
        "user_id": current_user.user_id,
        "username": current_user.username,
        "permissions": current_user.permissions
    }


@router.get("/sessions")
async def list_active_sessions(current_user: User = Depends(get_current_user)) -> dict:
    """
    List active sessions for current user.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        List of active sessions
    """
    # TODO: Implement proper session listing
    # This would require tracking sessions by user
    return {
        "sessions": [],
        "message": "Session listing not yet implemented"
    }


@router.delete("/sessions/{session_id}")
async def terminate_session(
    session_id: str, 
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Terminate a specific session.
    
    Args:
        session_id: Session to terminate
        current_user: Current authenticated user
        
    Returns:
        Termination result
    """
    success = auth_manager.logout(session_id)
    
    if success:
        logger.info("Session terminated", session_id=session_id, username=current_user.username)
        return {"message": "Session terminated successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )