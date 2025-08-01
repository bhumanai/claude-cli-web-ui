"""Unit tests for Claude CLI session management."""

import asyncio
import os
import signal
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

from app.services.claude_cli.claude_session import (
    ClaudeCliSession,
    SessionConfig,
    SessionOutput,
    SessionState,
)
from app.services.claude_cli.pty_manager import PtyError, PtyManager
from app.services.claude_cli.pty_process import PtyProcess


@pytest.fixture
def mock_pty_manager():
    """Create a mock PTY manager."""
    manager = AsyncMock(spec=PtyManager)
    return manager


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
        session_id="test-session-123",
        task_id="test-task-456",
        project_path="/test/project",
        environment={"TEST_VAR": "test_value"},
        timeout=300,
        max_retries=3,
        terminal_size=(120, 40),
        auth_token="test-auth-token",
        metadata={"test_key": "test_value"}
    )


@pytest.fixture
async def claude_session(session_config, mock_pty_manager, mock_pty_process):
    """Create a Claude CLI session instance."""
    mock_pty_manager.create_pty.return_value = mock_pty_process
    
    session = ClaudeCliSession(
        config=session_config,
        pty_manager=mock_pty_manager,
        output_callback=None
    )
    
    # Set up reader mock to return None (no data)
    mock_pty_process.reader.read.return_value = b""
    
    yield session
    
    # Cleanup
    if session._pty_reader_task and not session._pty_reader_task.done():
        session._pty_reader_task.cancel()
        try:
            await session._pty_reader_task
        except asyncio.CancelledError:
            pass


class TestSessionConfig:
    """Test SessionConfig class."""
    
    def test_config_defaults(self):
        """Test default configuration values."""
        config = SessionConfig()
        
        assert config.session_id is not None
        assert config.task_id is None
        assert config.project_path == "."
        assert config.environment == {}
        assert config.timeout == 300
        assert config.max_retries == 3
        assert config.terminal_size == (120, 40)
        assert config.auth_token is None
        assert config.metadata == {}
        assert isinstance(config.created_at, datetime)
    
    def test_config_custom_values(self):
        """Test custom configuration values."""
        config = SessionConfig(
            session_id="custom-id",
            task_id="task-123",
            project_path="/custom/path",
            environment={"KEY": "value"},
            timeout=600,
            max_retries=5,
            terminal_size=(80, 24),
            auth_token="auth-123",
            metadata={"custom": "data"}
        )
        
        assert config.session_id == "custom-id"
        assert config.task_id == "task-123"
        assert config.project_path == "/custom/path"
        assert config.environment == {"KEY": "value"}
        assert config.timeout == 600
        assert config.max_retries == 5
        assert config.terminal_size == (80, 24)
        assert config.auth_token == "auth-123"
        assert config.metadata == {"custom": "data"}


class TestSessionOutput:
    """Test SessionOutput class."""
    
    def test_output_creation(self):
        """Test creating session output."""
        output = SessionOutput("stdout", "test content")
        
        assert output.type == "stdout"
        assert output.content == "test content"
        assert isinstance(output.timestamp, datetime)
    
    def test_output_to_dict(self):
        """Test converting output to dictionary."""
        timestamp = datetime.utcnow()
        output = SessionOutput("stderr", "error message", timestamp)
        
        result = output.to_dict()
        assert result["type"] == "stderr"
        assert result["content"] == "error message"
        assert result["timestamp"] == timestamp.isoformat()


