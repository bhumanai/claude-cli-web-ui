"""Simple test script for PTY infrastructure."""

import asyncio
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from app.services.claude_cli.pty_manager import PtyManager


async def test_echo_command():
    """Test simple echo command through PTY."""
    print("Testing echo command...")
    
    manager = PtyManager()
    
    # Create PTY for echo command
    process = await manager.create_pty(
        command=["echo", "Hello from PTY!"],
        env=os.environ.copy(),
        cwd=os.getcwd(),
        size=(80, 24)
    )
    
    # Read output
    output = b""
    while True:
        data = await manager.read_from_pty(process, timeout=0.5)
        if data:
            output += data
        else:
            break
    
    # Wait for process to complete
    exit_code = await process.wait()
    
    # Cleanup
    await manager.cleanup_process(process)
    
    print(f"Output: {output.decode('utf-8', errors='replace')}")
    print(f"Exit code: {exit_code}")
    print()


async def test_interactive_python():
    """Test interactive Python session."""
    print("Testing interactive Python...")
    
    manager = PtyManager()
    
    # Create PTY for Python
    process = await manager.create_pty(
        command=["python3", "-i"],
        env=os.environ.copy(),
        cwd=os.getcwd(),
        size=(80, 24)
    )
    
    # Wait for prompt
    await asyncio.sleep(0.5)
    
    # Read initial output
    initial = b""
    while True:
        data = await manager.read_from_pty(process, timeout=0.1)
        if data:
            initial += data
        else:
            break
    
    print(f"Initial output: {initial.decode('utf-8', errors='replace')}")
    
    # Send a command
    await manager.write_to_pty(process, b"print('Hello from Python!')\n")
    
    # Read response
    await asyncio.sleep(0.2)
    response = b""
    while True:
        data = await manager.read_from_pty(process, timeout=0.1)
        if data:
            response += data
        else:
            break
    
    print(f"Response: {response.decode('utf-8', errors='replace')}")
    
    # Exit Python
    await manager.write_to_pty(process, b"exit()\n")
    
    # Wait for process to complete
    exit_code = await process.wait()
    
    # Cleanup
    await manager.cleanup_process(process)
    
    print(f"Exit code: {exit_code}")
    print()


async def test_terminal_resize():
    """Test terminal resizing."""
    print("Testing terminal resize...")
    
    manager = PtyManager()
    
    # Create PTY for a command that shows terminal size
    process = await manager.create_pty(
        command=["bash", "-c", "echo Initial size: $COLUMNS x $LINES"],
        env=os.environ.copy(),
        cwd=os.getcwd(),
        size=(80, 24)
    )
    
    # Read output
    output = b""
    while True:
        data = await manager.read_from_pty(process, timeout=0.5)
        if data:
            output += data
        else:
            break
    
    print(f"Output: {output.decode('utf-8', errors='replace')}")
    
    # Wait and cleanup
    await process.wait()
    await manager.cleanup_process(process)
    print()


async def main():
    """Run all tests."""
    print("PTY Infrastructure Tests")
    print("=" * 50)
    
    try:
        await test_echo_command()
        await test_interactive_python()
        await test_terminal_resize()
        
        print("All tests completed!")
        
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())