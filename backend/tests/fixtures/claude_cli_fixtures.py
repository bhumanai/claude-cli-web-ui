"""Shared fixtures for Claude CLI testing."""

import asyncio
import os
import tempfile
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest

from app.services.claude_cli.claude_session import (
    ClaudeCliSession,
    SessionConfig,
    SessionOutput,
    SessionState,
)
from app.services.claude_cli.claude_session_manager import ClaudeSessionManager
from app.services.claude_cli.pty_manager import PtyManager
from app.services.claude_cli.pty_process import PtyProcess


# Mock PTY Process Fixtures
@pytest.fixture
def mock_pty_process_factory():
    """Factory for creating mock PTY processes."""
    def create_mock_process(
        pid: Optional[int] = None,
        master_fd: int = 10,
        is_alive: bool = True,
        exit_code: int = 0
    ) -> Mock:
        process = Mock(spec=PtyProcess)
        process.pid = pid or os.getpid()
        process.master_fd = master_fd
        process.is_alive = is_alive
        process.wait = AsyncMock(return_value=exit_code)
        process.send_signal = AsyncMock()
        process.cleanup = AsyncMock()
        process.reader = AsyncMock()
        process.writer = AsyncMock()
        return process
    
    return create_mock_process


@pytest.fixture
def mock_pty_manager_factory(mock_pty_process_factory):
    """Factory for creating mock PTY managers."""
    def create_mock_manager(
        create_pty_side_effect=None,
        read_output: Optional[bytes] = None
    ) -> AsyncMock:
        manager = AsyncMock(spec=PtyManager)
        
        if create_pty_side_effect:
            manager.create_pty.side_effect = create_pty_side_effect
        else:
            manager.create_pty.return_value = mock_pty_process_factory()
        
        manager.read_from_pty.return_value = read_output
        manager.write_to_pty = AsyncMock()
        manager.resize_pty = AsyncMock()
        manager.send_signal = AsyncMock()
        manager.cleanup_process = AsyncMock()
        manager.cleanup_all = AsyncMock()
        
        return manager
    
    return create_mock_manager


