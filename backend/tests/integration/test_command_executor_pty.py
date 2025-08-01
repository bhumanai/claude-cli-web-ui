"""Integration tests for CommandExecutor with PTY-based ClaudeCliSession."""

import asyncio
import pytest
from datetime import datetime
from typing import List

from app.models.schemas import CommandResponse, CommandStatus, OutputType
from app.services.command_executor import CommandExecutor


@pytest.mark.asyncio
async def test_simple_command_execution():
    """Test executing a simple command through PTY session."""
    executor = CommandExecutor()
    
    try:
        responses: List[CommandResponse] = []
        
        # Execute a simple echo command
        async for response in executor.execute_command(
            command="echo 'Hello from Claude CLI'",
            session_id="test-session-001"
        ):
            responses.append(response)
        
        # Verify we got responses
        assert len(responses) > 0
        
        # Check final response
        final_response = responses[-1]
        assert final_response.status == CommandStatus.COMPLETED
        assert final_response.exit_code == 0
        assert final_response.completed_at is not None
        
        # Check output contains our message
        output_contents = [msg.content for msg in final_response.output]
        assert any("Hello from Claude CLI" in content for content in output_contents)
        
    finally:
        await executor.cleanup()


@pytest.mark.asyncio
async def test_claude_cli_slash_command():
    """Test executing Claude CLI slash commands."""
    executor = CommandExecutor()
    
    try:
        responses: List[CommandResponse] = []
        
        # Execute a Claude CLI slash command
        async for response in executor.execute_command(
            command="/help",
            session_id="test-session-002"
        ):
            responses.append(response)
            # Break after getting some output to avoid long waits
            if len(response.output) > 5:
                break
        
        # Verify we got responses
        assert len(responses) > 0
        
        # Check we got output
        final_response = responses[-1]
        assert len(final_response.output) > 0
        
    finally:
        await executor.cleanup()


@pytest.mark.asyncio
async def test_command_cancellation():
    """Test cancelling a running command."""
    executor = CommandExecutor()
    
    try:
        command_id = None
        
        # Start a long-running command
        async def run_command():
            nonlocal command_id
            async for response in executor.execute_command(
                command="sleep 30",
                session_id="test-session-003"
            ):
                if command_id is None:
                    command_id = response.command_id
                if response.status == CommandStatus.RUNNING:
                    break
        
        # Run command in background
        task = asyncio.create_task(run_command())
        
        # Wait for command to start
        await asyncio.sleep(1)
        
        # Cancel the command
        assert command_id is not None
        cancelled = await executor.cancel_command(command_id)
        assert cancelled is True
        
        # Clean up task
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        
    finally:
        await executor.cleanup()


@pytest.mark.asyncio
async def test_multiple_concurrent_commands():
    """Test running multiple commands concurrently."""
    executor = CommandExecutor()
    
    try:
        # Define test commands
        commands = [
            ("echo 'Command 1'", "test-session-004"),
            ("echo 'Command 2'", "test-session-005"),
            ("echo 'Command 3'", "test-session-006"),
        ]
        
        # Execute commands concurrently
        tasks = []
        for cmd, session_id in commands:
            async def execute_cmd(command, sid):
                responses = []
                async for response in executor.execute_command(
                    command=command,
                    session_id=sid
                ):
                    responses.append(response)
                return responses
            
            task = asyncio.create_task(execute_cmd(cmd, session_id))
            tasks.append(task)
        
        # Wait for all commands to complete
        results = await asyncio.gather(*tasks)
        
        # Verify all commands completed successfully
        assert len(results) == len(commands)
        for responses in results:
            assert len(responses) > 0
            final_response = responses[-1]
            assert final_response.status == CommandStatus.COMPLETED
            assert final_response.exit_code == 0
        
    finally:
        await executor.cleanup()


@pytest.mark.asyncio
async def test_command_with_error():
    """Test handling command that produces an error."""
    executor = CommandExecutor()
    
    try:
        responses: List[CommandResponse] = []
        
        # Execute a command that will fail
        async for response in executor.execute_command(
            command="nonexistent_command_12345",
            session_id="test-session-007"
        ):
            responses.append(response)
        
        # Verify we got responses
        assert len(responses) > 0
        
        # Check final response indicates failure
        final_response = responses[-1]
        assert final_response.status == CommandStatus.FAILED
        assert final_response.error is not None
        
    finally:
        await executor.cleanup()


@pytest.mark.asyncio
async def test_interactive_input():
    """Test sending input to an interactive command."""
    executor = CommandExecutor()
    
    try:
        command_id = None
        got_prompt = False
        
        # Start an interactive command
        async def run_interactive():
            nonlocal command_id, got_prompt
            async for response in executor.execute_command(
                command="python3 -c \"name = input('Enter name: '); print(f'Hello, {name}!')\"",
                session_id="test-session-008",
                timeout=10
            ):
                if command_id is None:
                    command_id = response.command_id
                
                # Check if we got the prompt
                for msg in response.output:
                    if "Enter name:" in msg.content:
                        got_prompt = True
                        break
                
                if got_prompt:
                    break
        
        # Run command in background
        task = asyncio.create_task(run_interactive())
        
        # Wait for prompt
        await asyncio.sleep(2)
        
        # Send input
        if command_id and got_prompt:
            success = await executor.send_input(command_id, "Claude\n")
            assert success is True
        
        # Clean up task
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        
    finally:
        await executor.cleanup()


if __name__ == "__main__":
    # Run tests directly
    asyncio.run(test_simple_command_execution())
    print("✓ Simple command execution test passed")
    
    asyncio.run(test_claude_cli_slash_command())
    print("✓ Claude CLI slash command test passed")
    
    asyncio.run(test_command_cancellation())
    print("✓ Command cancellation test passed")
    
    asyncio.run(test_multiple_concurrent_commands())
    print("✓ Multiple concurrent commands test passed")
    
    asyncio.run(test_command_with_error())
    print("✓ Command error handling test passed")
    
    asyncio.run(test_interactive_input())
    print("✓ Interactive input test passed")
    
    print("\nAll tests passed! ✅")