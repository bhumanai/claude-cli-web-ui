"""PTY (Pseudo-Terminal) manager for Claude CLI integration."""

import asyncio
import fcntl
import os
import pty
import signal
import struct
from typing import Dict, List, Optional, Tuple

from app.core.logging_config import get_logger
from app.services.claude_cli.pty_process import PtyProcess
from app.services.claude_cli.terminal_utils import set_terminal_size

logger = get_logger(__name__)


class PtyError(Exception):
    """Base PTY error."""
    pass


class PtyCreationError(PtyError):
    """Failed to create PTY."""
    pass


class PtyIOError(PtyError):
    """PTY I/O operation failed."""
    pass


class PtyManager:
    """
    Manages PTY (Pseudo-Terminal) instances for proper terminal emulation.
    
    Provides full terminal capabilities including:
    - ANSI escape sequences
    - Terminal resizing
    - Signal handling
    - Interactive prompts
    """
    
    def __init__(self):
        self.logger = logger
        self._processes: Dict[int, PtyProcess] = {}
        self._lock = asyncio.Lock()
    
    async def create_pty(
        self,
        command: List[str],
        env: Dict[str, str],
        cwd: str,
        size: Tuple[int, int] = (80, 24)
    ) -> PtyProcess:
        """
        Create new PTY process with proper terminal setup.
        
        Args:
            command: Command and arguments to execute
            env: Environment variables
            cwd: Working directory
            size: Terminal size (cols, rows)
            
        Returns:
            PtyProcess instance
            
        Raises:
            PtyCreationError: If PTY creation fails
        """
        async with self._lock:
            try:
                # Create PTY pair
                master_fd, slave_fd = pty.openpty()
                
                # Set terminal size
                set_terminal_size(slave_fd, size[1], size[0])
                
                # Fork process
                pid = os.fork()
                
                if pid == 0:  # Child process
                    try:
                        # Create new session
                        os.setsid()
                        
                        # Make slave PTY the controlling terminal
                        fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
                        
                        # Redirect stdio to slave PTY
                        os.dup2(slave_fd, 0)  # stdin
                        os.dup2(slave_fd, 1)  # stdout
                        os.dup2(slave_fd, 2)  # stderr
                        
                        # Close file descriptors
                        os.close(master_fd)
                        os.close(slave_fd)
                        
                        # Change to working directory
                        os.chdir(cwd)
                        
                        # Execute command
                        os.execvpe(command[0], command, env)
                        
                    except Exception as e:
                        # If exec fails, exit child
                        os._exit(1)
                
                else:  # Parent process
                    # Close slave FD in parent
                    os.close(slave_fd)
                    
                    # Create PtyProcess wrapper
                    process = PtyProcess(pid, master_fd)
                    await process.setup_async_io()
                    
                    # Track process
                    self._processes[pid] = process
                    
                    self.logger.info(
                        "Created PTY process",
                        pid=pid,
                        command=" ".join(command),
                        cwd=cwd
                    )
                    
                    return process
                    
            except Exception as e:
                self.logger.error("Failed to create PTY", error=str(e))
                # Clean up on error
                try:
                    os.close(master_fd)
                except:
                    pass
                try:
                    os.close(slave_fd)
                except:
                    pass
                raise PtyCreationError(f"Failed to create PTY: {e}")
    
    async def resize_pty(
        self,
        process: PtyProcess,
        cols: int,
        rows: int
    ) -> None:
        """
        Resize terminal window dimensions.
        
        Args:
            process: PTY process to resize
            cols: Number of columns
            rows: Number of rows
        """
        try:
            set_terminal_size(process.master_fd, rows, cols)
            self.logger.debug(
                "Resized PTY",
                pid=process.pid,
                cols=cols,
                rows=rows
            )
        except Exception as e:
            self.logger.error("Failed to resize PTY", error=str(e))
            raise PtyIOError(f"Failed to resize PTY: {e}")
    
    async def write_to_pty(
        self,
        process: PtyProcess,
        data: bytes
    ) -> None:
        """
        Write data to PTY stdin with proper encoding.
        
        Args:
            process: PTY process to write to
            data: Data to write
            
        Raises:
            PtyIOError: If write fails
        """
        if not process.is_alive:
            raise PtyIOError("Cannot write to dead process")
        
        try:
            if process.writer:
                process.writer.write(data)
                await process.writer.drain()
            else:
                # Fallback to direct write
                os.write(process.master_fd, data)
                
            self.logger.debug(
                "Wrote to PTY",
                pid=process.pid,
                bytes=len(data)
            )
        except Exception as e:
            self.logger.error("Failed to write to PTY", error=str(e))
            raise PtyIOError(f"Failed to write to PTY: {e}")
    
    async def read_from_pty(
        self,
        process: PtyProcess,
        timeout: float = 0.1
    ) -> Optional[bytes]:
        """
        Read data from PTY stdout with non-blocking I/O.
        
        Args:
            process: PTY process to read from
            timeout: Read timeout in seconds
            
        Returns:
            Data read from PTY or None if no data available
            
        Raises:
            PtyIOError: If read fails
        """
        if not process.is_alive:
            return None
        
        try:
            if process.reader:
                # Use async reader with timeout
                try:
                    data = await asyncio.wait_for(
                        process.reader.read(4096),
                        timeout=timeout
                    )
                    return data if data else None
                except asyncio.TimeoutError:
                    return None
            else:
                # Fallback to direct read (shouldn't happen)
                return None
                
        except Exception as e:
            self.logger.error("Failed to read from PTY", error=str(e))
            raise PtyIOError(f"Failed to read from PTY: {e}")
    
    async def send_signal(self, process: PtyProcess, sig: int) -> None:
        """
        Send signal to PTY process.
        
        Args:
            process: PTY process
            sig: Signal number (e.g., signal.SIGINT)
        """
        try:
            await process.send_signal(sig)
        except Exception as e:
            self.logger.error("Failed to send signal", error=str(e))
            raise PtyIOError(f"Failed to send signal: {e}")
    
    async def cleanup_process(self, process: PtyProcess) -> None:
        """
        Clean up PTY process resources.
        
        Args:
            process: PTY process to clean up
        """
        async with self._lock:
            try:
                # Remove from tracking
                if process.pid in self._processes:
                    del self._processes[process.pid]
                
                # Clean up process
                await process.cleanup()
                
                self.logger.info("Cleaned up PTY process", pid=process.pid)
                
            except Exception as e:
                self.logger.error("Error during cleanup", error=str(e))
    
    async def cleanup_all(self) -> None:
        """Clean up all PTY processes."""
        async with self._lock:
            processes = list(self._processes.values())
            for process in processes:
                try:
                    await process.cleanup()
                except Exception as e:
                    self.logger.error(
                        "Error cleaning up process",
                        pid=process.pid,
                        error=str(e)
                    )
            self._processes.clear()


# Import required for type checking but avoid circular import
import termios