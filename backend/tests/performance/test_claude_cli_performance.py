"""Performance tests for Claude CLI integration."""

import asyncio
import os
import statistics
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from httpx import AsyncClient

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
def performance_metrics():
    """Track performance metrics during tests."""
    metrics = {
        "start_times": [],
        "end_times": [],
        "durations": [],
        "memory_usage": [],
        "cpu_usage": [],
        "errors": []
    }
    return metrics


@pytest.fixture
async def mock_pty_manager_fast():
    """Create a fast mock PTY manager for performance testing."""
    manager = AsyncMock(spec=PtyManager)
    
    # Create mock processes quickly
    def create_mock_process():
        process = Mock(spec=PtyProcess)
        process.pid = os.getpid()
        process.master_fd = 10
        process.is_alive = True
        process.wait = AsyncMock(return_value=0)
        process.send_signal = AsyncMock()
        process.cleanup = AsyncMock()
        process.reader = AsyncMock()
        process.writer = AsyncMock()
        return process
    
    manager.create_pty = AsyncMock(side_effect=lambda *args, **kwargs: create_mock_process())
    manager.read_from_pty = AsyncMock(return_value=b"output")
    manager.write_to_pty = AsyncMock()
    manager.resize_pty = AsyncMock()
    manager.send_signal = AsyncMock()
    manager.cleanup_process = AsyncMock()
    manager.cleanup_all = AsyncMock()
    
    return manager


