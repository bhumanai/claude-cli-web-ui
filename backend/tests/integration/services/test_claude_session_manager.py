"""Integration tests for Claude session manager."""

import asyncio
import os
import signal
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

from app.models.schemas import CommandResponse, CommandStatus, SessionInfo
from app.services.claude_cli.claude_session import (
    ClaudeCliSession,
    SessionConfig,
    SessionOutput,
    SessionState,
)
from app.services.claude_cli.claude_session_manager import ClaudeSessionManager
from app.services.claude_cli.pty_manager import PtyManager
from app.services.claude_cli.pty_process import PtyProcess


@pytest.fixture
async def session_manager():
    """Create a Claude session manager instance."""
    manager = ClaudeSessionManager()
    await manager.start()
    yield manager
    await manager.stop()


@pytest.fixture
def mock_pty_process():
    """Create a mock PTY process."""
    process = Mock(spec=PtyProcess)
    process.pid = 12345
    process.master_fd = 10
    process.is_alive = True
    process.wait = AsyncMock(return_value=0)
    process.send_signal = AsyncMock()
    process.cleanup = AsyncMock()
    process.reader = AsyncMock()
    process.writer = AsyncMock()
    return process


@pytest.fixture
def session_config():
    """Create a test session configuration."""
    return SessionConfig(
        session_id=str(uuid.uuid4()),
        task_id="test-task-" + str(uuid.uuid4()),
        project_path="/test/project",
        environment={"TEST_VAR": "test_value"},
        timeout=300,
        terminal_size=(120, 40)
    )


