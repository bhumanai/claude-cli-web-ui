"""Simple password-based authentication endpoint."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.config import get_settings
from app.core.auth import auth_manager, TokenResponse
import secrets

router = APIRouter()

class SimpleLoginRequest(BaseModel):
    password: str

@router.post("/simple-login", response_model=TokenResponse)
async def simple_login(request: SimpleLoginRequest) -> TokenResponse:
    """
    Simple password authentication - no username required.
    
    Args:
        request: Password only
        
    Returns:
        JWT tokens if password is correct
    """
    settings = get_settings()
    
    # Check if the password matches
    if request.password != settings.SIMPLE_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    # Create a simple user session
    # Generate tokens for a default user
    username = "admin"
    
    # If auth is disabled, just return a dummy token
    if not settings.ENABLE_AUTH:
        return TokenResponse(
            access_token=secrets.token_urlsafe(32),
            refresh_token=secrets.token_urlsafe(32),
            token_type="bearer",
            expires_in=3600
        )
    
    # Otherwise use the auth manager
    tokens = auth_manager.login(username, request.password)
    if not tokens:
        # Create a simple token response
        return TokenResponse(
            access_token=secrets.token_urlsafe(32),
            refresh_token=secrets.token_urlsafe(32),
            token_type="bearer",
            expires_in=3600
        )
    
    return tokens