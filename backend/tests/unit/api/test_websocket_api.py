"""
Unit tests for WebSocket API functionality.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.websockets import WebSocketState

from app.websocket import ConnectionManager, connection_manager
from app.models.schemas import WebSocketMessage, TaskWebSocketMessage, ProjectWebSocketMessage


@pytest.mark.unit
@pytest.mark.websocket
class TestConnectionManager:
    """Test cases for WebSocket ConnectionManager."""

    @pytest.fixture
    def manager(self):
        """Create a fresh ConnectionManager instance for each test."""
        return ConnectionManager()

    @pytest.mark.asyncio
    async def test_connect_websocket(self, manager, mock_websocket):
        """Test WebSocket connection establishment."""
        session_id = "test-session-123"
        
        connection_id = await manager.connect(mock_websocket, session_id)
        
        assert connection_id in manager.active_connections
        assert manager.connection_sessions[connection_id] == session_id
        assert connection_id in manager.session_connections[session_id]
        assert manager.get_connection_count() == 1
        assert manager.get_session_count() == 1
        mock_websocket.accept.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_websocket(self, manager, mock_websocket):
        """Test WebSocket disconnection."""
        session_id = "test-session-123"
        
        # Connect first
        connection_id = await manager.connect(mock_websocket, session_id)
        
        # Then disconnect
        await manager.disconnect(connection_id)
        
        assert connection_id not in manager.active_connections
        assert connection_id not in manager.connection_sessions
        assert session_id not in manager.session_connections
        assert manager.get_connection_count() == 0
        assert manager.get_session_count() == 0

    @pytest.mark.asyncio
    async def test_disconnect_nonexistent_connection(self, manager):
        """Test disconnecting a non-existent connection."""
        # Should not raise an exception
        await manager.disconnect("non-existent-id")
        
        assert manager.get_connection_count() == 0

    @pytest.mark.asyncio
    async def test_send_personal_message_success(self, manager, mock_websocket):
        """Test sending personal message successfully."""
        session_id = "test-session-123"
        connection_id = await manager.connect(mock_websocket, session_id)
        
        mock_websocket.client_state = WebSocketState.CONNECTED
        
        message = WebSocketMessage(
            type="test",
            session_id=session_id,
            data={"test": "data"}
        )
        
        result = await manager.send_personal_message(connection_id, message)
        
        assert result is True
        mock_websocket.send_text.assert_called_once()
        sent_data = json.loads(mock_websocket.send_text.call_args[0][0])
        assert sent_data["type"] == "test"
        assert sent_data["session_id"] == session_id

    @pytest.mark.asyncio
    async def test_send_personal_message_disconnected_websocket(self, manager, mock_websocket):
        """Test sending message to disconnected WebSocket."""
        session_id = "test-session-123"
        connection_id = await manager.connect(mock_websocket, session_id)
        
        mock_websocket.client_state = WebSocketState.DISCONNECTED
        
        message = WebSocketMessage(
            type="test",
            session_id=session_id,
            data={"test": "data"}
        )
        
        result = await manager.send_personal_message(connection_id, message)
        
        assert result is False
        # Connection should be removed after failed send
        assert connection_id not in manager.active_connections

    @pytest.mark.asyncio
    async def test_send_personal_message_websocket_exception(self, manager, mock_websocket):
        """Test sending message when WebSocket raises exception."""
        session_id = "test-session-123"
        connection_id = await manager.connect(mock_websocket, session_id)
        
        mock_websocket.client_state = WebSocketState.CONNECTED
        mock_websocket.send_text.side_effect = Exception("Connection broken")
        
        message = WebSocketMessage(
            type="test",
            session_id=session_id,
            data={"test": "data"}
        )
        
        result = await manager.send_personal_message(connection_id, message)
        
        assert result is False
        # Connection should be removed after exception
        assert connection_id not in manager.active_connections

    @pytest.mark.asyncio
    async def test_send_personal_message_nonexistent_connection(self, manager):
        """Test sending message to non-existent connection."""
        message = WebSocketMessage(
            type="test",
            session_id="test-session",
            data={"test": "data"}
        )
        
        result = await manager.send_personal_message("non-existent-id", message)
        
        assert result is False

    @pytest.mark.asyncio
    async def test_broadcast_to_session(self, manager):
        """Test broadcasting message to all connections in a session."""
        session_id = "test-session-123"
        
        # Create multiple connections for the same session
        mock_ws1 = MagicMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.client_state = WebSocketState.CONNECTED
        mock_ws1.send_text = AsyncMock()
        
        mock_ws2 = MagicMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.client_state = WebSocketState.CONNECTED
        mock_ws2.send_text = AsyncMock()
        
        conn1 = await manager.connect(mock_ws1, session_id)
        conn2 = await manager.connect(mock_ws2, session_id)
        
        message = WebSocketMessage(
            type="broadcast",
            session_id=session_id,
            data={"message": "test broadcast"}
        )
        
        sent_count = await manager.broadcast_to_session(session_id, message)
        
        assert sent_count == 2
        mock_ws1.send_text.assert_called_once()
        mock_ws2.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_broadcast_to_session_nonexistent(self, manager):
        """Test broadcasting to non-existent session."""
        message = WebSocketMessage(
            type="broadcast",
            session_id="non-existent-session",
            data={"message": "test"}
        )
        
        sent_count = await manager.broadcast_to_session("non-existent-session", message)
        
        assert sent_count == 0

    @pytest.mark.asyncio
    async def test_broadcast_to_all(self, manager):
        """Test broadcasting message to all connections."""
        # Create connections for different sessions
        mock_ws1 = MagicMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.client_state = WebSocketState.CONNECTED
        mock_ws1.send_text = AsyncMock()
        
        mock_ws2 = MagicMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.client_state = WebSocketState.CONNECTED
        mock_ws2.send_text = AsyncMock()
        
        await manager.connect(mock_ws1, "session1")
        await manager.connect(mock_ws2, "session2")
        
        message = WebSocketMessage(
            type="global_broadcast",
            data={"message": "global message"}
        )
        
        sent_count = await manager.broadcast_to_all(message)
        
        assert sent_count == 2
        mock_ws1.send_text.assert_called_once()
        mock_ws2.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_session_connections(self, manager, mock_websocket):
        """Test getting connections for a session."""
        session_id = "test-session-123"
        
        connection_id = await manager.connect(mock_websocket, session_id)
        
        connections = manager.get_session_connections(session_id)
        
        assert len(connections) == 1
        assert connection_id in connections

    @pytest.mark.asyncio
    async def test_get_session_connections_nonexistent(self, manager):
        """Test getting connections for non-existent session."""
        connections = manager.get_session_connections("non-existent-session")
        
        assert len(connections) == 0

    @pytest.mark.asyncio
    async def test_subscribe_to_project(self, manager, mock_websocket):
        """Test subscribing connection to project updates."""
        session_id = "test-session-123"
        project_id = "project-456"
        
        connection_id = await manager.connect(mock_websocket, session_id)
        
        result = await manager.subscribe_to_project(connection_id, project_id)
        
        assert result is True
        assert connection_id in manager.project_subscriptions
        assert project_id in manager.project_subscriptions[connection_id]

    @pytest.mark.asyncio
    async def test_subscribe_to_project_nonexistent_connection(self, manager):
        """Test subscribing non-existent connection to project."""
        result = await manager.subscribe_to_project("non-existent-id", "project-123")
        
        assert result is False

    @pytest.mark.asyncio
    async def test_unsubscribe_from_project(self, manager, mock_websocket):
        """Test unsubscribing connection from project updates."""
        session_id = "test-session-123"
        project_id = "project-456"
        
        connection_id = await manager.connect(mock_websocket, session_id)
        await manager.subscribe_to_project(connection_id, project_id)
        
        result = await manager.unsubscribe_from_project(connection_id, project_id)
        
        assert result is True
        assert project_id not in manager.project_subscriptions[connection_id]

    @pytest.mark.asyncio
    async def test_unsubscribe_from_project_not_subscribed(self, manager):
        """Test unsubscribing from project when not subscribed."""
        result = await manager.unsubscribe_from_project("non-existent-id", "project-123")
        
        assert result is False

    @pytest.mark.asyncio
    async def test_subscribe_to_task(self, manager, mock_websocket):
        """Test subscribing connection to task updates."""
        session_id = "test-session-123"
        task_id = "task-789"
        
        connection_id = await manager.connect(mock_websocket, session_id)
        
        result = await manager.subscribe_to_task(connection_id, task_id)
        
        assert result is True
        assert connection_id in manager.task_subscriptions
        assert task_id in manager.task_subscriptions[connection_id]

    @pytest.mark.asyncio
    async def test_subscribe_to_queue(self, manager, mock_websocket):
        """Test subscribing connection to queue updates."""
        session_id = "test-session-123"
        queue_id = "queue-abc"
        
        connection_id = await manager.connect(mock_websocket, session_id)
        
        result = await manager.subscribe_to_queue(connection_id, queue_id)
        
        assert result is True
        assert connection_id in manager.queue_subscriptions
        assert queue_id in manager.queue_subscriptions[connection_id]

    @pytest.mark.asyncio
    async def test_broadcast_task_update(self, manager):
        """Test broadcasting task updates to subscribed connections."""
        # Setup connections with subscriptions
        mock_ws1 = MagicMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.client_state = WebSocketState.CONNECTED
        mock_ws1.send_text = AsyncMock()
        
        mock_ws2 = MagicMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.client_state = WebSocketState.CONNECTED
        mock_ws2.send_text = AsyncMock()
        
        conn1 = await manager.connect(mock_ws1, "session1")
        conn2 = await manager.connect(mock_ws2, "session2")
        
        # Subscribe to task and project
        task_id = "task-123"
        project_id = "project-456"
        
        await manager.subscribe_to_task(conn1, task_id)
        await manager.subscribe_to_project(conn2, project_id)
        
        # Broadcast task update
        message = TaskWebSocketMessage(
            type="task_status_changed",
            task_id=task_id,
            project_id=project_id,
            queue_id="queue-789",
            status="running",
            data={"progress": 0.5}
        )
        
        sent_count = await manager.broadcast_task_update(message)
        
        # Both connections should receive the message (task subscriber + project subscriber)
        assert sent_count == 2
        mock_ws1.send_text.assert_called_once()
        mock_ws2.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_broadcast_project_update(self, manager):
        """Test broadcasting project updates to subscribed connections."""
        # Setup connection with project subscription
        mock_ws = MagicMock()
        mock_ws.accept = AsyncMock()
        mock_ws.client_state = WebSocketState.CONNECTED
        mock_ws.send_text = AsyncMock()
        
        connection_id = await manager.connect(mock_ws, "session1")
        project_id = "project-456"
        
        await manager.subscribe_to_project(connection_id, project_id)
        
        # Broadcast project update
        message = ProjectWebSocketMessage(
            type="project_status_changed",
            project_id=project_id,
            status="active",
            data={"last_updated": "2024-01-01T00:00:00Z"}
        )
        
        sent_count = await manager.broadcast_project_update(message)
        
        assert sent_count == 1
        mock_ws.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_broadcast_queue_update(self, manager):
        """Test broadcasting queue updates to subscribed connections."""
        # Setup connection with queue subscription
        mock_ws = MagicMock()
        mock_ws.accept = AsyncMock()
        mock_ws.client_state = WebSocketState.CONNECTED
        mock_ws.send_text = AsyncMock()
        
        connection_id = await manager.connect(mock_ws, "session1")
        queue_id = "queue-789"
        
        await manager.subscribe_to_queue(connection_id, queue_id)
        
        # Broadcast queue update
        sent_count = await manager.broadcast_queue_update(
            queue_id=queue_id,
            message_type="queue_status_changed",
            data={"status": "active", "pending_tasks": 5}
        )
        
        assert sent_count == 1
        mock_ws.send_text.assert_called_once()
        
        # Verify message content
        sent_data = json.loads(mock_ws.send_text.call_args[0][0])
        assert sent_data["type"] == "queue_status_changed"
        assert sent_data["data"]["queue_id"] == queue_id
        assert sent_data["data"]["status"] == "active"

    @pytest.mark.asyncio
    async def test_connection_cleanup_on_disconnect(self, manager, mock_websocket):
        """Test that all subscriptions are cleaned up on disconnect."""
        session_id = "test-session-123"
        connection_id = await manager.connect(mock_websocket, session_id)
        
        # Add various subscriptions
        await manager.subscribe_to_project(connection_id, "project-1")
        await manager.subscribe_to_task(connection_id, "task-1")
        await manager.subscribe_to_queue(connection_id, "queue-1")
        
        # Verify subscriptions exist
        assert connection_id in manager.project_subscriptions
        assert connection_id in manager.task_subscriptions
        assert connection_id in manager.queue_subscriptions
        
        # Disconnect
        await manager.disconnect(connection_id)
        
        # Verify all subscriptions are cleaned up
        assert connection_id not in manager.project_subscriptions
        assert connection_id not in manager.task_subscriptions
        assert connection_id not in manager.queue_subscriptions

    @pytest.mark.asyncio
    async def test_multiple_subscriptions_same_connection(self, manager, mock_websocket):
        """Test multiple subscriptions for the same connection."""
        session_id = "test-session-123"
        connection_id = await manager.connect(mock_websocket, session_id)
        
        # Subscribe to multiple projects, tasks, and queues
        await manager.subscribe_to_project(connection_id, "project-1")
        await manager.subscribe_to_project(connection_id, "project-2")
        await manager.subscribe_to_task(connection_id, "task-1")
        await manager.subscribe_to_task(connection_id, "task-2")
        await manager.subscribe_to_queue(connection_id, "queue-1")
        
        # Verify all subscriptions
        assert "project-1" in manager.project_subscriptions[connection_id]
        assert "project-2" in manager.project_subscriptions[connection_id]
        assert "task-1" in manager.task_subscriptions[connection_id]
        assert "task-2" in manager.task_subscriptions[connection_id]
        assert "queue-1" in manager.queue_subscriptions[connection_id]


@pytest.mark.unit
@pytest.mark.websocket
class TestWebSocketBroadcastFunctions:
    """Test cases for WebSocket broadcast functions."""

    @pytest.mark.asyncio
    async def test_broadcast_task_status_change(self):
        """Test broadcasting task status change."""
        with patch('app.websocket.connection_manager') as mock_manager:
            mock_manager.broadcast_task_update = AsyncMock(return_value=3)
            
            from app.websocket import broadcast_task_status_change
            
            sent_count = await broadcast_task_status_change(
                task_id="task-123",
                project_id="project-456",
                queue_id="queue-789",
                status="completed",
                additional_data={"result": "success"}
            )
            
            assert sent_count == 3
            mock_manager.broadcast_task_update.assert_called_once()
            
            # Verify message structure
            call_args = mock_manager.broadcast_task_update.call_args[0][0]
            assert call_args.type == "task_status_changed"
            assert call_args.task_id == "task-123"
            assert call_args.project_id == "project-456"
            assert call_args.queue_id == "queue-789"
            assert call_args.status == "completed"

    @pytest.mark.asyncio
    async def test_broadcast_task_created(self):
        """Test broadcasting task creation."""
        with patch('app.websocket.connection_manager') as mock_manager:
            mock_manager.broadcast_task_update = AsyncMock(return_value=2)
            
            from app.websocket import broadcast_task_created
            
            sent_count = await broadcast_task_created(
                task_id="task-123",
                project_id="project-456",
                queue_id="queue-789",
                task_data={"name": "Test Task", "priority": "high"}
            )
            
            assert sent_count == 2
            mock_manager.broadcast_task_update.assert_called_once()
            
            # Verify message structure
            call_args = mock_manager.broadcast_task_update.call_args[0][0]
            assert call_args.type == "task_created"
            assert call_args.task_id == "task-123"

    @pytest.mark.asyncio
    async def test_broadcast_project_status_change(self):
        """Test broadcasting project status change."""
        with patch('app.websocket.connection_manager') as mock_manager:
            mock_manager.broadcast_project_update = AsyncMock(return_value=1)
            
            from app.websocket import broadcast_project_status_change
            
            sent_count = await broadcast_project_status_change(
                project_id="project-456",
                status="archived",
                additional_data={"archived_by": "user123"}
            )
            
            assert sent_count == 1
            mock_manager.broadcast_project_update.assert_called_once()
            
            # Verify message structure
            call_args = mock_manager.broadcast_project_update.call_args[0][0]
            assert call_args.type == "project_status_changed"
            assert call_args.project_id == "project-456"
            assert call_args.status == "archived"


@pytest.mark.unit
@pytest.mark.websocket
class TestWebSocketErrorHandling:
    """Test cases for WebSocket error handling."""

    @pytest.mark.asyncio
    async def test_connection_manager_handles_broken_connections(self, manager):
        """Test that ConnectionManager handles broken connections gracefully."""
        # Create a mock WebSocket that will fail on send
        mock_ws = MagicMock()
        mock_ws.accept = AsyncMock()
        mock_ws.client_state = WebSocketState.CONNECTED
        mock_ws.send_text = AsyncMock(side_effect=Exception("Connection broken"))
        
        connection_id = await manager.connect(mock_ws, "session1")
        
        message = WebSocketMessage(
            type="test",
            session_id="session1", 
            data={"test": "data"}
        )
        
        # Should handle the exception and remove the connection
        result = await manager.send_personal_message(connection_id, message)
        
        assert result is False
        assert connection_id not in manager.active_connections

    @pytest.mark.asyncio
    async def test_broadcast_with_mixed_connection_states(self, manager):
        """Test broadcasting when some connections are broken."""
        # Create multiple connections with different states
        mock_ws1 = MagicMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.client_state = WebSocketState.CONNECTED
        mock_ws1.send_text = AsyncMock()
        
        mock_ws2 = MagicMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.client_state = WebSocketState.CONNECTED
        mock_ws2.send_text = AsyncMock(side_effect=Exception("Broken"))
        
        mock_ws3 = MagicMock()
        mock_ws3.accept = AsyncMock()
        mock_ws3.client_state = WebSocketState.DISCONNECTED
        
        conn1 = await manager.connect(mock_ws1, "session1")
        conn2 = await manager.connect(mock_ws2, "session1")
        conn3 = await manager.connect(mock_ws3, "session1")
        
        message = WebSocketMessage(
            type="broadcast",
            session_id="session1",
            data={"message": "test"}
        )
        
        # Should send to working connections only
        sent_count = await manager.broadcast_to_session("session1", message)
        
        # Only conn1 should successfully receive the message
        assert sent_count == 1
        mock_ws1.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_connection_manager_stats_accuracy(self, manager):
        """Test that connection manager statistics are accurate."""
        # Initially empty
        assert manager.get_connection_count() == 0
        assert manager.get_session_count() == 0
        
        # Add connections
        mock_ws1 = MagicMock()
        mock_ws1.accept = AsyncMock()
        mock_ws2 = MagicMock()
        mock_ws2.accept = AsyncMock()
        mock_ws3 = MagicMock()
        mock_ws3.accept = AsyncMock()
        
        # Two connections for session1, one for session2
        conn1 = await manager.connect(mock_ws1, "session1")
        conn2 = await manager.connect(mock_ws2, "session1")
        conn3 = await manager.connect(mock_ws3, "session2")
        
        assert manager.get_connection_count() == 3
        assert manager.get_session_count() == 2
        
        # Disconnect one connection from session1
        await manager.disconnect(conn1)
        
        assert manager.get_connection_count() == 2
        assert manager.get_session_count() == 2  # session1 still has conn2
        
        # Disconnect last connection from session1
        await manager.disconnect(conn2)
        
        assert manager.get_connection_count() == 1
        assert manager.get_session_count() == 1  # Only session2 remains
        
        # Disconnect last connection
        await manager.disconnect(conn3)
        
        assert manager.get_connection_count() == 0
        assert manager.get_session_count() == 0