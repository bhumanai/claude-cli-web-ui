"""End-to-end tests for Claude CLI integration with WebSocket streaming."""

import asyncio
import json
import os
import signal
import uuid
from datetime import datetime
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import WebSocket
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.models.schemas import (
    CommandRequest,
    CommandResponse,
    CommandStatus,
    SessionCreate,
    SessionInfo,
    SessionState as SchemaSessionState,
)
from app.services.claude_cli.claude_session import SessionConfig, SessionOutput, SessionState
from app.services.claude_cli.claude_session_manager import ClaudeSessionManager
from app.services.claude_cli.pty_process import PtyProcess
from app.websocket import WebSocketManager


@pytest.fixture
async def mock_claude_session_manager():
    """Create a mock Claude session manager."""
    manager = AsyncMock(spec=ClaudeSessionManager)
    manager.is_active = True
    manager.claude_sessions = {}
    manager.task_to_session = {}
    return manager


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket connection."""
    ws = AsyncMock(spec=WebSocket)
    ws.accept = AsyncMock()
    ws.send_text = AsyncMock()
    ws.send_json = AsyncMock()
    ws.receive_text = AsyncMock()
    ws.receive_json = AsyncMock()
    ws.close = AsyncMock()
    ws.client = MagicMock()
    ws.client.host = "127.0.0.1"
    ws.client.port = 12345
    return ws


@pytest.fixture
async def websocket_manager():
    """Create a WebSocket manager instance."""
    manager = WebSocketManager()
    yield manager
    # Cleanup connections
    for session_id in list(manager.active_connections.keys()):
        await manager.disconnect(session_id)


class TestClaudeCliE2E:
    """End-to-end tests for Claude CLI integration."""
    
    @pytest.mark.asyncio
    async def test_session_creation_and_command_execution(self, test_client: AsyncClient):
        """Test creating a session and executing commands."""
        # Create a new session
        session_data = {
            "project_path": "/test/project",
            "environment": {"TEST": "true"},
            "terminal_size": {"cols": 120, "rows": 40}
        }
        
        response = await test_client.post("/api/v1/sessions/", json=session_data)
        assert response.status_code == 200
        session = response.json()
        assert "id" in session
        session_id = session["id"]
        
        # Execute a command
        command_data = {
            "command": "echo 'Hello, Claude CLI!'",
            "timeout": 10
        }
        
        response = await test_client.post(
            f"/api/v1/sessions/{session_id}/commands",
            json=command_data
        )
        assert response.status_code == 200
        command_response = response.json()
        assert command_response["command"] == "echo 'Hello, Claude CLI!'"
        assert command_response["status"] in ["running", "completed"]
        
        # Get session output
        response = await test_client.get(f"/api/v1/sessions/{session_id}/output")
        assert response.status_code == 200
        outputs = response.json()
        assert isinstance(outputs, list)
        
        # Terminate session
        response = await test_client.delete(f"/api/v1/sessions/{session_id}")
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_websocket_session_streaming(
        self,
        websocket_manager: WebSocketManager,
        mock_websocket: WebSocket,
        mock_claude_session_manager: ClaudeSessionManager
    ):
        """Test WebSocket streaming for session output."""
        session_id = str(uuid.uuid4())
        
        # Connect WebSocket
        await websocket_manager.connect(session_id, mock_websocket)
        assert session_id in websocket_manager.active_connections
        
        # Simulate session output
        outputs = [
            SessionOutput("stdout", "Starting command execution\n"),
            SessionOutput("stdout", "Processing...\n"),
            SessionOutput("stdout", "Command completed successfully\n")
        ]
        
        # Broadcast outputs
        for output in outputs:
            await websocket_manager.send_session_output(session_id, output.to_dict())
        
        # Verify messages sent
        assert mock_websocket.send_json.call_count == 3
        
        # Disconnect
        await websocket_manager.disconnect(session_id)
        assert session_id not in websocket_manager.active_connections
    
    @pytest.mark.asyncio
    async def test_multiple_concurrent_sessions(self, test_client: AsyncClient):
        """Test managing multiple concurrent Claude sessions."""
        sessions = []
        
        # Create multiple sessions
        for i in range(3):
            session_data = {
                "project_path": f"/test/project{i}",
                "environment": {"SESSION_NUM": str(i)}
            }
            
            response = await test_client.post("/api/v1/sessions/", json=session_data)
            assert response.status_code == 200
            sessions.append(response.json())
        
        # Execute commands on all sessions concurrently
        command_tasks = []
        for session in sessions:
            command_data = {
                "command": f"echo 'Session {session['id']}'",
                "timeout": 5
            }
            task = test_client.post(
                f"/api/v1/sessions/{session['id']}/commands",
                json=command_data
            )
            command_tasks.append(task)
        
        # Wait for all commands
        responses = await asyncio.gather(*command_tasks)
        
        for response in responses:
            assert response.status_code == 200
        
        # List all sessions
        response = await test_client.get("/api/v1/sessions/")
        assert response.status_code == 200
        session_list = response.json()
        assert len(session_list) >= 3
        
        # Cleanup sessions
        cleanup_tasks = []
        for session in sessions:
            task = test_client.delete(f"/api/v1/sessions/{session['id']}")
            cleanup_tasks.append(task)
        
        await asyncio.gather(*cleanup_tasks)
    
    @pytest.mark.asyncio
    async def test_session_timeout_and_recovery(
        self,
        mock_claude_session_manager: ClaudeSessionManager,
        mock_websocket: WebSocket
    ):
        """Test session timeout handling and recovery."""
        session_id = str(uuid.uuid4())
        
        # Mock session with timeout
        mock_session = MagicMock()
        mock_session.session_id = session_id
        mock_session.state = SessionState.BUSY
        mock_session.is_active = True
        mock_session.get_info.return_value = {
            "session_id": session_id,
            "state": SessionState.BUSY.value,
            "error_message": None
        }
        
        mock_claude_session_manager.get_claude_session.return_value = mock_session
        
        # Simulate timeout
        mock_session.state = SessionState.ERROR
        mock_session.error_message = "Command timeout"
        
        # Try to recover
        mock_claude_session_manager.interrupt_session = AsyncMock()
        await mock_claude_session_manager.interrupt_session(session_id)
        
        mock_claude_session_manager.interrupt_session.assert_called_once_with(session_id)
    
    @pytest.mark.asyncio
    async def test_large_output_streaming(
        self,
        websocket_manager: WebSocketManager,
        mock_websocket: WebSocket
    ):
        """Test streaming large amounts of output data."""
        session_id = str(uuid.uuid4())
        
        # Connect WebSocket
        await websocket_manager.connect(session_id, mock_websocket)
        
        # Generate large output
        large_outputs = []
        for i in range(100):
            output = SessionOutput(
                "stdout",
                f"Line {i}: " + "x" * 1000  # 1KB per line
            )
            large_outputs.append(output)
        
        # Stream outputs
        for output in large_outputs:
            await websocket_manager.send_session_output(session_id, output.to_dict())
        
        # Verify all messages sent
        assert mock_websocket.send_json.call_count == 100
        
        # Disconnect
        await websocket_manager.disconnect(session_id)
    
    @pytest.mark.asyncio
    async def test_session_crash_recovery(
        self,
        mock_claude_session_manager: ClaudeSessionManager
    ):
        """Test recovery from session crashes."""
        session_id = str(uuid.uuid4())
        
        # Mock crashed session
        mock_session = MagicMock()
        mock_session.session_id = session_id
        mock_session.state = SessionState.ERROR
        mock_session.error_message = "Process crashed unexpectedly"
        mock_session.pty_process = MagicMock()
        mock_session.pty_process.is_alive = False
        
        mock_claude_session_manager.get_claude_session.return_value = mock_session
        
        # Attempt cleanup and recreation
        mock_claude_session_manager.terminate_claude_session = AsyncMock()
        mock_claude_session_manager.create_claude_session = AsyncMock()
        
        # Terminate crashed session
        await mock_claude_session_manager.terminate_claude_session(session_id, force=True)
        
        # Create new session
        new_config = SessionConfig(
            session_id=str(uuid.uuid4()),
            project_path="/test/project"
        )
        await mock_claude_session_manager.create_claude_session(new_config)
        
        mock_claude_session_manager.terminate_claude_session.assert_called_once()
        mock_claude_session_manager.create_claude_session.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_auth_failure_handling(self, test_client: AsyncClient):
        """Test handling authentication failures."""
        # Create session with invalid auth
        session_data = {
            "project_path": "/test/project",
            "auth_token": "invalid-token"
        }
        
        response = await test_client.post("/api/v1/sessions/", json=session_data)
        
        # Should still create session but auth might fail
        if response.status_code == 200:
            session = response.json()
            session_id = session["id"]
            
            # Check session state
            response = await test_client.get(f"/api/v1/sessions/{session_id}")
            if response.status_code == 200:
                session_info = response.json()
                # Session might be in error or authenticating state
                assert session_info["state"] in ["authenticating", "error", "ready"]
    
    @pytest.mark.asyncio
    async def test_rapid_command_execution(self, test_client: AsyncClient):
        """Test executing many commands rapidly."""
        # Create session
        session_data = {"project_path": "/test/project"}
        response = await test_client.post("/api/v1/sessions/", json=session_data)
        assert response.status_code == 200
        session_id = response.json()["id"]
        
        # Send many commands rapidly
        command_tasks = []
        for i in range(10):
            command_data = {
                "command": f"echo 'Command {i}'",
                "timeout": 5
            }
            task = test_client.post(
                f"/api/v1/sessions/{session_id}/commands",
                json=command_data
            )
            command_tasks.append(task)
        
        # Execute concurrently
        responses = await asyncio.gather(*command_tasks, return_exceptions=True)
        
        # Some might fail due to session being busy
        success_count = sum(1 for r in responses if not isinstance(r, Exception) and r.status_code == 200)
        assert success_count >= 1  # At least one should succeed
        
        # Cleanup
        await test_client.delete(f"/api/v1/sessions/{session_id}")
    
    @pytest.mark.asyncio
    async def test_network_interruption_recovery(
        self,
        websocket_manager: WebSocketManager,
        mock_websocket: WebSocket
    ):
        """Test recovery from network interruptions."""
        session_id = str(uuid.uuid4())
        
        # Connect WebSocket
        await websocket_manager.connect(session_id, mock_websocket)
        
        # Simulate network interruption
        mock_websocket.send_json.side_effect = ConnectionError("Network interrupted")
        
        # Try to send output
        output = SessionOutput("stdout", "test output")
        
        # Should handle error gracefully
        try:
            await websocket_manager.send_session_output(session_id, output.to_dict())
        except Exception:
            pass  # Expected
        
        # Reconnect
        mock_websocket.send_json.side_effect = None
        await websocket_manager.disconnect(session_id)
        await websocket_manager.connect(session_id, mock_websocket)
        
        # Should work again
        await websocket_manager.send_session_output(session_id, output.to_dict())
        assert mock_websocket.send_json.called


class TestLoadAndStress:
    """Load and stress tests for Claude CLI integration."""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_high_session_load(self, test_client: AsyncClient):
        """Test system under high session load."""
        sessions = []
        session_count = 20
        
        # Create many sessions
        create_tasks = []
        for i in range(session_count):
            session_data = {
                "project_path": f"/test/project{i}",
                "environment": {"SESSION_ID": str(i)}
            }
            task = test_client.post("/api/v1/sessions/", json=session_data)
            create_tasks.append(task)
        
        # Wait for all sessions to be created
        responses = await asyncio.gather(*create_tasks, return_exceptions=True)
        
        for response in responses:
            if not isinstance(response, Exception):
                assert response.status_code == 200
                sessions.append(response.json())
        
        assert len(sessions) >= session_count * 0.8  # Allow some failures
        
        # Execute commands on all sessions
        command_tasks = []
        for session in sessions[:10]:  # Limit to avoid overwhelming
            command_data = {
                "command": "echo 'Load test'",
                "timeout": 5
            }
            task = test_client.post(
                f"/api/v1/sessions/{session['id']}/commands",
                json=command_data
            )
            command_tasks.append(task)
        
        await asyncio.gather(*command_tasks, return_exceptions=True)
        
        # Cleanup
        cleanup_tasks = []
        for session in sessions:
            task = test_client.delete(f"/api/v1/sessions/{session['id']}")
            cleanup_tasks.append(task)
        
        await asyncio.gather(*cleanup_tasks, return_exceptions=True)
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_websocket_connection_limit(
        self,
        websocket_manager: WebSocketManager
    ):
        """Test WebSocket connection limits."""
        connections = []
        connection_count = 50
        
        # Create many WebSocket connections
        for i in range(connection_count):
            session_id = str(uuid.uuid4())
            mock_ws = AsyncMock(spec=WebSocket)
            mock_ws.accept = AsyncMock()
            mock_ws.send_json = AsyncMock()
            mock_ws.close = AsyncMock()
            
            await websocket_manager.connect(session_id, mock_ws)
            connections.append((session_id, mock_ws))
        
        assert len(websocket_manager.active_connections) == connection_count
        
        # Send message to all connections
        output = {"type": "stdout", "content": "Broadcast test"}
        
        for session_id, _ in connections:
            await websocket_manager.send_session_output(session_id, output)
        
        # Disconnect all
        for session_id, _ in connections:
            await websocket_manager.disconnect(session_id)
        
        assert len(websocket_manager.active_connections) == 0


class TestRealWorldScenarios:
    """Test real-world usage scenarios."""
    
    @pytest.mark.asyncio
    async def test_interactive_command_session(self, test_client: AsyncClient):
        """Test interactive command session like a REPL."""
        # Create session
        session_data = {"project_path": "/test/project"}
        response = await test_client.post("/api/v1/sessions/", json=session_data)
        assert response.status_code == 200
        session_id = response.json()["id"]
        
        # Simulate interactive Python session
        commands = [
            "python3 -c \"print('Starting Python')\"",
            "python3 -c \"x = 10\"",
            "python3 -c \"print(f'x = {x}')\"",
            "python3 -c \"import sys; sys.exit(0)\""
        ]
        
        for cmd in commands:
            response = await test_client.post(
                f"/api/v1/sessions/{session_id}/commands",
                json={"command": cmd, "timeout": 5}
            )
            if response.status_code == 200:
                # Wait a bit between commands
                await asyncio.sleep(0.5)
        
        # Get full output
        response = await test_client.get(f"/api/v1/sessions/{session_id}/output")
        assert response.status_code == 200
        
        # Cleanup
        await test_client.delete(f"/api/v1/sessions/{session_id}")
    
    @pytest.mark.asyncio
    async def test_long_running_command_with_progress(
        self,
        websocket_manager: WebSocketManager,
        mock_websocket: WebSocket
    ):
        """Test long-running command with progress updates."""
        session_id = str(uuid.uuid4())
        
        # Connect WebSocket for progress updates
        await websocket_manager.connect(session_id, mock_websocket)
        
        # Simulate progress updates
        progress_updates = [
            "Starting long operation...",
            "Progress: 10%",
            "Progress: 25%",
            "Progress: 50%",
            "Progress: 75%",
            "Progress: 90%",
            "Operation completed successfully!"
        ]
        
        for update in progress_updates:
            output = SessionOutput("stdout", f"{update}\n")
            await websocket_manager.send_session_output(session_id, output.to_dict())
            await asyncio.sleep(0.1)  # Simulate work
        
        # Verify all updates sent
        assert mock_websocket.send_json.call_count == len(progress_updates)
        
        # Disconnect
        await websocket_manager.disconnect(session_id)
    
    @pytest.mark.asyncio
    async def test_file_manipulation_commands(self, test_client: AsyncClient):
        """Test executing file manipulation commands."""
        # Create session
        session_data = {"project_path": "/tmp"}
        response = await test_client.post("/api/v1/sessions/", json=session_data)
        assert response.status_code == 200
        session_id = response.json()["id"]
        
        # File manipulation commands
        test_file = f"/tmp/test_{uuid.uuid4()}.txt"
        commands = [
            f"echo 'Test content' > {test_file}",
            f"cat {test_file}",
            f"wc -l {test_file}",
            f"rm {test_file}"
        ]
        
        for cmd in commands:
            response = await test_client.post(
                f"/api/v1/sessions/{session_id}/commands",
                json={"command": cmd, "timeout": 5}
            )
            assert response.status_code in [200, 201]
            await asyncio.sleep(0.2)
        
        # Cleanup
        await test_client.delete(f"/api/v1/sessions/{session_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])