# Session Configuration Fixtures
@pytest.fixture
def session_config_factory():
    """Factory for creating session configurations."""
    def create_config(
        session_id: Optional[str] = None,
        task_id: Optional[str] = None,
        project_path: str = "/test/project",
        environment: Optional[Dict[str, str]] = None,
        timeout: int = 300,
        terminal_size: tuple[int, int] = (120, 40),
        auth_token: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> SessionConfig:
        return SessionConfig(
            session_id=session_id or str(uuid.uuid4()),
            task_id=task_id,
            project_path=project_path,
            environment=environment or {},
            timeout=timeout,
            terminal_size=terminal_size,
            auth_token=auth_token,
            metadata=metadata or {}
        )
    
    return create_config


# Session Output Fixtures
@pytest.fixture
def session_output_factory():
    """Factory for creating session outputs."""
    def create_output(
        output_type: str = "stdout",
        content: str = "test output",
        timestamp: Optional[datetime] = None
    ) -> SessionOutput:
        return SessionOutput(output_type, content, timestamp)
    
    return create_output


@pytest.fixture
def output_stream_factory(session_output_factory):
    """Factory for creating streams of session outputs."""
    def create_stream(
        count: int = 10,
        output_type: str = "stdout",
        content_prefix: str = "Line"
    ) -> List[SessionOutput]:
        outputs = []
        for i in range(count):
            content = f"{content_prefix} {i}: " + "x" * 50
            outputs.append(session_output_factory(output_type, content))
        return outputs
    
    return create_stream


# Claude Session Fixtures
@pytest.fixture
async def claude_session_factory(mock_pty_manager_factory, session_config_factory):
    """Factory for creating Claude CLI sessions."""
    sessions_created = []
    
    async def create_session(
        config: Optional[SessionConfig] = None,
        pty_manager: Optional[PtyManager] = None,
        output_callback: Optional[Callable[[SessionOutput], None]] = None,
        initialize: bool = True
    ) -> ClaudeCliSession:
        if not config:
            config = session_config_factory()
        
        if not pty_manager:
            pty_manager = mock_pty_manager_factory()
        
        session = ClaudeCliSession(
            config=config,
            pty_manager=pty_manager,
            output_callback=output_callback
        )
        
        if initialize:
            await session.initialize()
        
        sessions_created.append(session)
        return session
    
    yield create_session
    
    # Cleanup all created sessions
    for session in sessions_created:
        if session._pty_reader_task and not session._pty_reader_task.done():
            session._pty_reader_task.cancel()
            try:
                await session._pty_reader_task
            except asyncio.CancelledError:
                pass
        await session.cleanup()


# Session Manager Fixtures
@pytest.fixture
async def claude_session_manager_factory():
    """Factory for creating Claude session managers."""
    managers_created = []
    
    async def create_manager(
        start: bool = True
    ) -> ClaudeSessionManager:
        manager = ClaudeSessionManager()
        
        if start:
            await manager.start()
        
        managers_created.append(manager)
        return manager
    
    yield create_manager
    
    # Cleanup all created managers
    for manager in managers_created:
        await manager.stop()


# WebSocket Fixtures
@pytest.fixture
def mock_websocket_factory():
    """Factory for creating mock WebSocket connections."""
    def create_websocket(
        session_id: Optional[str] = None,
        client_host: str = "127.0.0.1",
        client_port: int = 12345
    ) -> AsyncMock:
        ws = AsyncMock()
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        ws.send_json = AsyncMock()
        ws.receive_text = AsyncMock()
        ws.receive_json = AsyncMock()
        ws.close = AsyncMock()
        ws.client = MagicMock()
        ws.client.host = client_host
        ws.client.port = client_port
        ws.session_id = session_id or str(uuid.uuid4())
        return ws
    
    return create_websocket


# Test Data Fixtures
@pytest.fixture
def sample_commands():
    """Sample commands for testing."""
    return [
        "echo 'Hello, World!'",
        "pwd",
        "ls -la",
        "python --version",
        "cat /etc/os-release",
        "ps aux | grep python",
        "df -h",
        "free -m",
        "uptime",
        "whoami"
    ]


@pytest.fixture
def sample_project_paths():
    """Sample project paths for testing."""
    return [
        "/home/user/projects/webapp",
        "/var/www/html",
        "/opt/applications/backend",
        "/Users/developer/code/frontend",
        "/workspace/microservices/auth"
    ]


@pytest.fixture
def sample_environments():
    """Sample environment configurations for testing."""
    return [
        {"NODE_ENV": "development", "PORT": "3000"},
        {"PYTHON_ENV": "production", "DEBUG": "false"},
        {"DATABASE_URL": "postgres://localhost:5432/test"},
        {"REDIS_URL": "redis://localhost:6379", "CACHE_TTL": "3600"},
        {"API_KEY": "test-api-key", "API_SECRET": "test-secret"}
    ]


# Temporary File/Directory Fixtures
@pytest.fixture
def temp_project_dir():
    """Create a temporary project directory."""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create some sample files
        os.makedirs(os.path.join(temp_dir, "src"))
        os.makedirs(os.path.join(temp_dir, "tests"))
        
        with open(os.path.join(temp_dir, "README.md"), "w") as f:
            f.write("# Test Project\n")
        
        with open(os.path.join(temp_dir, "src", "main.py"), "w") as f:
            f.write("print('Hello, World!')\n")
        
        yield temp_dir


# Performance Testing Fixtures
@pytest.fixture
def performance_timer():
    """Timer for performance measurements."""
    class Timer:
        def __init__(self):
            self.start_time = None
            self.lap_times = []
        
        def start(self):
            self.start_time = asyncio.get_event_loop().time()
            return self
        
        def lap(self, label: str = ""):
            if self.start_time is None:
                raise RuntimeError("Timer not started")
            
            current_time = asyncio.get_event_loop().time()
            elapsed = current_time - self.start_time
            self.lap_times.append((label, elapsed))
            return elapsed
        
        def stop(self):
            return self.lap("stop")
        
        def get_report(self):
            return {
                "total_time": self.lap_times[-1][1] if self.lap_times else 0,
                "laps": self.lap_times
            }
    
    return Timer()


@pytest.fixture
def memory_tracker():
    """Track memory usage during tests."""
    import psutil
    
    class MemoryTracker:
        def __init__(self):
            self.process = psutil.Process()
            self.initial_memory = None
            self.measurements = []
        
        def start(self):
            self.initial_memory = self.process.memory_info().rss / 1024 / 1024  # MB
            return self
        
        def measure(self, label: str = ""):
            current_memory = self.process.memory_info().rss / 1024 / 1024  # MB
            delta = current_memory - self.initial_memory if self.initial_memory else 0
            self.measurements.append((label, current_memory, delta))
            return current_memory
        
        def get_report(self):
            return {
                "initial_memory": self.initial_memory,
                "measurements": self.measurements,
                "peak_memory": max(m[1] for m in self.measurements) if self.measurements else 0,
                "total_increase": self.measurements[-1][2] if self.measurements else 0
            }
    
    return MemoryTracker()


# Error Injection Fixtures
@pytest.fixture
def error_injector():
    """Helper for injecting errors in tests."""
    class ErrorInjector:
        def __init__(self):
            self.error_count = 0
            self.should_fail = False
        
        def maybe_fail(self, probability: float = 0.1, error_type=Exception):
            """Randomly fail based on probability."""
            import random
            if self.should_fail or random.random() < probability:
                self.error_count += 1
                raise error_type(f"Injected error #{self.error_count}")
        
        def fail_after(self, count: int, error_type=Exception):
            """Fail after N calls."""
            self.error_count += 1
            if self.error_count > count:
                raise error_type(f"Failed after {count} calls")
        
        def reset(self):
            self.error_count = 0
            self.should_fail = False
    
    return ErrorInjector()


# Async Helpers
@pytest.fixture
def async_helpers():
    """Helper utilities for async testing."""
    class AsyncHelpers:
        @staticmethod
        async def gather_with_timeout(
            *tasks,
            timeout: float = 5.0,
            return_exceptions: bool = True
        ):
            """Gather tasks with timeout."""
            try:
                return await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=return_exceptions),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                # Cancel remaining tasks
                for task in tasks:
                    if isinstance(task, asyncio.Task) and not task.done():
                        task.cancel()
                raise
        
        @staticmethod
        async def wait_for_condition(
            condition: Callable[[], bool],
            timeout: float = 5.0,
            poll_interval: float = 0.1
        ):
            """Wait for a condition to become true."""
            start_time = asyncio.get_event_loop().time()
            while not condition():
                if asyncio.get_event_loop().time() - start_time > timeout:
                    raise asyncio.TimeoutError("Condition not met within timeout")
                await asyncio.sleep(poll_interval)
        
        @staticmethod
        async def run_with_timeout(coro, timeout: float = 5.0):
            """Run coroutine with timeout."""
            return await asyncio.wait_for(coro, timeout=timeout)
    
    return AsyncHelpers()


# Cleanup Helpers
@pytest.fixture
def cleanup_registry():
    """Registry for cleanup functions."""
    cleanup_functions = []
    
    def register(cleanup_func):
        """Register a cleanup function."""
        cleanup_functions.append(cleanup_func)
    
    yield register
    
    # Run all cleanup functions
    for func in reversed(cleanup_functions):
        try:
            if asyncio.iscoroutinefunction(func):
                asyncio.run(func())
            else:
                func()
        except Exception as e:
            print(f"Cleanup error: {e}")


if __name__ == "__main__":
    # Example usage
    import asyncio
    
    async def example_test():
        # Create factories
        config_factory = session_config_factory()
        output_factory = session_output_factory()
        
        # Create test data
        config = config_factory(session_id="test-123")
        output = output_factory(content="Test output")
        
        print(f"Config: {config.session_id}")
        print(f"Output: {output.to_dict()}")
    
    asyncio.run(example_test())