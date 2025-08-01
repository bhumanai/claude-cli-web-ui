"""Terminal utilities for PTY operations."""

import fcntl
import os
import pty
import struct
import termios
import tty
from typing import Any, Tuple


def set_terminal_size(fd: int, rows: int, cols: int) -> None:
    """
    Set terminal window size using ioctl.
    
    Args:
        fd: File descriptor
        rows: Number of rows
        cols: Number of columns
    """
    # TIOCSWINSZ constant (may vary by platform)
    # Linux: 0x5414, macOS: 0x80087468
    try:
        TIOCSWINSZ = termios.TIOCSWINSZ
    except AttributeError:
        # Fallback values
        import platform
        if platform.system() == "Linux":
            TIOCSWINSZ = 0x5414
        else:  # macOS
            TIOCSWINSZ = 0x80087468
    
    # Pack window size struct: rows, cols, xpixels, ypixels
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    
    # Set window size
    fcntl.ioctl(fd, TIOCSWINSZ, winsize)


def get_terminal_size(fd: int) -> Tuple[int, int]:
    """
    Get terminal window size.
    
    Args:
        fd: File descriptor
        
    Returns:
        Tuple of (cols, rows)
    """
    try:
        TIOCGWINSZ = termios.TIOCGWINSZ
    except AttributeError:
        # Fallback values
        import platform
        if platform.system() == "Linux":
            TIOCGWINSZ = 0x5413
        else:  # macOS
            TIOCGWINSZ = 0x40087468
    
    # Get window size
    winsize = fcntl.ioctl(fd, TIOCGWINSZ, b"\x00" * 8)
    rows, cols, _, _ = struct.unpack("HHHH", winsize)
    
    return (cols, rows)


def make_raw(fd: int) -> Any:
    """
    Put terminal in raw mode for proper PTY operation.
    
    Args:
        fd: File descriptor
        
    Returns:
        Original terminal attributes (for restoration)
    """
    # Get current attributes
    old_attrs = termios.tcgetattr(fd)
    
    # Make raw
    tty.setraw(fd)
    
    return old_attrs


def restore_terminal(fd: int, old_attrs: Any) -> None:
    """
    Restore terminal to original state.
    
    Args:
        fd: File descriptor
        old_attrs: Original terminal attributes
    """
    termios.tcsetattr(fd, termios.TCSADRAIN, old_attrs)


def setup_pty_pair() -> Tuple[int, int]:
    """
    Create a PTY master/slave pair.
    
    Returns:
        Tuple of (master_fd, slave_fd)
    """
    return pty.openpty()


def set_nonblocking(fd: int) -> None:
    """
    Make file descriptor non-blocking.
    
    Args:
        fd: File descriptor
    """
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def set_blocking(fd: int) -> None:
    """
    Make file descriptor blocking.
    
    Args:
        fd: File descriptor
    """
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags & ~os.O_NONBLOCK)


def is_terminal(fd: int) -> bool:
    """
    Check if file descriptor is a terminal.
    
    Args:
        fd: File descriptor
        
    Returns:
        True if fd is a terminal
    """
    return os.isatty(fd)


def get_terminal_attributes(fd: int) -> Any:
    """
    Get terminal attributes.
    
    Args:
        fd: File descriptor
        
    Returns:
        Terminal attributes
    """
    return termios.tcgetattr(fd)


def set_terminal_attributes(fd: int, attrs: Any, when: int = termios.TCSADRAIN) -> None:
    """
    Set terminal attributes.
    
    Args:
        fd: File descriptor
        attrs: Terminal attributes
        when: When to apply changes (TCSANOW, TCSADRAIN, TCSAFLUSH)
    """
    termios.tcsetattr(fd, when, attrs)