class TestSessionPerformance:
    """Test performance of Claude CLI session operations."""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_session_creation_speed(
        self,
        mock_pty_manager_fast: PtyManager,
        performance_metrics: Dict[str, List]
    ):
        """Test how quickly sessions can be created."""
        session_count = 100
        
        async def create_session(i: int):
            start = time.time()
            config = SessionConfig(
                session_id=f"perf-session-{i}",
                project_path="/test/project"
            )
            session = ClaudeCliSession(
                config=config,
                pty_manager=mock_pty_manager_fast,
                output_callback=None
            )
            await session.initialize()
            end = time.time()
            performance_metrics["durations"].append(end - start)
            return session
        
        # Create sessions concurrently
        start_time = time.time()
        sessions = await asyncio.gather(*[
            create_session(i) for i in range(session_count)
        ])
        total_time = time.time() - start_time
        
        # Calculate metrics
        avg_creation_time = statistics.mean(performance_metrics["durations"])
        max_creation_time = max(performance_metrics["durations"])
        min_creation_time = min(performance_metrics["durations"])
        
        # Performance assertions
        assert len(sessions) == session_count
        assert avg_creation_time < 0.1  # Average under 100ms
        assert max_creation_time < 0.5  # Max under 500ms
        assert total_time < 10  # Total under 10 seconds for 100 sessions
        
        print(f"\nSession Creation Performance:")
        print(f"  Total sessions: {session_count}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Average creation: {avg_creation_time*1000:.2f}ms")
        print(f"  Min creation: {min_creation_time*1000:.2f}ms")
        print(f"  Max creation: {max_creation_time*1000:.2f}ms")
        
        # Cleanup
        for session in sessions:
            await session.cleanup()
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_command_throughput(
        self,
        mock_pty_manager_fast: PtyManager,
        performance_metrics: Dict[str, List]
    ):
        """Test command execution throughput."""
        # Create session
        config = SessionConfig(session_id="throughput-test")
        session = ClaudeCliSession(
            config=config,
            pty_manager=mock_pty_manager_fast,
            output_callback=None
        )
        await session.initialize()
        
        # Send many commands
        command_count = 1000
        start_time = time.time()
        
        for i in range(command_count):
            # Alternate states to allow commands
            if session.state == SessionState.BUSY:
                await session._transition_state(SessionState.READY)
            
            cmd_start = time.time()
            await session.send_command(f"echo 'Command {i}'")
            performance_metrics["durations"].append(time.time() - cmd_start)
        
        total_time = time.time() - start_time
        throughput = command_count / total_time
        
        # Calculate metrics
        avg_command_time = statistics.mean(performance_metrics["durations"])
        
        # Performance assertions
        assert throughput > 100  # At least 100 commands per second
        assert avg_command_time < 0.01  # Average under 10ms per command
        
        print(f"\nCommand Throughput Performance:")
        print(f"  Total commands: {command_count}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Throughput: {throughput:.2f} commands/s")
        print(f"  Average command time: {avg_command_time*1000:.2f}ms")
        
        await session.cleanup()
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_output_streaming_performance(
        self,
        mock_pty_manager_fast: PtyManager,
        performance_metrics: Dict[str, List]
    ):
        """Test output streaming performance."""
        outputs_received = []
        
        def output_callback(output: SessionOutput):
            outputs_received.append(output)
        
        # Create session with callback
        config = SessionConfig(session_id="streaming-test")
        session = ClaudeCliSession(
            config=config,
            pty_manager=mock_pty_manager_fast,
            output_callback=output_callback
        )
        await session.initialize()
        
        # Generate lots of output
        output_count = 10000
        start_time = time.time()
        
        for i in range(output_count):
            output = SessionOutput("stdout", f"Line {i}: " + "x" * 100)
            await session._handle_output(output)
        
        total_time = time.time() - start_time
        throughput = output_count / total_time
        
        # Performance assertions
        assert len(outputs_received) == output_count
        assert throughput > 1000  # At least 1000 outputs per second
        
        print(f"\nOutput Streaming Performance:")
        print(f"  Total outputs: {output_count}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Throughput: {throughput:.2f} outputs/s")
        print(f"  Data rate: {throughput * 100 / 1024:.2f} KB/s")
        
        await session.cleanup()
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_memory_usage_under_load(
        self,
        mock_pty_manager_fast: PtyManager
    ):
        """Test memory usage with many sessions and outputs."""
        import psutil
        process = psutil.Process()
        
        # Get initial memory
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        sessions = []
        session_count = 50
        
        # Create many sessions
        for i in range(session_count):
            config = SessionConfig(session_id=f"mem-test-{i}")
            session = ClaudeCliSession(
                config=config,
                pty_manager=mock_pty_manager_fast,
                output_callback=None
            )
            await session.initialize()
            sessions.append(session)
            
            # Add some output to each session
            for j in range(100):
                output = SessionOutput("stdout", f"Output {j}" * 10)
                await session._handle_output(output)
        
        # Get memory after load
        loaded_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = loaded_memory - initial_memory
        memory_per_session = memory_increase / session_count
        
        print(f"\nMemory Usage Performance:")
        print(f"  Initial memory: {initial_memory:.2f} MB")
        print(f"  Loaded memory: {loaded_memory:.2f} MB")
        print(f"  Memory increase: {memory_increase:.2f} MB")
        print(f"  Memory per session: {memory_per_session:.2f} MB")
        
        # Performance assertions
        assert memory_per_session < 10  # Less than 10MB per session
        
        # Cleanup
        for session in sessions:
            await session.cleanup()
        
        # Verify memory is released
        await asyncio.sleep(0.5)  # Give time for cleanup
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_released = loaded_memory - final_memory
        
        print(f"  Final memory: {final_memory:.2f} MB")
        print(f"  Memory released: {memory_released:.2f} MB")