class TestClaudeCliSession:
    """Test ClaudeCliSession class."""
    
    @pytest.mark.asyncio
    async def test_session_creation(self, session_config, mock_pty_manager):
        """Test creating a Claude CLI session."""
        session = ClaudeCliSession(
            config=session_config,
            pty_manager=mock_pty_manager,
            output_callback=None
        )
        
        assert session.session_id == "test-session-123"
        assert session.task_id == "test-task-456"
        assert session.state == SessionState.INITIALIZING
        assert session.is_active is False
        assert session.is_ready is False
        assert session.started_at is None
        assert session.terminated_at is None
        assert session.error_message is None
        assert len(session.command_history) == 0
        assert len(session.output_buffer) == 0
    
    @pytest.mark.asyncio
    async def test_state_transitions_valid(self, claude_session):
        """Test valid state transitions."""
        # INITIALIZING -> AUTHENTICATING
        await claude_session._transition_state(SessionState.AUTHENTICATING)
        assert claude_session.state == SessionState.AUTHENTICATING
        
        # AUTHENTICATING -> READY
        await claude_session._transition_state(SessionState.READY)
        assert claude_session.state == SessionState.READY
        
        # READY -> BUSY
        await claude_session._transition_state(SessionState.BUSY)
        assert claude_session.state == SessionState.BUSY
        
        # BUSY -> IDLE
        await claude_session._transition_state(SessionState.IDLE)
        assert claude_session.state == SessionState.IDLE
        
        # IDLE -> TERMINATING
        await claude_session._transition_state(SessionState.TERMINATING)
        assert claude_session.state == SessionState.TERMINATING
        
        # TERMINATING -> TERMINATED
        await claude_session._transition_state(SessionState.TERMINATED)
        assert claude_session.state == SessionState.TERMINATED
    
    @pytest.mark.asyncio
    async def test_state_transitions_invalid(self, claude_session):
        """Test invalid state transitions."""
        # INITIALIZING -> BUSY (invalid)
        with pytest.raises(ValueError, match="Invalid state transition"):
            await claude_session._transition_state(SessionState.BUSY)
        
        # Transition to TERMINATED
        await claude_session._transition_state(SessionState.ERROR)
        await claude_session._transition_state(SessionState.TERMINATED)
        
        # TERMINATED -> any state (invalid)
        with pytest.raises(ValueError, match="Invalid state transition"):
            await claude_session._transition_state(SessionState.READY)
    
    @pytest.mark.asyncio
    async def test_initialize_success(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test successful session initialization."""
        mock_pty_manager.create_pty.return_value = mock_pty_process
        mock_pty_manager.write_to_pty = AsyncMock()
        
        await claude_session.initialize()
        
        # Check PTY creation
        mock_pty_manager.create_pty.assert_called_once()
        call_args = mock_pty_manager.create_pty.call_args
        assert call_args[1]["command"] == ["claude", "code"]
        assert call_args[1]["cwd"] == "/test/project"
        assert call_args[1]["size"] == (120, 40)
        
        # Check state
        assert claude_session.state == SessionState.READY  # Would be AUTHENTICATING with auth
        assert claude_session.started_at is not None
        assert claude_session.pty_process == mock_pty_process
        assert claude_session._pty_reader_task is not None
    
    @pytest.mark.asyncio
    async def test_initialize_with_auth(self, session_config, mock_pty_manager, mock_pty_process):
        """Test initialization with authentication."""
        session_config.auth_token = "test-token"
        session = ClaudeCliSession(
            config=session_config,
            pty_manager=mock_pty_manager,
            output_callback=None
        )
        
        mock_pty_manager.create_pty.return_value = mock_pty_process
        mock_pty_manager.write_to_pty = AsyncMock()
        
        # Mock the reader to avoid hanging
        mock_pty_process.reader.read.return_value = b""
        
        await session.initialize()
        
        # Should have sent auth command
        mock_pty_manager.write_to_pty.assert_called()
        auth_call = mock_pty_manager.write_to_pty.call_args_list[0]
        assert b"auth test-token" in auth_call[0][1]
        
        # Cleanup
        if session._pty_reader_task:
            session._pty_reader_task.cancel()
            try:
                await session._pty_reader_task
            except asyncio.CancelledError:
                pass
    
    @pytest.mark.asyncio
    async def test_initialize_failure(self, claude_session, mock_pty_manager):
        """Test initialization failure."""
        mock_pty_manager.create_pty.side_effect = Exception("PTY creation failed")
        
        with pytest.raises(Exception, match="PTY creation failed"):
            await claude_session.initialize()
        
        assert claude_session.state == SessionState.ERROR
        assert claude_session.error_message == "PTY creation failed"
    
    @pytest.mark.asyncio
    async def test_send_command_success(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test sending a command successfully."""
        # Initialize session first
        mock_pty_manager.create_pty.return_value = mock_pty_process
        await claude_session.initialize()
        
        # Send command
        command_id = await claude_session.send_command("test command")
        
        assert command_id is not None
        assert claude_session.state == SessionState.BUSY
        assert len(claude_session.command_history) == 1
        assert claude_session.command_history[0]["command"] == "test command"
        assert command_id in claude_session._active_commands
        
        # Check that command was sent to PTY
        mock_pty_manager.write_to_pty.assert_called_with(
            mock_pty_process,
            b"test command\n"
        )
    
    @pytest.mark.asyncio
    async def test_send_command_not_ready(self, claude_session):
        """Test sending command when session is not ready."""
        with pytest.raises(RuntimeError, match="Session not ready for commands"):
            await claude_session.send_command("test command")
    
    @pytest.mark.asyncio
    async def test_send_input(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test sending raw input to PTY."""
        claude_session.pty_process = mock_pty_process
        
        await claude_session.send_input("raw input")
        
        mock_pty_manager.write_to_pty.assert_called_once_with(
            mock_pty_process,
            b"raw input"
        )
    
    @pytest.mark.asyncio
    async def test_send_input_no_process(self, claude_session):
        """Test sending input when no PTY process exists."""
        with pytest.raises(RuntimeError, match="PTY process is not active"):
            await claude_session.send_input("test")
    
    @pytest.mark.asyncio
    async def test_handle_output(self, claude_session):
        """Test handling output from PTY."""
        output_callback = Mock()
        claude_session.output_callback = output_callback
        
        output = SessionOutput("stdout", "test output")
        await claude_session._handle_output(output)
        
        # Check buffer
        assert len(claude_session.output_buffer) == 1
        assert claude_session.output_buffer[0] == output
        
        # Check callback
        output_callback.assert_called_once_with(output)
    
    @pytest.mark.asyncio
    async def test_handle_output_buffer_limit(self, claude_session):
        """Test output buffer size limit."""
        # Add many outputs to exceed buffer limit
        for i in range(10005):
            output = SessionOutput("stdout", f"output {i}")
            await claude_session._handle_output(output)
        
        # Buffer should be limited to 10000
        assert len(claude_session.output_buffer) == 10000
        # First outputs should be removed
        assert claude_session.output_buffer[0].content == "output 5"
    
    @pytest.mark.asyncio
    async def test_handle_output_command_completion(self, claude_session):
        """Test detecting command completion in output."""
        # Add active command
        command_id = "test-cmd-123"
        claude_session._active_commands.add(command_id)
        claude_session._state = SessionState.BUSY
        claude_session.command_history.append({
            "id": command_id,
            "command": "test",
            "status": "sent"
        })
        
        # Handle output with completion marker
        output = SessionOutput("stdout", "Command completed successfully")
        await claude_session._handle_output(output)
        
        # Command should be marked as complete
        assert command_id not in claude_session._active_commands
        assert claude_session.command_history[0]["status"] == "completed"
        assert "completed_at" in claude_session.command_history[0]
        assert claude_session.state == SessionState.IDLE
    
    @pytest.mark.asyncio
    async def test_get_output(self, claude_session):
        """Test getting session output."""
        # Add some outputs
        outputs = []
        for i in range(5):
            output = SessionOutput("stdout", f"output {i}")
            outputs.append(output)
            await claude_session._handle_output(output)
        
        # Get all outputs
        result = await claude_session.get_output()
        assert len(result) == 5
        
        # Get limited outputs
        result = await claude_session.get_output(limit=3)
        assert len(result) == 3
        assert result[0].content == "output 2"  # Most recent 3
        
        # Get outputs since timestamp
        since = outputs[2].timestamp
        result = await claude_session.get_output(since=since)
        assert len(result) == 2  # outputs 3 and 4
    
    @pytest.mark.asyncio
    async def test_resize_terminal(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test resizing terminal."""
        claude_session.pty_process = mock_pty_process
        
        await claude_session.resize_terminal(160, 50)
        
        mock_pty_manager.resize_pty.assert_called_once_with(
            mock_pty_process, 160, 50
        )
        assert claude_session.config.terminal_size == (160, 50)
    
    @pytest.mark.asyncio
    async def test_interrupt(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test sending interrupt signal."""
        claude_session.pty_process = mock_pty_process
        
        await claude_session.interrupt()
        
        mock_pty_manager.send_signal.assert_called_once_with(
            mock_pty_process, signal.SIGINT
        )
    
    @pytest.mark.asyncio
    async def test_terminate_graceful(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test graceful session termination."""
        # Initialize session
        mock_pty_manager.create_pty.return_value = mock_pty_process
        await claude_session.initialize()
        
        # Terminate gracefully
        await claude_session.terminate(force=False)
        
        # Check graceful shutdown attempt
        mock_pty_manager.write_to_pty.assert_any_call(
            mock_pty_process,
            b"exit\n"
        )
        
        # Check state
        assert claude_session.state == SessionState.TERMINATED
        assert claude_session.terminated_at is not None
    
    @pytest.mark.asyncio
    async def test_terminate_force(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test forced session termination."""
        # Initialize session
        mock_pty_manager.create_pty.return_value = mock_pty_process
        await claude_session.initialize()
        
        # Mock process as still alive after SIGTERM
        mock_pty_process.is_alive = True
        mock_pty_process.wait.side_effect = asyncio.TimeoutError()
        
        # Terminate forcefully
        await claude_session.terminate(force=True)
        
        # Should send SIGKILL
        mock_pty_manager.send_signal.assert_any_call(
            mock_pty_process, signal.SIGKILL
        )
        
        assert claude_session.state == SessionState.TERMINATED
    
    @pytest.mark.asyncio
    async def test_cleanup(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test session cleanup."""
        # Initialize session
        mock_pty_manager.create_pty.return_value = mock_pty_process
        await claude_session.initialize()
        
        # Add some data
        claude_session.output_buffer.append(SessionOutput("stdout", "test"))
        claude_session._active_commands.add("cmd-123")
        
        # Cleanup
        await claude_session.cleanup()
        
        # Check cleanup
        assert claude_session._cleanup_done is True
        assert len(claude_session.output_buffer) == 0
        assert len(claude_session._active_commands) == 0
        mock_pty_manager.cleanup_process.assert_called_once_with(mock_pty_process)
    
    @pytest.mark.asyncio
    async def test_cleanup_idempotent(self, claude_session):
        """Test that cleanup is idempotent."""
        await claude_session.cleanup()
        await claude_session.cleanup()  # Should not raise
        
        assert claude_session._cleanup_done is True
    
    def test_get_info(self, claude_session):
        """Test getting session information."""
        claude_session.started_at = datetime.utcnow()
        claude_session.command_history = [{"id": "cmd-1"}, {"id": "cmd-2"}]
        claude_session._active_commands = {"cmd-2"}
        claude_session.output_buffer = [SessionOutput("stdout", "test")]
        
        info = claude_session.get_info()
        
        assert info["session_id"] == "test-session-123"
        assert info["task_id"] == "test-task-456"
        assert info["state"] == SessionState.INITIALIZING.value
        assert info["project_path"] == "/test/project"
        assert info["command_count"] == 2
        assert info["active_commands"] == 1
        assert info["output_buffer_size"] == 1
        assert info["terminal_size"] == (120, 40)
        assert info["metadata"] == {"test_key": "test_value"}
    
    @pytest.mark.asyncio
    async def test_pty_reader_task(self, mock_pty_manager, mock_pty_process, session_config):
        """Test PTY reader background task."""
        # Create session with output callback
        outputs_received = []
        
        def output_callback(output: SessionOutput):
            outputs_received.append(output)
        
        session = ClaudeCliSession(
            config=session_config,
            pty_manager=mock_pty_manager,
            output_callback=output_callback
        )
        
        # Set up PTY to return data
        test_data = b"test output from PTY"
        mock_pty_manager.create_pty.return_value = mock_pty_process
        mock_pty_manager.read_from_pty.return_value = test_data
        
        # Initialize to start reader task
        await session.initialize()
        
        # Give reader task time to process
        await asyncio.sleep(0.2)
        
        # Check that output was processed
        assert len(outputs_received) > 0
        assert outputs_received[0].content == "test output from PTY"
        assert outputs_received[0].type == "stdout"
        
        # Cleanup
        await session.cleanup()
    
    @pytest.mark.asyncio
    async def test_pty_reader_error_handling(self, mock_pty_manager, mock_pty_process, session_config):
        """Test PTY reader error handling."""
        session = ClaudeCliSession(
            config=session_config,
            pty_manager=mock_pty_manager,
            output_callback=None
        )
        
        # Set up PTY to raise error
        mock_pty_manager.create_pty.return_value = mock_pty_process
        mock_pty_manager.read_from_pty.side_effect = Exception("Read error")
        
        # Initialize to start reader task
        await session.initialize()
        
        # Give reader task time to encounter error
        await asyncio.sleep(0.2)
        
        # Session should handle error gracefully and continue
        assert session.state != SessionState.ERROR  # Non-fatal errors don't change state
        
        # Cleanup
        await session.cleanup()
    
    @pytest.mark.asyncio
    async def test_output_callback_error_handling(self, claude_session):
        """Test handling errors in output callback."""
        # Set up callback that raises error
        def bad_callback(output: SessionOutput):
            raise Exception("Callback error")
        
        claude_session.output_callback = bad_callback
        
        # Should not raise when handling output
        output = SessionOutput("stdout", "test")
        await claude_session._handle_output(output)
        
        # Output should still be added to buffer
        assert len(claude_session.output_buffer) == 1


class TestEdgeCases:
    """Test edge cases and error scenarios."""
    
    @pytest.mark.asyncio
    async def test_concurrent_state_transitions(self, claude_session):
        """Test concurrent state transition attempts."""
        # Try to transition state concurrently
        tasks = [
            claude_session._transition_state(SessionState.AUTHENTICATING),
            claude_session._transition_state(SessionState.AUTHENTICATING),
            claude_session._transition_state(SessionState.AUTHENTICATING)
        ]
        
        # All should succeed (same transition)
        await asyncio.gather(*tasks)
        assert claude_session.state == SessionState.AUTHENTICATING
    
    @pytest.mark.asyncio
    async def test_rapid_commands(self, claude_session, mock_pty_manager, mock_pty_process):
        """Test sending many commands rapidly."""
        # Initialize session
        mock_pty_manager.create_pty.return_value = mock_pty_process
        await claude_session.initialize()
        
        # Send many commands rapidly
        command_ids = []
        for i in range(10):
            # Alternate between ready states to allow commands
            if i % 2 == 0:
                await claude_session._transition_state(SessionState.READY)
            cmd_id = await claude_session.send_command(f"command {i}")
            command_ids.append(cmd_id)
        
        # All commands should be tracked
        assert len(claude_session.command_history) == 10
        assert len(claude_session._active_commands) == 10
    
    @pytest.mark.asyncio
    async def test_session_timeout_recovery(self, claude_session):
        """Test session recovery after timeout."""
        # Simulate timeout error
        claude_session._state = SessionState.ERROR
        claude_session.error_message = "Operation timed out"
        
        # Should be able to transition to terminating
        await claude_session._transition_state(SessionState.TERMINATING)
        await claude_session._transition_state(SessionState.TERMINATED)
        
        assert claude_session.state == SessionState.TERMINATED
    
    @pytest.mark.asyncio
    async def test_large_output_handling(self, claude_session):
        """Test handling very large outputs."""
        # Generate large output
        large_content = "x" * 1_000_000  # 1MB of data
        output = SessionOutput("stdout", large_content)
        
        # Should handle without error
        await claude_session._handle_output(output)
        
        assert len(claude_session.output_buffer) == 1
        assert claude_session.output_buffer[0].content == large_content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])