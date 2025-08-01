"""Unit tests for PTY manager."""

import asyncio
import os
import signal
import sys
import pytest
from unittest.mock import Mock, patch, AsyncMock

from app.services.claude_cli.pty_manager import (
    PtyManager, PtyError, PtyCreationError, PtyIOError
)
from app.services.claude_cli.pty_process import PtyProcess


@pytest.fixture
async def pty_manager():
    """Create a PTY manager instance."""
    manager = PtyManager()
    yield manager
    # Cleanup any remaining processes
    await manager.cleanup_all()


class TestPtyManager:
    """Test PTY manager functionality."""
    
    @pytest.mark.asyncio
    async def test_create_pty_success(self, pty_manager):
        """Test successful PTY creation."""
        # Create a simple echo process
        process = await pty_manager.create_pty(
            command=["echo", "test"],
            env=os.environ.copy(),
            cwd=os.getcwd(),
            size=(80, 24)
        )
        
        assert process is not None
        assert process.pid > 0
        assert process.is_alive
        assert process.master_fd >= 0
        
        # Wait for completion
        exit_code = await process.wait()
        assert exit_code == 0
        
        # Cleanup
        await pty_manager.cleanup_process(process)
    
    @pytest.mark.asyncio
    async def test_create_pty_invalid_command(self, pty_manager):
        """Test PTY creation with invalid command."""
        with pytest.raises(PtyCreationError):
            await pty_manager.create_pty(
                command=["nonexistent_command_xyz"],
                env=os.environ.copy(),
                cwd=os.getcwd()
            )
    
    @pytest.mark.asyncio
    async def test_write_read_pty(self, pty_manager):
        """Test writing to and reading from PTY."""
        # Create a cat process (echoes input)
        process = await pty_manager.create_pty(
            command=["cat"],
            env=os.environ.copy(),
            cwd=os.getcwd()
        )
        
        # Write data
        test_data = b"Hello, PTY!\n"
        await pty_manager.write_to_pty(process, test_data)
        
        # Read response
        await asyncio.sleep(0.1)  # Give it time to process
        response = await pty_manager.read_from_pty(process, timeout=0.5)
        
        assert response == test_data
        
        # Send EOF to terminate cat
        await pty_manager.send_signal(process, signal.SIGTERM)
        await process.wait()
        await pty_manager.cleanup_process(process)
    
    @pytest.mark.asyncio
    async def test_resize_pty(self, pty_manager):
        """Test terminal resizing."""
        # Create a bash process
        process = await pty_manager.create_pty(
            command=["bash", "-c", "sleep 1"],
            env=os.environ.copy(),
            cwd=os.getcwd(),
            size=(80, 24)
        )
        
        # Resize terminal
        await pty_manager.resize_pty(process, 120, 40)
        
        # No exception should be raised
        await process.wait()
        await pty_manager.cleanup_process(process)
    
    @pytest.mark.asyncio
    async def test_send_signal(self, pty_manager):
        """Test sending signals to PTY process."""
        # Create a long-running process
        process = await pty_manager.create_pty(
            command=["sleep", "10"],
            env=os.environ.copy(),
            cwd=os.getcwd()
        )
        
        # Send interrupt signal
        await pty_manager.send_signal(process, signal.SIGINT)
        
        # Process should terminate
        exit_code = await asyncio.wait_for(process.wait(), timeout=2.0)
        assert exit_code != 0  # Interrupted
        
        await pty_manager.cleanup_process(process)
    
    @pytest.mark.asyncio
    async def test_multiple_processes(self, pty_manager):
        """Test managing multiple PTY processes."""
        processes = []
        
        # Create multiple processes
        for i in range(3):
            process = await pty_manager.create_pty(
                command=["echo", f"Process {i}"],
                env=os.environ.copy(),
                cwd=os.getcwd()
            )
            processes.append(process)
        
        # All should be tracked
        assert len(pty_manager._processes) == 3
        
        # Wait for all to complete
        for process in processes:
            await process.wait()
            await pty_manager.cleanup_process(process)
        
        # All should be cleaned up
        assert len(pty_manager._processes) == 0
    
    @pytest.mark.asyncio
    async def test_write_to_dead_process(self, pty_manager):
        """Test writing to a dead process."""
        # Create and immediately terminate a process
        process = await pty_manager.create_pty(
            command=["echo", "test"],
            env=os.environ.copy(),
            cwd=os.getcwd()
        )
        
        await process.wait()
        process.is_alive = False
        
        # Writing should raise error
        with pytest.raises(PtyIOError):
            await pty_manager.write_to_pty(process, b"data")
        
        await pty_manager.cleanup_process(process)
    
    @pytest.mark.asyncio
    async def test_read_from_dead_process(self, pty_manager):
        """Test reading from a dead process."""
        # Create and immediately terminate a process
        process = await pty_manager.create_pty(
            command=["echo", "test"],
            env=os.environ.copy(),
            cwd=os.getcwd()
        )
        
        await process.wait()
        process.is_alive = False
        
        # Reading should return None
        data = await pty_manager.read_from_pty(process)
        assert data is None
        
        await pty_manager.cleanup_process(process)
    
    @pytest.mark.asyncio
    async def test_cleanup_all(self, pty_manager):
        """Test cleaning up all processes."""
        # Create multiple processes
        for i in range(3):
            await pty_manager.create_pty(
                command=["sleep", "10"],
                env=os.environ.copy(),
                cwd=os.getcwd()
            )
        
        assert len(pty_manager._processes) == 3
        
        # Cleanup all
        await pty_manager.cleanup_all()
        
        assert len(pty_manager._processes) == 0


class TestPtyProcess:
    """Test PTY process functionality."""
    
    @pytest.mark.asyncio
    async def test_process_lifecycle(self):
        """Test PTY process lifecycle."""
        # Create process manually for testing
        master_fd, slave_fd = os.openpty()
        
        pid = os.fork()
        if pid == 0:  # Child
            os.close(master_fd)
            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)
            os.close(slave_fd)
            os.execv("/bin/echo", ["echo", "test"])
        else:  # Parent
            os.close(slave_fd)
            process = PtyProcess(pid, master_fd)
            
            await process.setup_async_io()
            assert process.is_alive
            
            exit_code = await process.wait()
            assert exit_code == 0
            assert not process.is_alive
            
            await process.cleanup()
    
    @pytest.mark.asyncio
    async def test_send_signal_to_nonexistent(self):
        """Test sending signal to nonexistent process."""
        process = PtyProcess(999999, -1)  # Invalid PID
        process.is_alive = True
        
        await process.send_signal(signal.SIGTERM)
        assert not process.is_alive


if __name__ == "__main__":
    pytest.main([__file__, "-v"])