class TestManagerPerformance:
    """Test performance of Claude session manager."""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_concurrent_session_management(
        self,
        performance_metrics: Dict[str, List]
    ):
        """Test managing many sessions concurrently."""
        manager = ClaudeSessionManager()
        
        # Mock PTY manager
        manager.pty_manager = AsyncMock(spec=PtyManager)
        mock_process = Mock(spec=PtyProcess)
        mock_process.pid = 12345
        mock_process.is_alive = True
        mock_process.reader = AsyncMock()
        mock_process.writer = AsyncMock()
        manager.pty_manager.create_pty.return_value = mock_process
        manager.pty_manager.read_from_pty.return_value = None
        
        await manager.start()
        
        session_count = 100
        
        async def create_and_use_session(i: int):
            start = time.time()
            
            # Create session
            config = SessionConfig(
                session_id=f"concurrent-{i}",
                task_id=f"task-{i}"
            )
            session = await manager.create_claude_session(config)
            
            # Send a command
            try:
                await manager.send_command_to_session(
                    config.session_id,
                    f"echo 'Session {i}'"
                )
            except:
                pass  # Ignore errors for performance test
            
            # Get output
            await manager.get_session_output(config.session_id)
            
            performance_metrics["durations"].append(time.time() - start)
            return config.session_id
        
        # Run concurrently
        start_time = time.time()
        session_ids = await asyncio.gather(*[
            create_and_use_session(i) for i in range(session_count)
        ])
        total_time = time.time() - start_time
        
        # Calculate metrics
        avg_operation_time = statistics.mean(performance_metrics["durations"])
        
        print(f"\nConcurrent Session Management Performance:")
        print(f"  Total sessions: {session_count}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Average operation time: {avg_operation_time*1000:.2f}ms")
        print(f"  Operations per second: {session_count/total_time:.2f}")
        
        # Performance assertions
        assert total_time < 30  # Under 30 seconds for 100 sessions
        assert avg_operation_time < 0.3  # Under 300ms per operation
        
        # Cleanup
        await manager.stop()
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_session_lookup_performance(self):
        """Test performance of session lookups."""
        manager = ClaudeSessionManager()
        await manager.start()
        
        # Add many sessions to manager
        session_count = 1000
        for i in range(session_count):
            session_id = f"lookup-test-{i}"
            task_id = f"task-{i}"
            
            # Add to tracking without creating full session
            manager.task_to_session[task_id] = session_id
            manager.claude_sessions[session_id] = Mock()
        
        # Test lookup performance
        lookup_count = 10000
        start_time = time.time()
        
        for i in range(lookup_count):
            # Mix of session ID and task ID lookups
            if i % 2 == 0:
                session_id = f"lookup-test-{i % session_count}"
                await manager.get_claude_session(session_id)
            else:
                task_id = f"task-{i % session_count}"
                await manager.get_session_by_task(task_id)
        
        total_time = time.time() - start_time
        lookups_per_second = lookup_count / total_time
        
        print(f"\nSession Lookup Performance:")
        print(f"  Total sessions: {session_count}")
        print(f"  Total lookups: {lookup_count}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Lookups per second: {lookups_per_second:.2f}")
        
        # Performance assertions
        assert lookups_per_second > 10000  # At least 10k lookups per second
        
        await manager.stop()