class TestClaudeSessionManager:
    """Test Claude session manager functionality."""
    
    @pytest.mark.asyncio
    async def test_start_stop(self):
        """Test starting and stopping the manager."""
        manager = ClaudeSessionManager()
        
        # Start manager
        await manager.start()
        assert manager.is_active is True
        
        # Stop manager
        await manager.stop()
        assert manager.is_active is False
    
    @pytest.mark.asyncio
    async def test_create_claude_session(self, session_manager, session_config, mock_pty_process):
        """Test creating a Claude CLI session."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            # Set up mock to avoid hanging on read
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create session
            session = await session_manager.create_claude_session(session_config)
            
            assert session is not None
            assert session.session_id == session_config.session_id
            assert session.task_id == session_config.task_id
            assert session_config.session_id in session_manager.claude_sessions
            assert session_manager.task_to_session.get(session_config.task_id) == session_config.session_id
    
    @pytest.mark.asyncio
    async def test_create_duplicate_session(self, session_manager, session_config, mock_pty_process):
        """Test creating duplicate session fails."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create first session
            await session_manager.create_claude_session(session_config)
            
            # Try to create duplicate
            with pytest.raises(RuntimeError, match="already exists"):
                await session_manager.create_claude_session(session_config)
    
    @pytest.mark.asyncio
    async def test_create_session_with_output_callback(self, session_manager, session_config, mock_pty_process):
        """Test creating session with output callback."""
        outputs_received = []
        
        def output_callback(output: SessionOutput):
            outputs_received.append(output)
        
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create session with callback
            session = await session_manager.create_claude_session(
                session_config,
                output_callback=output_callback
            )
            
            # Simulate output
            test_output = SessionOutput("stdout", "test output")
            await session._handle_output(test_output)
            
            assert len(outputs_received) == 1
            assert outputs_received[0].content == "test output"
    
    @pytest.mark.asyncio
    async def test_get_claude_session(self, session_manager, session_config, mock_pty_process):
        """Test getting a Claude session by ID."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create session
            created_session = await session_manager.create_claude_session(session_config)
            
            # Get session
            retrieved_session = await session_manager.get_claude_session(session_config.session_id)
            
            assert retrieved_session is created_session
    
    @pytest.mark.asyncio
    async def test_get_session_by_task(self, session_manager, session_config, mock_pty_process):
        """Test getting a Claude session by task ID."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create session
            created_session = await session_manager.create_claude_session(session_config)
            
            # Get session by task ID
            retrieved_session = await session_manager.get_session_by_task(session_config.task_id)
            
            assert retrieved_session is created_session
    
    @pytest.mark.asyncio
    async def test_send_command_to_session(self, session_manager, session_config, mock_pty_process):
        """Test sending a command to a session."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.write_to_pty = AsyncMock()
            
            # Create and initialize session
            session = await session_manager.create_claude_session(session_config)
            
            # Mock command response
            with patch('app.services.claude_cli.claude_session_manager.uuid.uuid4', return_value='cmd-123'):
                response = await session_manager.send_command_to_session(
                    session_config.session_id,
                    "test command"
                )
            
            assert response.command == "test command"
            assert response.session_id == session_config.session_id
            assert response.status == CommandStatus.RUNNING
    
    @pytest.mark.asyncio
    async def test_send_command_to_nonexistent_session(self, session_manager):
        """Test sending command to nonexistent session."""
        with pytest.raises(ValueError, match="Session .* not found"):
            await session_manager.send_command_to_session(
                "nonexistent-session",
                "test command"
            )
    
    @pytest.mark.asyncio
    async def test_send_command_with_timeout(self, session_manager, session_config, mock_pty_process):
        """Test sending command with timeout."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.write_to_pty = AsyncMock()
            session_manager.pty_manager.send_signal = AsyncMock()
            
            # Create session
            session = await session_manager.create_claude_session(session_config)
            
            # Send command with very short timeout
            response = await session_manager.send_command_to_session(
                session_config.session_id,
                "sleep 10",
                timeout=1  # 1 second timeout
            )
            
            # Wait for timeout to trigger
            await asyncio.sleep(1.5)
            
            # Should have sent interrupt signal
            session_manager.pty_manager.send_signal.assert_called_with(
                mock_pty_process,
                signal.SIGINT
            )
    
    @pytest.mark.asyncio
    async def test_get_session_output(self, session_manager, session_config, mock_pty_process):
        """Test getting session output."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create session
            session = await session_manager.create_claude_session(session_config)
            
            # Add some output
            for i in range(5):
                output = SessionOutput("stdout", f"output {i}")
                await session._handle_output(output)
            
            # Get output
            outputs = await session_manager.get_session_output(session_config.session_id)
            
            assert len(outputs) == 5
            assert outputs[0].content == "output 0"
            
            # Get limited output
            outputs = await session_manager.get_session_output(
                session_config.session_id,
                limit=3
            )
            assert len(outputs) == 3
    
    @pytest.mark.asyncio
    async def test_resize_session_terminal(self, session_manager, session_config, mock_pty_process):
        """Test resizing session terminal."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.resize_pty = AsyncMock()
            
            # Create session
            await session_manager.create_claude_session(session_config)
            
            # Resize terminal
            await session_manager.resize_session_terminal(
                session_config.session_id,
                160, 50
            )
            
            session_manager.pty_manager.resize_pty.assert_called_once_with(
                mock_pty_process, 160, 50
            )
    
    @pytest.mark.asyncio
    async def test_interrupt_session(self, session_manager, session_config, mock_pty_process):
        """Test interrupting a session."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.send_signal = AsyncMock()
            
            # Create session
            await session_manager.create_claude_session(session_config)
            
            # Interrupt session
            await session_manager.interrupt_session(session_config.session_id)
            
            session_manager.pty_manager.send_signal.assert_called_once_with(
                mock_pty_process, signal.SIGINT
            )
    
    @pytest.mark.asyncio
    async def test_terminate_claude_session(self, session_manager, session_config, mock_pty_process):
        """Test terminating a Claude session."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.write_to_pty = AsyncMock()
            session_manager.pty_manager.send_signal = AsyncMock()
            session_manager.pty_manager.cleanup_process = AsyncMock()
            
            # Create session
            await session_manager.create_claude_session(session_config)
            
            # Terminate session
            await session_manager.terminate_claude_session(session_config.session_id)
            
            # Session should be removed
            assert session_config.session_id not in session_manager.claude_sessions
            assert session_config.task_id not in session_manager.task_to_session
    
    @pytest.mark.asyncio
    async def test_delete_session(self, session_manager, session_config, mock_pty_process):
        """Test deleting a session."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.write_to_pty = AsyncMock()
            session_manager.pty_manager.send_signal = AsyncMock()
            session_manager.pty_manager.cleanup_process = AsyncMock()
            
            # Create session
            await session_manager.create_claude_session(session_config)
            
            # Delete session
            result = await session_manager.delete_session(session_config.session_id)
            
            assert result is True
            assert session_config.session_id not in session_manager.claude_sessions
    
    @pytest.mark.asyncio
    async def test_list_claude_sessions(self, session_manager, mock_pty_process):
        """Test listing all Claude sessions."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create multiple sessions
            sessions = []
            for i in range(3):
                config = SessionConfig(
                    session_id=f"session-{i}",
                    task_id=f"task-{i}"
                )
                await session_manager.create_claude_session(config)
                sessions.append(config)
            
            # List sessions
            session_list = await session_manager.list_claude_sessions()
            
            assert len(session_list) == 3
            for i, info in enumerate(session_list):
                assert info["session_id"] in [s.session_id for s in sessions]
    
    @pytest.mark.asyncio
    async def test_get_claude_session_stats(self, session_manager, mock_pty_process):
        """Test getting Claude session statistics."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create sessions in different states
            for i in range(3):
                config = SessionConfig(session_id=f"session-{i}")
                session = await session_manager.create_claude_session(config)
                if i == 1:
                    await session._transition_state(SessionState.BUSY)
                elif i == 2:
                    await session._transition_state(SessionState.ERROR)
            
            # Get stats
            stats = await session_manager.get_claude_session_stats()
            
            assert stats["total_claude_sessions"] == 3
            assert stats["state_counts"][SessionState.READY.value] == 1
            assert stats["state_counts"][SessionState.BUSY.value] == 1
            assert stats["state_counts"][SessionState.ERROR.value] == 1
    
    @pytest.mark.asyncio
    async def test_register_unregister_output_callback(self, session_manager):
        """Test registering and unregistering output callbacks."""
        session_id = "test-session"
        
        def callback1(sid: str, output: SessionOutput):
            pass
        
        def callback2(sid: str, output: SessionOutput):
            pass
        
        # Register callbacks
        await session_manager.register_output_callback(session_id, callback1)
        await session_manager.register_output_callback(session_id, callback2)
        
        assert len(session_manager._output_callbacks[session_id]) == 2
        
        # Unregister one callback
        await session_manager.unregister_output_callback(session_id, callback1)
        
        assert len(session_manager._output_callbacks[session_id]) == 1
        assert session_manager._output_callbacks[session_id][0] == callback2
    
    @pytest.mark.asyncio
    async def test_broadcast_to_session_callbacks(self, session_manager):
        """Test broadcasting output to callbacks."""
        session_id = "test-session"
        received_outputs = []
        
        def callback(sid: str, output: SessionOutput):
            received_outputs.append((sid, output))
        
        # Register callback
        await session_manager.register_output_callback(session_id, callback)
        
        # Broadcast output
        test_output = SessionOutput("stdout", "test broadcast")
        await session_manager.broadcast_to_session_callbacks(session_id, test_output)
        
        assert len(received_outputs) == 1
        assert received_outputs[0][0] == session_id
        assert received_outputs[0][1].content == "test broadcast"
    
    @pytest.mark.asyncio
    async def test_cleanup_expired_claude_sessions(self, session_manager, mock_pty_process):
        """Test cleaning up expired Claude sessions."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.write_to_pty = AsyncMock()
            session_manager.pty_manager.send_signal = AsyncMock()
            session_manager.pty_manager.cleanup_process = AsyncMock()
            
            # Create sessions
            active_config = SessionConfig(session_id="active-session")
            terminated_config = SessionConfig(session_id="terminated-session")
            error_config = SessionConfig(session_id="error-session")
            
            active_session = await session_manager.create_claude_session(active_config)
            terminated_session = await session_manager.create_claude_session(terminated_config)
            error_session = await session_manager.create_claude_session(error_config)
            
            # Set states
            await terminated_session._transition_state(SessionState.ERROR)
            await terminated_session._transition_state(SessionState.TERMINATED)
            await error_session._transition_state(SessionState.ERROR)
            
            # Run cleanup
            await session_manager.cleanup_expired_claude_sessions()
            
            # Only active session should remain
            assert "active-session" in session_manager.claude_sessions
            assert "terminated-session" not in session_manager.claude_sessions
            assert "error-session" not in session_manager.claude_sessions


