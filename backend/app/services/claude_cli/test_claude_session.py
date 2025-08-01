"""Test script for Claude CLI session management."""

import asyncio
import os
from datetime import datetime

from app.core.logging_config import setup_logging
from app.services.claude_cli.claude_session import SessionConfig, SessionOutput
from app.services.claude_cli.claude_session_manager import ClaudeSessionManager


async def output_handler(output: SessionOutput) -> None:
    """Handle session output."""
    timestamp = output.timestamp.strftime("%H:%M:%S")
    print(f"[{timestamp}] {output.type}: {output.content.rstrip()}")


async def test_claude_session():
    """Test Claude CLI session functionality."""
    # Setup logging
    setup_logging("DEBUG")
    
    # Create session manager
    manager = ClaudeSessionManager()
    await manager.start()
    
    try:
        print("=== Claude CLI Session Test ===\n")
        
        # Create session configuration
        config = SessionConfig(
            task_id="test-task-001",
            project_path=os.getcwd(),
            environment={
                "CLAUDE_TEST": "true"
            },
            timeout=300,
            terminal_size=(120, 40),
            metadata={
                "test": True,
                "purpose": "testing"
            }
        )
        
        print(f"Creating Claude session...")
        print(f"  Session ID: {config.session_id}")
        print(f"  Task ID: {config.task_id}")
        print(f"  Project Path: {config.project_path}")
        print()
        
        # Create Claude session
        session = await manager.create_claude_session(
            config=config,
            output_callback=output_handler
        )
        
        print(f"Session created successfully!")
        print(f"  State: {session.state}")
        print(f"  PID: {session.pty_process.pid if session.pty_process else 'N/A'}")
        print()
        
        # Wait for session to be ready
        max_wait = 10
        start_time = datetime.utcnow()
        while not session.is_ready and (datetime.utcnow() - start_time).seconds < max_wait:
            await asyncio.sleep(0.5)
        
        if not session.is_ready:
            print("ERROR: Session failed to become ready")
            return
        
        print("Session is ready for commands!\n")
        
        # Send some test commands
        test_commands = [
            "echo 'Hello from Claude CLI session!'",
            "pwd",
            "ls -la",
            "echo $CLAUDE_SESSION_ID",
            "echo $CLAUDE_TASK_ID"
        ]
        
        for cmd in test_commands:
            print(f"\nSending command: {cmd}")
            try:
                response = await manager.send_command_to_session(
                    session.session_id,
                    cmd,
                    timeout=30
                )
                print(f"Command ID: {response.command_id}")
                
                # Wait a bit for output
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"ERROR: Failed to send command: {e}")
        
        # Get session info
        print("\n=== Session Information ===")
        info = session.get_info()
        for key, value in info.items():
            if key != "metadata":
                print(f"  {key}: {value}")
        
        # Get session stats
        print("\n=== Session Statistics ===")
        stats = await manager.get_claude_session_stats()
        for key, value in stats.items():
            print(f"  {key}: {value}")
        
        # Test terminal resize
        print("\n=== Testing Terminal Resize ===")
        print("Resizing terminal to 80x24...")
        await manager.resize_session_terminal(session.session_id, 80, 24)
        print("Terminal resized successfully!")
        
        # Test interrupt
        print("\n=== Testing Interrupt ===")
        print("Sending long-running command...")
        await manager.send_command_to_session(
            session.session_id,
            "sleep 30"
        )
        await asyncio.sleep(2)
        
        print("Sending interrupt signal...")
        await manager.interrupt_session(session.session_id)
        await asyncio.sleep(1)
        
        # Get recent output
        print("\n=== Recent Output ===")
        recent_output = await manager.get_session_output(
            session.session_id,
            limit=10
        )
        for output in recent_output:
            timestamp = output.timestamp.strftime("%H:%M:%S")
            content = output.content.rstrip()
            if content:
                print(f"[{timestamp}] {output.type}: {content}")
        
        # Test graceful termination
        print("\n=== Terminating Session ===")
        print("Terminating session gracefully...")
        await manager.terminate_claude_session(session.session_id)
        print("Session terminated successfully!")
        
        # List remaining sessions
        print("\n=== Active Claude Sessions ===")
        sessions = await manager.list_claude_sessions()
        print(f"Total active sessions: {len(sessions)}")
        
    except Exception as e:
        print(f"\nERROR: Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Cleanup
        print("\n=== Cleanup ===")
        await manager.stop()
        print("Session manager stopped.")


async def test_multiple_sessions():
    """Test multiple concurrent Claude sessions."""
    # Setup logging
    setup_logging("INFO")
    
    # Create session manager
    manager = ClaudeSessionManager()
    await manager.start()
    
    try:
        print("=== Multiple Claude Sessions Test ===\n")
        
        # Create multiple sessions
        num_sessions = 3
        sessions = []
        
        for i in range(num_sessions):
            config = SessionConfig(
                task_id=f"test-task-{i:03d}",
                project_path=os.getcwd(),
                metadata={"session_number": i}
            )
            
            print(f"Creating session {i+1}/{num_sessions}...")
            session = await manager.create_claude_session(config)
            sessions.append(session)
        
        print(f"\nCreated {len(sessions)} sessions successfully!")
        
        # Wait for all sessions to be ready
        print("\nWaiting for sessions to be ready...")
        ready_count = 0
        max_wait = 10
        start_time = datetime.utcnow()
        
        while ready_count < num_sessions and (datetime.utcnow() - start_time).seconds < max_wait:
            ready_count = sum(1 for s in sessions if s.is_ready)
            if ready_count < num_sessions:
                await asyncio.sleep(0.5)
        
        print(f"Ready sessions: {ready_count}/{num_sessions}")
        
        # Send commands to each session
        print("\nSending commands to all sessions...")
        tasks = []
        for i, session in enumerate(sessions):
            if session.is_ready:
                cmd = f"echo 'Hello from session {i}!'"
                task = manager.send_command_to_session(
                    session.session_id,
                    cmd
                )
                tasks.append(task)
        
        # Wait for all commands
        results = await asyncio.gather(*tasks, return_exceptions=True)
        success_count = sum(1 for r in results if not isinstance(r, Exception))
        print(f"Commands sent successfully: {success_count}/{len(tasks)}")
        
        # Get stats
        print("\n=== Session Statistics ===")
        stats = await manager.get_claude_session_stats()
        for key, value in stats.items():
            print(f"  {key}: {value}")
        
        # Terminate all sessions
        print("\n=== Terminating All Sessions ===")
        for session in sessions:
            try:
                await manager.terminate_claude_session(session.session_id)
                print(f"  Terminated session: {session.session_id}")
            except Exception as e:
                print(f"  Failed to terminate {session.session_id}: {e}")
        
    finally:
        await manager.stop()
        print("\nTest completed.")


if __name__ == "__main__":
    # Run single session test
    print("Running single session test...\n")
    asyncio.run(test_claude_session())
    
    print("\n" + "="*60 + "\n")
    
    # Run multiple sessions test
    print("Running multiple sessions test...\n")
    asyncio.run(test_multiple_sessions())