class TestWebSocketPerformance:
    """Test WebSocket streaming performance."""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_websocket_broadcast_performance(self):
        """Test broadcasting to many WebSocket connections."""
        from app.websocket import WebSocketManager
        
        ws_manager = WebSocketManager()
        connection_count = 100
        
        # Create mock connections
        connections = []
        for i in range(connection_count):
            session_id = f"ws-perf-{i}"
            mock_ws = AsyncMock()
            mock_ws.send_json = AsyncMock()
            await ws_manager.connect(session_id, mock_ws)
            connections.append((session_id, mock_ws))
        
        # Broadcast many messages
        message_count = 1000
        start_time = time.time()
        
        for i in range(message_count):
            output = {
                "type": "stdout",
                "content": f"Message {i}: " + "x" * 100,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Broadcast to all connections
            tasks = []
            for session_id, _ in connections:
                task = ws_manager.send_session_output(session_id, output)
                tasks.append(task)
            
            await asyncio.gather(*tasks)
        
        total_time = time.time() - start_time
        total_messages = message_count * connection_count
        messages_per_second = total_messages / total_time
        
        print(f"\nWebSocket Broadcast Performance:")
        print(f"  Connections: {connection_count}")
        print(f"  Messages per connection: {message_count}")
        print(f"  Total messages sent: {total_messages}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Messages per second: {messages_per_second:.2f}")
        
        # Performance assertions
        assert messages_per_second > 10000  # At least 10k messages per second
        
        # Cleanup
        for session_id, _ in connections:
            await ws_manager.disconnect(session_id)


class TestStressScenarios:
    """Stress test scenarios."""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_rapid_session_churn(
        self,
        mock_pty_manager_fast: PtyManager
    ):
        """Test rapid creation and destruction of sessions."""
        churn_cycles = 100
        sessions_per_cycle = 10
        
        start_time = time.time()
        
        for cycle in range(churn_cycles):
            # Create sessions
            sessions = []
            for i in range(sessions_per_cycle):
                config = SessionConfig(
                    session_id=f"churn-{cycle}-{i}"
                )
                session = ClaudeCliSession(
                    config=config,
                    pty_manager=mock_pty_manager_fast,
                    output_callback=None
                )
                await session.initialize()
                sessions.append(session)
            
            # Use sessions briefly
            for session in sessions:
                if session.state == SessionState.READY:
                    await session.send_command("echo test")
            
            # Destroy sessions
            for session in sessions:
                await session.terminate()
                await session.cleanup()
        
        total_time = time.time() - start_time
        total_sessions = churn_cycles * sessions_per_cycle
        sessions_per_second = total_sessions / total_time
        
        print(f"\nSession Churn Performance:")
        print(f"  Total cycles: {churn_cycles}")
        print(f"  Sessions per cycle: {sessions_per_cycle}")
        print(f"  Total sessions: {total_sessions}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Sessions per second: {sessions_per_second:.2f}")
        
        # Performance assertions
        assert sessions_per_second > 10  # At least 10 sessions per second
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_output_buffer_limits(
        self,
        mock_pty_manager_fast: PtyManager
    ):
        """Test performance with output buffer at limits."""
        config = SessionConfig(session_id="buffer-stress")
        session = ClaudeCliSession(
            config=config,
            pty_manager=mock_pty_manager_fast,
            output_callback=None
        )
        await session.initialize()
        
        # Fill buffer to limit (10000 items)
        start_time = time.time()
        
        for i in range(15000):  # More than buffer limit
            output = SessionOutput("stdout", f"Line {i}")
            await session._handle_output(output)
        
        fill_time = time.time() - start_time
        
        # Test retrieval performance
        start_time = time.time()
        outputs = await session.get_output(limit=1000)
        retrieval_time = time.time() - start_time
        
        print(f"\nOutput Buffer Performance:")
        print(f"  Buffer limit: 10000")
        print(f"  Items added: 15000")
        print(f"  Fill time: {fill_time:.2f}s")
        print(f"  Buffer size: {len(session.output_buffer)}")
        print(f"  Retrieval time (1000 items): {retrieval_time*1000:.2f}ms")
        
        # Performance assertions
        assert len(session.output_buffer) == 10000  # Buffer limited
        assert retrieval_time < 0.1  # Under 100ms to retrieve 1000 items
        
        await session.cleanup()


class TestAPIEndpointPerformance:
    """Test performance of API endpoints."""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_api_request_throughput(self, test_client: AsyncClient):
        """Test API request throughput."""
        # Create a session for testing
        response = await test_client.post(
            "/api/v1/sessions/",
            json={"project_path": "/test"}
        )
        assert response.status_code == 200
        session_id = response.json()["id"]
        
        # Test request throughput
        request_count = 100
        start_time = time.time()
        
        tasks = []
        for i in range(request_count):
            # Mix of different endpoints
            if i % 3 == 0:
                task = test_client.get(f"/api/v1/sessions/{session_id}")
            elif i % 3 == 1:
                task = test_client.get(f"/api/v1/sessions/{session_id}/output")
            else:
                task = test_client.get("/api/v1/sessions/")
            tasks.append(task)
        
        responses = await asyncio.gather(*tasks)
        total_time = time.time() - start_time
        
        # Calculate metrics
        successful = sum(1 for r in responses if r.status_code == 200)
        requests_per_second = request_count / total_time
        
        print(f"\nAPI Request Throughput:")
        print(f"  Total requests: {request_count}")
        print(f"  Successful: {successful}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Requests per second: {requests_per_second:.2f}")
        
        # Performance assertions
        assert successful >= request_count * 0.95  # 95% success rate
        assert requests_per_second > 50  # At least 50 requests per second
        
        # Cleanup
        await test_client.delete(f"/api/v1/sessions/{session_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])