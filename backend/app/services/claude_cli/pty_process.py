"""PTY process wrapper for async I/O support."""

import asyncio
import fcntl
import os
import signal
from typing import Optional

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class PtyProcess:
    """
    Wrapper for a PTY subprocess with async I/O support.
    
    Handles the low-level PTY operations and process management.
    """
    
    def __init__(self, pid: int, master_fd: int):
        self.pid = pid
        self.master_fd = master_fd
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.is_alive = True
        self.exit_code: Optional[int] = None
        self._read_transport: Optional[asyncio.Transport] = None
        self._write_transport: Optional[asyncio.Transport] = None
        self._cleanup_done = False
    
    async def setup_async_io(self) -> None:
        """Setup async readers/writers for the PTY."""
        try:
            # Make master_fd non-blocking
            flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
            fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            
            # Get event loop
            loop = asyncio.get_event_loop()
            
            # Create reader
            reader = asyncio.StreamReader()
            reader_protocol = asyncio.StreamReaderProtocol(reader)
            
            # Connect read pipe
            read_transport, _ = await loop.connect_read_pipe(
                lambda: reader_protocol,
                os.fdopen(self.master_fd, 'rb', 0)
            )
            self._read_transport = read_transport
            
            # Create writer using the same fd
            # We need to duplicate the fd for writing
            write_fd = os.dup(self.master_fd)
            writer_transport, writer_protocol = await loop.connect_write_pipe(
                asyncio.Protocol,
                os.fdopen(write_fd, 'wb', 0)
            )
            self._write_transport = writer_transport
            
            # Create StreamWriter
            writer = asyncio.StreamWriter(
                writer_transport,
                writer_protocol,
                reader,
                loop
            )
            
            self.reader = reader
            self.writer = writer
            
            logger.debug(f"Setup async I/O for PID {self.pid}")
            
        except Exception as e:
            logger.error(f"Failed to setup async I/O: {e}")
            raise
    
    async def send_signal(self, sig: int) -> None:
        """
        Send signal to the process.
        
        Args:
            sig: Signal number (e.g., signal.SIGINT)
        """
        try:
            os.kill(self.pid, sig)
            logger.debug(f"Sent signal {sig} to process {self.pid}")
        except ProcessLookupError:
            logger.warning(f"Process {self.pid} not found")
            self.is_alive = False
        except Exception as e:
            logger.error(f"Failed to send signal: {e}")
            raise
    
    async def wait(self) -> int:
        """
        Wait for process to complete and return exit code.
        
        Returns:
            Process exit code
        """
        if self.exit_code is not None:
            return self.exit_code
        
        try:
            # Wait for process to exit
            pid, status = await asyncio.get_event_loop().run_in_executor(
                None, os.waitpid, self.pid, 0
            )
            
            # Extract exit code
            if os.WIFEXITED(status):
                self.exit_code = os.WEXITSTATUS(status)
            elif os.WIFSIGNALED(status):
                # Negative value for signal termination
                self.exit_code = -os.WTERMSIG(status)
            else:
                self.exit_code = -1
            
            self.is_alive = False
            logger.debug(f"Process {self.pid} exited with code {self.exit_code}")
            
            return self.exit_code
            
        except Exception as e:
            logger.error(f"Error waiting for process: {e}")
            self.is_alive = False
            self.exit_code = -1
            return self.exit_code
    
    async def cleanup(self) -> None:
        """Clean up file descriptors and resources."""
        if self._cleanup_done:
            return
        
        self._cleanup_done = True
        
        try:
            # Close transports
            if self._read_transport:
                self._read_transport.close()
            if self._write_transport:
                self._write_transport.close()
            
            # Close writer
            if self.writer:
                self.writer.close()
                try:
                    await self.writer.wait_closed()
                except:
                    pass
            
            # Ensure process is dead
            if self.is_alive:
                try:
                    # Try graceful termination
                    os.kill(self.pid, signal.SIGTERM)
                    
                    # Wait briefly
                    await asyncio.sleep(0.5)
                    
                    # Force kill if still alive
                    try:
                        os.kill(self.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                        
                except ProcessLookupError:
                    pass
                
                # Reap zombie
                try:
                    os.waitpid(self.pid, os.WNOHANG)
                except:
                    pass
            
            # Close master FD
            try:
                os.close(self.master_fd)
            except:
                pass
            
            self.is_alive = False
            logger.debug(f"Cleaned up PTY process {self.pid}")
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
    
    def __del__(self):
        """Ensure cleanup on deletion."""
        if not self._cleanup_done and self.master_fd >= 0:
            try:
                os.close(self.master_fd)
            except:
                pass