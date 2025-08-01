"""Session management service for handling user sessions and command history."""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set

from app.config import get_settings
from app.core.logging_config import get_logger
from app.models.schemas import (
    CommandResponse,
    SessionInfo,
    CommandHistory,
)

logger = get_logger(__name__)


class SessionManager:
    """Manages user sessions and command history."""
    
    def __init__(self):
        self.settings = get_settings()
        self.sessions: Dict[str, SessionInfo] = {}
        self.command_history: Dict[str, List[CommandResponse]] = {}
        self.cleanup_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
    
    async def start(self) -> None:
        """Start the session manager and cleanup task."""
        logger.info("Starting session manager")
        self.cleanup_task = asyncio.create_task(self._cleanup_expired_sessions())
    
    async def stop(self) -> None:
        """Stop the session manager and cleanup task."""
        logger.info("Stopping session manager")
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
    
    async def create_session(self, session_id: Optional[str] = None) -> SessionInfo:
        """
        Create a new session.
        
        Args:
            session_id: Optional session ID, generates new one if None
            
        Returns:
            SessionInfo object for the new session
        """
        async with self._lock:
            if session_id is None:
                session_id = str(uuid.uuid4())
            
            # Check if session already exists
            if session_id in self.sessions:
                session = self.sessions[session_id]
                session.last_activity = datetime.utcnow()
                logger.info("Reusing existing session", session_id=session_id)
                return session
            
            # Check session limits
            if len(self.sessions) >= self.settings.MAX_SESSIONS:
                # Remove oldest inactive session
                await self._remove_oldest_session()
            
            # Create new session
            session = SessionInfo(
                session_id=session_id,
                created_at=datetime.utcnow(),
                last_activity=datetime.utcnow(),
                command_count=0,
                is_active=True
            )
            
            self.sessions[session_id] = session
            self.command_history[session_id] = []
            
            logger.info("Created new session", 
                       session_id=session_id,
                       total_sessions=len(self.sessions))
            
            return session
    
    async def get_session(self, session_id: str) -> Optional[SessionInfo]:
        """
        Get session information.
        
        Args:
            session_id: Session identifier
            
        Returns:
            SessionInfo if found, None otherwise
        """
        async with self._lock:
            session = self.sessions.get(session_id)
            if session:
                session.last_activity = datetime.utcnow()
            return session
    
    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session and its history.
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if session was deleted, False if not found
        """
        async with self._lock:
            if session_id not in self.sessions:
                return False
            
            del self.sessions[session_id]
            del self.command_history[session_id]
            
            logger.info("Deleted session", 
                       session_id=session_id,
                       remaining_sessions=len(self.sessions))
            
            return True
    
    async def list_sessions(self) -> List[SessionInfo]:
        """
        Get list of all active sessions.
        
        Returns:
            List of SessionInfo objects
        """
        async with self._lock:
            return list(self.sessions.values())
    
    async def add_command_to_history(
        self, 
        session_id: str, 
        command: CommandResponse
    ) -> None:
        """
        Add a command to session history.
        
        Args:
            session_id: Session identifier
            command: Command response to add
        """
        async with self._lock:
            if session_id not in self.sessions:
                # Create session if it doesn't exist
                await self.create_session(session_id)
            
            # Add to history
            if session_id not in self.command_history:
                self.command_history[session_id] = []
            
            self.command_history[session_id].append(command)
            
            # Update session stats
            session = self.sessions[session_id]
            session.command_count += 1
            session.last_activity = datetime.utcnow()
            
            # Limit history size to prevent memory issues
            max_history = 1000
            if len(self.command_history[session_id]) > max_history:
                self.command_history[session_id] = self.command_history[session_id][-max_history:]
            
            logger.debug("Added command to history",
                        session_id=session_id,
                        command_id=command.command_id,
                        history_size=len(self.command_history[session_id]))
    
    async def get_command_history(
        self, 
        session_id: str,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> CommandHistory:
        """
        Get command history for a session.
        
        Args:
            session_id: Session identifier
            limit: Maximum number of commands to return
            offset: Number of commands to skip
            
        Returns:
            CommandHistory object
        """
        async with self._lock:
            commands = self.command_history.get(session_id, [])
            total = len(commands)
            
            # Apply pagination
            start = offset
            end = start + limit if limit else len(commands)
            paginated_commands = commands[start:end]
            
            return CommandHistory(
                session_id=session_id,
                commands=paginated_commands,
                total=total
            )
    
    async def update_command_in_history(
        self,
        session_id: str,
        command_id: str,
        updated_command: CommandResponse
    ) -> bool:
        """
        Update a command in session history.
        
        Args:
            session_id: Session identifier
            command_id: Command identifier
            updated_command: Updated command response
            
        Returns:
            True if command was updated, False if not found
        """
        async with self._lock:
            if session_id not in self.command_history:
                return False
            
            commands = self.command_history[session_id]
            for i, cmd in enumerate(commands):
                if cmd.command_id == command_id:
                    commands[i] = updated_command
                    
                    # Update session activity
                    if session_id in self.sessions:
                        self.sessions[session_id].last_activity = datetime.utcnow()
                    
                    logger.debug("Updated command in history",
                                session_id=session_id,
                                command_id=command_id)
                    return True
            
            return False
    
    async def clear_session_history(self, session_id: str) -> bool:
        """
        Clear command history for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if history was cleared, False if session not found
        """
        async with self._lock:
            if session_id not in self.command_history:
                return False
            
            self.command_history[session_id] = []
            
            # Update session stats
            if session_id in self.sessions:
                self.sessions[session_id].command_count = 0
                self.sessions[session_id].last_activity = datetime.utcnow()
            
            logger.info("Cleared session history", session_id=session_id)
            return True
    
    async def get_session_stats(self) -> Dict[str, int]:
        """
        Get session statistics.
        
        Returns:
            Dictionary with session statistics
        """
        async with self._lock:
            total_sessions = len(self.sessions)
            active_sessions = sum(1 for s in self.sessions.values() if s.is_active)
            total_commands = sum(s.command_count for s in self.sessions.values())
            
            return {
                "total_sessions": total_sessions,
                "active_sessions": active_sessions,
                "total_commands": total_commands,
            }
    
    async def _cleanup_expired_sessions(self) -> None:
        """Background task to cleanup expired sessions."""
        while True:
            try:
                await asyncio.sleep(300)  # Check every 5 minutes
                
                async with self._lock:
                    now = datetime.utcnow()
                    expired_sessions = []
                    
                    for session_id, session in self.sessions.items():
                        time_since_activity = now - session.last_activity
                        if time_since_activity > timedelta(seconds=self.settings.SESSION_TIMEOUT):
                            expired_sessions.append(session_id)
                    
                    # Remove expired sessions
                    for session_id in expired_sessions:
                        del self.sessions[session_id]
                        if session_id in self.command_history:
                            del self.command_history[session_id]
                        
                        logger.info("Cleaned up expired session", session_id=session_id)
                
                if expired_sessions:
                    logger.info("Cleaned up expired sessions", 
                               count=len(expired_sessions),
                               remaining=len(self.sessions))
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in session cleanup", error=str(e))
    
    async def _remove_oldest_session(self) -> None:
        """Remove the oldest inactive session to make room for new ones."""
        if not self.sessions:
            return
        
        # Find oldest session by last activity
        oldest_session_id = min(
            self.sessions.keys(),
            key=lambda sid: self.sessions[sid].last_activity
        )
        
        del self.sessions[oldest_session_id]
        if oldest_session_id in self.command_history:
            del self.command_history[oldest_session_id]
        
        logger.info("Removed oldest session to make room", 
                   session_id=oldest_session_id)