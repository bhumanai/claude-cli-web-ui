"""WebSocket handlers for real-time communication."""

import json
import uuid
from typing import Dict, List, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from app.core.logging_config import get_logger
from app.models.schemas import (
    WebSocketMessage, 
    OutputMessage,
    TaskWebSocketMessage,
    ProjectWebSocketMessage
)
from app.services.command_executor import CommandExecutor
from app.services.session_manager import SessionManager

logger = get_logger(__name__)

# Router for WebSocket endpoints
websocket_router = APIRouter()

# Global instances - in production, use dependency injection
command_executor = CommandExecutor()
session_manager = SessionManager()


class ConnectionManager:
    """Manages WebSocket connections and message broadcasting."""
    
    def __init__(self):
        # Active connections by connection ID
        self.active_connections: Dict[str, WebSocket] = {}
        # Session to connection mapping
        self.session_connections: Dict[str, Set[str]] = {}
        # Connection to session mapping
        self.connection_sessions: Dict[str, str] = {}
        # Project subscriptions by connection ID
        self.project_subscriptions: Dict[str, Set[str]] = {}
        # Task subscriptions by connection ID
        self.task_subscriptions: Dict[str, Set[str]] = {}
        # Queue subscriptions by connection ID
        self.queue_subscriptions: Dict[str, Set[str]] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str) -> str:
        """
        Accept a new WebSocket connection.
        
        Args:
            websocket: WebSocket connection
            session_id: Session identifier
            
        Returns:
            Connection ID
        """
        await websocket.accept()
        
        connection_id = str(uuid.uuid4())
        self.active_connections[connection_id] = websocket
        self.connection_sessions[connection_id] = session_id
        
        # Track session connections
        if session_id not in self.session_connections:
            self.session_connections[session_id] = set()
        self.session_connections[session_id].add(connection_id)
        
        logger.info("WebSocket connected", 
                   connection_id=connection_id,
                   session_id=session_id,
                   total_connections=len(self.active_connections))
        
        return connection_id
    
    async def disconnect(self, connection_id: str) -> None:
        """
        Remove a WebSocket connection.
        
        Args:
            connection_id: Connection identifier
        """
        if connection_id not in self.active_connections:
            return
        
        # Get session ID
        session_id = self.connection_sessions.get(connection_id)
        
        # Remove from mappings
        del self.active_connections[connection_id]
        if connection_id in self.connection_sessions:
            del self.connection_sessions[connection_id]
        
        # Remove from session connections
        if session_id and session_id in self.session_connections:
            self.session_connections[session_id].discard(connection_id)
            if not self.session_connections[session_id]:
                del self.session_connections[session_id]
        
        # Remove from subscriptions
        if connection_id in self.project_subscriptions:
            del self.project_subscriptions[connection_id]
        if connection_id in self.task_subscriptions:
            del self.task_subscriptions[connection_id]
        if connection_id in self.queue_subscriptions:
            del self.queue_subscriptions[connection_id]
        
        logger.info("WebSocket disconnected", 
                   connection_id=connection_id,
                   session_id=session_id,
                   remaining_connections=len(self.active_connections))
    
    async def send_personal_message(self, connection_id: str, message: WebSocketMessage) -> bool:
        """
        Send a message to a specific connection.
        
        Args:
            connection_id: Connection identifier
            message: Message to send
            
        Returns:
            True if message was sent successfully
        """
        if connection_id not in self.active_connections:
            return False
        
        websocket = self.active_connections[connection_id]
        
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_text(message.model_dump_json())
                return True
        except Exception as e:
            logger.error("Failed to send personal message", 
                        connection_id=connection_id,
                        error=str(e))
            # Remove broken connection
            await self.disconnect(connection_id)
        
        return False
    
    async def broadcast_to_session(self, session_id: str, message: WebSocketMessage) -> int:
        """
        Broadcast a message to all connections in a session.
        
        Args:
            session_id: Session identifier
            message: Message to broadcast
            
        Returns:
            Number of connections that received the message
        """
        if session_id not in self.session_connections:
            return 0
        
        connection_ids = list(self.session_connections[session_id])
        sent_count = 0
        
        for connection_id in connection_ids:
            if await self.send_personal_message(connection_id, message):
                sent_count += 1
        
        return sent_count
    
    async def broadcast_to_all(self, message: WebSocketMessage) -> int:
        """
        Broadcast a message to all connections.
        
        Args:
            message: Message to broadcast
            
        Returns:
            Number of connections that received the message
        """
        connection_ids = list(self.active_connections.keys())
        sent_count = 0
        
        for connection_id in connection_ids:
            if await self.send_personal_message(connection_id, message):
                sent_count += 1
        
        return sent_count
    
    def get_session_connections(self, session_id: str) -> List[str]:
        """
        Get all connection IDs for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            List of connection IDs
        """
        return list(self.session_connections.get(session_id, set()))
    
    def get_connection_count(self) -> int:
        """Get total number of active connections."""
        return len(self.active_connections)
    
    def get_session_count(self) -> int:
        """Get total number of sessions with active connections."""
        return len(self.session_connections)
    
    # Subscription Management
    
    async def subscribe_to_project(self, connection_id: str, project_id: str) -> bool:
        """
        Subscribe connection to project updates.
        
        Args:
            connection_id: Connection identifier
            project_id: Project ID
            
        Returns:
            True if subscription was successful
        """
        if connection_id not in self.active_connections:
            return False
        
        if connection_id not in self.project_subscriptions:
            self.project_subscriptions[connection_id] = set()
        
        self.project_subscriptions[connection_id].add(project_id)
        
        logger.debug("Connection subscribed to project", 
                    connection_id=connection_id, project_id=project_id)
        
        return True
    
    async def unsubscribe_from_project(self, connection_id: str, project_id: str) -> bool:
        """
        Unsubscribe connection from project updates.
        
        Args:
            connection_id: Connection identifier
            project_id: Project ID
            
        Returns:
            True if unsubscription was successful
        """
        if connection_id not in self.project_subscriptions:
            return False
        
        self.project_subscriptions[connection_id].discard(project_id)
        
        logger.debug("Connection unsubscribed from project", 
                    connection_id=connection_id, project_id=project_id)
        
        return True
    
    async def subscribe_to_task(self, connection_id: str, task_id: str) -> bool:
        """
        Subscribe connection to task updates.
        
        Args:
            connection_id: Connection identifier
            task_id: Task ID
            
        Returns:
            True if subscription was successful
        """
        if connection_id not in self.active_connections:
            return False
        
        if connection_id not in self.task_subscriptions:
            self.task_subscriptions[connection_id] = set()
        
        self.task_subscriptions[connection_id].add(task_id)
        
        logger.debug("Connection subscribed to task", 
                    connection_id=connection_id, task_id=task_id)
        
        return True
    
    async def unsubscribe_from_task(self, connection_id: str, task_id: str) -> bool:
        """
        Unsubscribe connection from task updates.
        
        Args:
            connection_id: Connection identifier
            task_id: Task ID
            
        Returns:
            True if unsubscription was successful
        """
        if connection_id not in self.task_subscriptions:
            return False
        
        self.task_subscriptions[connection_id].discard(task_id)
        
        logger.debug("Connection unsubscribed from task", 
                    connection_id=connection_id, task_id=task_id)
        
        return True
    
    async def subscribe_to_queue(self, connection_id: str, queue_id: str) -> bool:
        """
        Subscribe connection to queue updates.
        
        Args:
            connection_id: Connection identifier
            queue_id: Queue ID
            
        Returns:
            True if subscription was successful
        """
        if connection_id not in self.active_connections:
            return False
        
        if connection_id not in self.queue_subscriptions:
            self.queue_subscriptions[connection_id] = set()
        
        self.queue_subscriptions[connection_id].add(queue_id)
        
        logger.debug("Connection subscribed to queue", 
                    connection_id=connection_id, queue_id=queue_id)
        
        return True
    
    async def unsubscribe_from_queue(self, connection_id: str, queue_id: str) -> bool:
        """
        Unsubscribe connection from queue updates.
        
        Args:
            connection_id: Connection identifier
            queue_id: Queue ID
            
        Returns:
            True if unsubscription was successful
        """
        if connection_id not in self.queue_subscriptions:
            return False
        
        self.queue_subscriptions[connection_id].discard(queue_id)
        
        logger.debug("Connection unsubscribed from queue", 
                    connection_id=connection_id, queue_id=queue_id)
        
        return True
    
    # Event Broadcasting
    
    async def broadcast_task_update(self, message: TaskWebSocketMessage) -> int:
        """
        Broadcast task update to subscribed connections.
        
        Args:
            message: Task update message
            
        Returns:
            Number of connections that received the message
        """
        sent_count = 0
        
        # Find connections subscribed to this task
        for connection_id, task_ids in self.task_subscriptions.items():
            if message.task_id in task_ids:
                ws_message = WebSocketMessage(
                    type=message.type,
                    data=message.model_dump(),
                    timestamp=message.timestamp
                )
                if await self.send_personal_message(connection_id, ws_message):
                    sent_count += 1
        
        # Also broadcast to connections subscribed to the project
        for connection_id, project_ids in self.project_subscriptions.items():
            if message.project_id in project_ids:
                ws_message = WebSocketMessage(
                    type=message.type,
                    data=message.model_dump(),
                    timestamp=message.timestamp
                )
                if await self.send_personal_message(connection_id, ws_message):
                    sent_count += 1
        
        return sent_count
    
    async def broadcast_project_update(self, message: ProjectWebSocketMessage) -> int:
        """
        Broadcast project update to subscribed connections.
        
        Args:
            message: Project update message
            
        Returns:
            Number of connections that received the message
        """
        sent_count = 0
        
        # Find connections subscribed to this project
        for connection_id, project_ids in self.project_subscriptions.items():
            if message.project_id in project_ids:
                ws_message = WebSocketMessage(
                    type=message.type,
                    data=message.model_dump(),
                    timestamp=message.timestamp
                )
                if await self.send_personal_message(connection_id, ws_message):
                    sent_count += 1
        
        return sent_count
    
    async def broadcast_queue_update(self, queue_id: str, message_type: str, data: dict) -> int:
        """
        Broadcast queue update to subscribed connections.
        
        Args:
            queue_id: Queue ID
            message_type: Message type
            data: Message data
            
        Returns:
            Number of connections that received the message
        """
        sent_count = 0
        
        # Find connections subscribed to this queue
        for connection_id, queue_ids in self.queue_subscriptions.items():
            if queue_id in queue_ids:
                ws_message = WebSocketMessage(
                    type=message_type,
                    data={"queue_id": queue_id, **data}
                )
                if await self.send_personal_message(connection_id, ws_message):
                    sent_count += 1
        
        return sent_count