class TestConcurrentOperations:
    """Test concurrent operations on session manager."""
    
    @pytest.mark.asyncio
    async def test_concurrent_session_creation(self, session_manager, mock_pty_process):
        """Test creating multiple sessions concurrently."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create sessions concurrently
            configs = [
                SessionConfig(session_id=f"session-{i}", task_id=f"task-{i}")
                for i in range(5)
            ]
            
            tasks = [
                session_manager.create_claude_session(config)
                for config in configs
            ]
            
            sessions = await asyncio.gather(*tasks)
            
            assert len(sessions) == 5
            assert len(session_manager.claude_sessions) == 5
    
    @pytest.mark.asyncio
    async def test_concurrent_command_sending(self, session_manager, mock_pty_process):
        """Test sending commands to multiple sessions concurrently."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.write_to_pty = AsyncMock()
            
            # Create multiple sessions
            sessions = []
            for i in range(3):
                config = SessionConfig(session_id=f"session-{i}")
                await session_manager.create_claude_session(config)
                sessions.append(config)
            
            # Send commands concurrently
            tasks = [
                session_manager.send_command_to_session(
                    config.session_id,
                    f"command for session {i}"
                )
                for i, config in enumerate(sessions)
            ]
            
            responses = await asyncio.gather(*tasks)
            
            assert len(responses) == 3
            for i, response in enumerate(responses):
                assert response.command == f"command for session {i}"
    
    @pytest.mark.asyncio
    async def test_concurrent_session_termination(self, session_manager, mock_pty_process):
        """Test terminating multiple sessions concurrently."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            session_manager.pty_manager.write_to_pty = AsyncMock()
            session_manager.pty_manager.send_signal = AsyncMock()
            session_manager.pty_manager.cleanup_process = AsyncMock()
            
            # Create multiple sessions
            session_ids = []
            for i in range(3):
                config = SessionConfig(session_id=f"session-{i}")
                await session_manager.create_claude_session(config)
                session_ids.append(config.session_id)
            
            # Terminate sessions concurrently
            tasks = [
                session_manager.terminate_claude_session(session_id)
                for session_id in session_ids
            ]
            
            await asyncio.gather(*tasks)
            
            # All sessions should be terminated
            assert len(session_manager.claude_sessions) == 0


class TestErrorScenarios:
    """Test error handling scenarios."""
    
    @pytest.mark.asyncio
    async def test_session_creation_failure_cleanup(self, session_manager):
        """Test cleanup when session creation fails."""
        # Mock PTY creation to fail
        session_manager.pty_manager.create_pty = AsyncMock(
            side_effect=Exception("PTY creation failed")
        )
        
        config = SessionConfig(session_id="failing-session")
        
        with pytest.raises(RuntimeError, match="Failed to create Claude session"):
            await session_manager.create_claude_session(config)
        
        # Session should not be in manager
        assert "failing-session" not in session_manager.claude_sessions
        assert "failing-session" not in session_manager.sessions
    
    @pytest.mark.asyncio
    async def test_command_failure_handling(self, session_manager, session_config, mock_pty_process):
        """Test handling command execution failures."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create session
            session = await session_manager.create_claude_session(session_config)
            
            # Make send_command fail
            session.send_command = AsyncMock(side_effect=Exception("Command failed"))
            
            # Try to send command
            with pytest.raises(Exception, match="Command failed"):
                await session_manager.send_command_to_session(
                    session_config.session_id,
                    "failing command"
                )
    
    @pytest.mark.asyncio
    async def test_callback_error_handling(self, session_manager):
        """Test handling errors in output callbacks."""
        session_id = "test-session"
        
        def failing_callback(sid: str, output: SessionOutput):
            raise Exception("Callback error")
        
        # Register failing callback
        await session_manager.register_output_callback(session_id, failing_callback)
        
        # Broadcast should not raise
        test_output = SessionOutput("stdout", "test")
        await session_manager.broadcast_to_session_callbacks(session_id, test_output)


