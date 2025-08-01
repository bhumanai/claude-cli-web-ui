"""Session management endpoints."""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Path, Depends

from app.core.auth import User, require_session_management, get_current_user
from app.core.logging_config import get_logger
from app.models.schemas import (
    SessionInfo,
    SessionList,
    CommandHistory,
)
from app.services.session_manager import SessionManager

logger = get_logger(__name__)

router = APIRouter()

# Global instance - in production, use dependency injection
session_manager = SessionManager()


@router.post("/", response_model=SessionInfo)
async def create_session(
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
) -> SessionInfo:
    """
    Create a new session.
    
    Args:
        session_id: Optional session ID
        current_user: Authenticated user
        
    Returns:
        Created session information
    """
    try:
        # Associate session with user
        user_session_id = session_id or f"{current_user.user_id}_default"
        session = await session_manager.create_session(user_session_id)
        logger.info("Session created", session_id=session.session_id, user=current_user.username)
        return session
        
    except Exception as e:
        logger.error("Failed to create session", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=SessionList)
async def list_sessions(current_user: User = Depends(require_session_management)) -> SessionList:
    """
    Get list of all active sessions.
    
    Returns:
        List of session information
    """
    try:
        sessions = await session_manager.list_sessions()
        return SessionList(sessions=sessions, total=len(sessions))
        
    except Exception as e:
        logger.error("Failed to list sessions", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}", response_model=SessionInfo)
async def get_session(
    session_id: str = Path(..., description="Session ID"),
    current_user: User = Depends(get_current_user)
) -> SessionInfo:
    """
    Get information about a specific session.
    
    Args:
        session_id: Session identifier
        current_user: Authenticated user
        
    Returns:
        Session information
    """
    try:
        # Check if user can access this session (must be their own session unless admin)
        if not session_id.startswith(current_user.user_id) and "admin" not in current_user.permissions:
            raise HTTPException(status_code=403, detail="Access denied to this session")
        
        session = await session_manager.get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return session
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get session", 
                    session_id=session_id, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{session_id}")
async def delete_session(
    session_id: str = Path(..., description="Session ID"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Delete a session and its history.
    
    Args:
        session_id: Session identifier
        current_user: Authenticated user
        
    Returns:
        Success status
    """
    try:
        # Check if user can delete this session (must be their own session unless admin)
        if not session_id.startswith(current_user.user_id) and "admin" not in current_user.permissions:
            raise HTTPException(status_code=403, detail="Access denied to this session")
        
        success = await session_manager.delete_session(session_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        
        logger.info("Session deleted", session_id=session_id, user=current_user.username)
        return {"success": True, "message": "Session deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete session", 
                    session_id=session_id, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/history", response_model=CommandHistory)
async def get_session_history(
    session_id: str = Path(..., description="Session ID"),
    limit: Optional[int] = Query(None, description="Maximum number of commands", ge=1, le=1000),
    offset: int = Query(0, description="Number of commands to skip", ge=0)
) -> CommandHistory:
    """
    Get command history for a session.
    
    Args:
        session_id: Session identifier
        limit: Maximum number of commands to return
        offset: Number of commands to skip
        
    Returns:
        Command history
    """
    try:
        history = await session_manager.get_command_history(
            session_id=session_id,
            limit=limit,
            offset=offset
        )
        
        return history
        
    except Exception as e:
        logger.error("Failed to get session history", 
                    session_id=session_id, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{session_id}/history")
async def clear_session_history(
    session_id: str = Path(..., description="Session ID")
) -> dict:
    """
    Clear command history for a session.
    
    Args:
        session_id: Session identifier
        
    Returns:
        Success status
    """
    try:
        success = await session_manager.clear_session_history(session_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        
        logger.info("Session history cleared", session_id=session_id)
        return {"success": True, "message": "Session history cleared"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to clear session history", 
                    session_id=session_id, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/stats")
async def get_session_stats() -> dict:
    """
    Get session statistics.
    
    Returns:
        Session statistics
    """
    try:
        stats = await session_manager.get_session_stats()
        return stats
        
    except Exception as e:
        logger.error("Failed to get session stats", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))