# Global connection manager
connection_manager = ConnectionManager()


@websocket_router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time communication.
    
    Args:
        websocket: WebSocket connection
        session_id: Session identifier
    """
    logger.info("WebSocket connection attempt", session_id=session_id)
    
    try:
        # Accept the connection first
        await websocket.accept()
        logger.info("WebSocket connection accepted", session_id=session_id)
        
        # Generate connection ID
        connection_id = str(uuid.uuid4())
        logger.info("WebSocket connection established", session_id=session_id, connection_id=connection_id)
        
        # Send welcome message
        welcome_message = {
            "type": "welcome",
            "session_id": session_id,
            "data": {
                "connection_id": connection_id,
                "message": "Connected to Claude CLI Web UI"
            }
        }
        await websocket.send_text(json.dumps(welcome_message))
        
        # Ensure session exists
        await session_manager.create_session(session_id)
        logger.info("Session created/verified", session_id=session_id)
        
    except Exception as e:
        logger.error("Failed to establish WebSocket connection", session_id=session_id, error=str(e))
        raise
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            
            try:
                message_data = json.loads(data)
                message_type = message_data.get("type")
                
                if message_type == "ping":
                    # Handle ping/pong for connection health
                    pong_message = {
                        "type": "pong",
                        "session_id": session_id,
                        "data": {"timestamp": message_data.get("timestamp")}
                    }
                    await websocket.send_text(json.dumps(pong_message))
                
                elif message_type == "execute_command":
                    # Handle command execution request
                    command = message_data.get("command", "").strip()
                    if command:
                        await handle_command_execution(
                            connection_id, session_id, command
                        )
                    else:
                        error_message = {
                            "type": "error",
                            "session_id": session_id,
                            "data": {"error": "Empty command"}
                        }
                        await websocket.send_text(json.dumps(error_message))
                
                elif message_type == "get_history":
                    # Handle history request
                    await handle_history_request(connection_id, session_id, message_data)
                
                elif message_type == "subscribe":
                    # Handle subscription request
                    await handle_subscription_request(connection_id, session_id, message_data)
                
                elif message_type == "unsubscribe":
                    # Handle unsubscription request
                    await handle_unsubscription_request(connection_id, session_id, message_data)
                
                else:
                    # Unknown message type
                    error_message = WebSocketMessage(
                        type="error",
                        session_id=session_id,
                        data={"error": f"Unknown message type: {message_type}"}
                    )
                    await connection_manager.send_personal_message(
                        connection_id, error_message
                    )
                    
            except json.JSONDecodeError:
                error_message = WebSocketMessage(
                    type="error",
                    session_id=session_id,
                    data={"error": "Invalid JSON message"}
                )
                await connection_manager.send_personal_message(
                    connection_id, error_message
                )
                
    except WebSocketDisconnect:
        await connection_manager.disconnect(connection_id)
    except Exception as e:
        logger.error("WebSocket error", 
                    connection_id=connection_id,
                    session_id=session_id,
                    error=str(e))
        await connection_manager.disconnect(connection_id)


async def handle_command_execution(
    connection_id: str, 
    session_id: str, 
    command: str
) -> None:
    """
    Handle command execution via WebSocket.
    
    Args:
        connection_id: Connection identifier
        session_id: Session identifier
        command: Command to execute
    """
    try:
        # Send command start notification
        start_message = WebSocketMessage(
            type="command_started",
            session_id=session_id,
            data={"command": command}
        )
        await connection_manager.send_personal_message(connection_id, start_message)
        
        # Execute command and stream output
        async for response in command_executor.execute_command(
            command=command,
            session_id=session_id
        ):
            # Add to session history
            await session_manager.add_command_to_history(session_id, response)
            
            # Send update to WebSocket
            update_message = WebSocketMessage(
                type="command_update",
                command_id=response.command_id,
                session_id=session_id,
                data=response.model_dump()
            )
            await connection_manager.send_personal_message(connection_id, update_message)
            
            # If command is completed, send final notification
            if response.status in ["completed", "failed", "cancelled"]:
                final_message = WebSocketMessage(
                    type="command_finished",
                    command_id=response.command_id,
                    session_id=session_id,
                    data={
                        "status": response.status,
                        "exit_code": response.exit_code,
                        "error": response.error
                    }
                )
                await connection_manager.send_personal_message(connection_id, final_message)
                break
                
    except Exception as e:
        logger.error("Command execution error", 
                    connection_id=connection_id,
                    session_id=session_id,
                    command=command,
                    error=str(e))
        
        error_message = WebSocketMessage(
            type="command_error",
            session_id=session_id,
            data={"error": str(e), "command": command}
        )
        await connection_manager.send_personal_message(connection_id, error_message)


async def handle_history_request(
    connection_id: str, 
    session_id: str, 
    message_data: dict
) -> None:
    """
    Handle session history request via WebSocket.
    
    Args:
        connection_id: Connection identifier
        session_id: Session identifier
        message_data: Request message data
    """
    try:
        limit = message_data.get("limit", 50)
        offset = message_data.get("offset", 0)
        
        history = await session_manager.get_command_history(
            session_id=session_id,
            limit=limit,
            offset=offset
        )
        
        history_message = WebSocketMessage(
            type="history_response",
            session_id=session_id,
            data=history.model_dump()
        )
        await connection_manager.send_personal_message(connection_id, history_message)
        
    except Exception as e:
        logger.error("History request error", 
                    connection_id=connection_id,
                    session_id=session_id,
                    error=str(e))
        
        error_message = WebSocketMessage(
            type="error",
            session_id=session_id,
            data={"error": f"Failed to get history: {str(e)}"}
        )
        await connection_manager.send_personal_message(connection_id, error_message)


async def handle_subscription_request(
    connection_id: str,
    session_id: str, 
    message_data: dict
) -> None:
    """
    Handle subscription request via WebSocket.
    
    Args:
        connection_id: Connection identifier
        session_id: Session identifier
        message_data: Subscription request data
    """
    try:
        subscription_type = message_data.get("subscription_type")
        resource_id = message_data.get("resource_id")
        
        if not subscription_type or not resource_id:
            error_message = WebSocketMessage(
                type="subscription_error",
                session_id=session_id,
                data={"error": "Missing subscription_type or resource_id"}
            )
            await connection_manager.send_personal_message(connection_id, error_message)
            return
        
        success = False
        
        if subscription_type == "project":
            success = await connection_manager.subscribe_to_project(connection_id, resource_id)
        elif subscription_type == "task":
            success = await connection_manager.subscribe_to_task(connection_id, resource_id)
        elif subscription_type == "queue":
            success = await connection_manager.subscribe_to_queue(connection_id, resource_id)
        else:
            error_message = WebSocketMessage(
                type="subscription_error",
                session_id=session_id,
                data={"error": f"Unknown subscription type: {subscription_type}"}
            )
            await connection_manager.send_personal_message(connection_id, error_message)
            return
        
        if success:
            response_message = WebSocketMessage(
                type="subscription_success",
                session_id=session_id,
                data={
                    "subscription_type": subscription_type,
                    "resource_id": resource_id,
                    "action": "subscribed"
                }
            )
        else:
            response_message = WebSocketMessage(
                type="subscription_error",
                session_id=session_id,
                data={"error": "Failed to subscribe"}
            )
        
        await connection_manager.send_personal_message(connection_id, response_message)
        
    except Exception as e:
        logger.error("Subscription request error", 
                    connection_id=connection_id,
                    session_id=session_id,
                    error=str(e))
        
        error_message = WebSocketMessage(
            type="subscription_error",
            session_id=session_id,
            data={"error": f"Subscription failed: {str(e)}"}
        )
        await connection_manager.send_personal_message(connection_id, error_message)


async def handle_unsubscription_request(
    connection_id: str,
    session_id: str, 
    message_data: dict
) -> None:
    """
    Handle unsubscription request via WebSocket.
    
    Args:
        connection_id: Connection identifier
        session_id: Session identifier
        message_data: Unsubscription request data
    """
    try:
        subscription_type = message_data.get("subscription_type")
        resource_id = message_data.get("resource_id")
        
        if not subscription_type or not resource_id:
            error_message = WebSocketMessage(
                type="subscription_error",
                session_id=session_id,
                data={"error": "Missing subscription_type or resource_id"}
            )
            await connection_manager.send_personal_message(connection_id, error_message)
            return
        
        success = False
        
        if subscription_type == "project":
            success = await connection_manager.unsubscribe_from_project(connection_id, resource_id)
        elif subscription_type == "task":
            success = await connection_manager.unsubscribe_from_task(connection_id, resource_id)
        elif subscription_type == "queue":
            success = await connection_manager.unsubscribe_from_queue(connection_id, resource_id)
        else:
            error_message = WebSocketMessage(
                type="subscription_error",
                session_id=session_id,
                data={"error": f"Unknown subscription type: {subscription_type}"}
            )
            await connection_manager.send_personal_message(connection_id, error_message)
            return
        
        response_message = WebSocketMessage(
            type="subscription_success",
            session_id=session_id,
            data={
                "subscription_type": subscription_type,
                "resource_id": resource_id,
                "action": "unsubscribed"
            }
        )
        await connection_manager.send_personal_message(connection_id, response_message)
        
    except Exception as e:
        logger.error("Unsubscription request error", 
                    connection_id=connection_id,
                    session_id=session_id,
                    error=str(e))
        
        error_message = WebSocketMessage(
            type="subscription_error",
            session_id=session_id,
            data={"error": f"Unsubscription failed: {str(e)}"}
        )
        await connection_manager.send_personal_message(connection_id, error_message)


# Event Broadcasting Functions (to be used by services)

async def broadcast_task_status_change(
    task_id: str,
    project_id: str,
    queue_id: str,
    status: str,
    additional_data: dict = None
) -> int:
    """
    Broadcast task status change to subscribed clients.
    
    Args:
        task_id: Task ID
        project_id: Project ID  
        queue_id: Queue ID
        status: New task status
        additional_data: Additional data to include
        
    Returns:
        Number of connections that received the message
    """
    message = TaskWebSocketMessage(
        type="task_status_changed",
        task_id=task_id,
        project_id=project_id,
        queue_id=queue_id,
        status=status,
        data=additional_data or {}
    )
    
    return await connection_manager.broadcast_task_update(message)


async def broadcast_task_created(
    task_id: str,
    project_id: str,
    queue_id: str,
    task_data: dict = None
) -> int:
    """
    Broadcast task creation to subscribed clients.
    
    Args:
        task_id: Task ID
        project_id: Project ID
        queue_id: Queue ID
        task_data: Task data to include
        
    Returns:
        Number of connections that received the message
    """
    message = TaskWebSocketMessage(
        type="task_created",
        task_id=task_id,
        project_id=project_id,
        queue_id=queue_id,
        data=task_data or {}
    )
    
    return await connection_manager.broadcast_task_update(message)


async def broadcast_project_status_change(
    project_id: str,
    status: str,
    additional_data: dict = None
) -> int:
    """
    Broadcast project status change to subscribed clients.
    
    Args:
        project_id: Project ID
        status: New project status
        additional_data: Additional data to include
        
    Returns:
        Number of connections that received the message
    """
    message = ProjectWebSocketMessage(
        type="project_status_changed",
        project_id=project_id,
        status=status,
        data=additional_data or {}
    )
    
    return await connection_manager.broadcast_project_update(message)


@websocket_router.get("/ws/stats")
async def websocket_stats() -> dict:
    """
    Get WebSocket connection statistics.
    
    Returns:
        Connection statistics
    """
    return {
        "active_connections": connection_manager.get_connection_count(),
        "active_sessions": connection_manager.get_session_count(),
        "project_subscriptions": len(connection_manager.project_subscriptions),
        "task_subscriptions": len(connection_manager.task_subscriptions),
        "queue_subscriptions": len(connection_manager.queue_subscriptions),
    }