class TestLoadTesting:
    """Test session manager under load."""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_many_sessions(self, session_manager, mock_pty_process):
        """Test creating and managing many sessions."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create many sessions
            session_count = 50
            sessions = []
            
            for i in range(session_count):
                config = SessionConfig(
                    session_id=f"session-{i}",
                    task_id=f"task-{i}"
                )
                session = await session_manager.create_claude_session(config)
                sessions.append(session)
            
            # Verify all created
            assert len(session_manager.claude_sessions) == session_count
            
            # Get stats
            stats = await session_manager.get_claude_session_stats()
            assert stats["total_claude_sessions"] == session_count
            
            # Clean up all
            await session_manager.stop()
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_high_output_volume(self, session_manager, session_config, mock_pty_process):
        """Test handling high volume of output data."""
        with patch.object(session_manager.pty_manager, 'create_pty', return_value=mock_pty_process):
            session_manager.pty_manager.read_from_pty = AsyncMock(return_value=None)
            
            # Create session
            session = await session_manager.create_claude_session(session_config)
            
            # Generate lots of output
            for i in range(1000):
                output = SessionOutput("stdout", f"Line {i}: " + "x" * 100)
                await session._handle_output(output)
            
            # Get output
            outputs = await session_manager.get_session_output(
                session_config.session_id,
                limit=100
            )
            
            assert len(outputs) == 100


if __name__ == "__main__":
    pytest.main([__file__, "-v"])