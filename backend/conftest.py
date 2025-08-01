"""
Global pytest configuration and fixtures for the Claude CLI Web UI backend.
"""

import asyncio
import os
import tempfile
from typing import AsyncGenerator, Generator
from unittest.mock import MagicMock, AsyncMock

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db_session
from app.models.database import Base
from app.services.redis_client import get_redis_client


# Set testing environment
os.environ["TESTING"] = "true"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["REDIS_URL"] = "redis://localhost:6379/1"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_db():
    """Create a test database for each test function."""
    # Create test database engine
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        poolclass=StaticPool,
        connect_args={
            "check_same_thread": False,
        },
    )
    
    # Create all tables
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield test_engine
    
    # Cleanup
    await test_engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_session(test_db):
    """Create a test database session for each test function."""
    async_session_maker = sessionmaker(
        test_db, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session_maker() as session:
        yield session


@pytest.fixture(scope="function")
def mock_redis():
    """Create a mock Redis client for testing."""
    redis_mock = AsyncMock()
    redis_mock.ping = AsyncMock(return_value=True)
    redis_mock.set = AsyncMock(return_value=True)
    redis_mock.get = AsyncMock(return_value=None)
    redis_mock.delete = AsyncMock(return_value=1)
    redis_mock.exists = AsyncMock(return_value=0)
    redis_mock.expire = AsyncMock(return_value=True)
    redis_mock.keys = AsyncMock(return_value=[])
    redis_mock.hset = AsyncMock(return_value=1)
    redis_mock.hget = AsyncMock(return_value=None)
    redis_mock.hgetall = AsyncMock(return_value={})
    redis_mock.hdel = AsyncMock(return_value=1)
    redis_mock.lpush = AsyncMock(return_value=1)
    redis_mock.rpop = AsyncMock(return_value=None)
    redis_mock.llen = AsyncMock(return_value=0)
    redis_mock.publish = AsyncMock(return_value=1)
    redis_mock.close = AsyncMock()
    return redis_mock


@pytest_asyncio.fixture(scope="function")
async def test_client(test_session, mock_redis):
    """Create a test client with dependency overrides."""
    
    def override_get_db():
        return test_session
    
    async def override_get_redis():
        return mock_redis
    
    # Override dependencies
    app.dependency_overrides[get_db_session] = override_get_db
    app.dependency_overrides[get_redis_client] = override_get_redis
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    
    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def sync_test_client(test_session, mock_redis):
    """Create a synchronous test client for simpler tests."""
    
    def override_get_db():
        return test_session
    
    async def override_get_redis():
        return mock_redis
    
    # Override dependencies
    app.dependency_overrides[get_db_session] = override_get_db
    app.dependency_overrides[get_redis_client] = override_get_redis
    
    with TestClient(app) as client:
        yield client
    
    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def mock_websocket():
    """Create a mock WebSocket connection for testing."""
    websocket_mock = MagicMock()
    websocket_mock.accept = AsyncMock()
    websocket_mock.send_text = AsyncMock()
    websocket_mock.send_json = AsyncMock()
    websocket_mock.receive_text = AsyncMock()
    websocket_mock.receive_json = AsyncMock()
    websocket_mock.close = AsyncMock()
    return websocket_mock


@pytest.fixture(scope="function")
def sample_project_data():
    """Sample project data for testing."""
    return {
        "name": "Test Project",
        "description": "A test project for unit testing",
        "path": "/test/project/path",
        "metadata": {"type": "test", "version": "1.0.0"}
    }


@pytest.fixture(scope="function")
def sample_task_queue_data():
    """Sample task queue data for testing."""
    return {
        "name": "Test Queue",
        "description": "A test task queue",
        "max_workers": 5,
        "priority": "medium",
        "metadata": {"environment": "test"}
    }


@pytest.fixture(scope="function")
def sample_task_data():
    """Sample task data for testing."""
    return {
        "name": "Test Task",
        "command": "echo 'Hello World'",
        "description": "A simple test task",
        "priority": "medium",
        "timeout": 300,
        "max_retries": 3,
        "input_data": {"param1": "value1"},
        "tags": ["test", "example"],
        "metadata": {"category": "testing"}
    }


@pytest.fixture(scope="function")
def auth_headers():
    """Mock authentication headers for testing."""
    return {
        "Authorization": "Bearer test-token",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="function")
def temp_file():
    """Create a temporary file for testing file operations."""
    with tempfile.NamedTemporaryFile(mode='w+', delete=False) as f:
        f.write("test content")
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    try:
        os.unlink(temp_path)
    except FileNotFoundError:
        pass


@pytest.fixture(scope="function")
def temp_directory():
    """Create a temporary directory for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir


# Async fixtures for complex test scenarios
@pytest_asyncio.fixture(scope="function")
async def created_project(test_client, sample_project_data):
    """Create a project for testing."""
    response = await test_client.post("/api/v1/projects/", json=sample_project_data)
    assert response.status_code == 200
    return response.json()


@pytest_asyncio.fixture(scope="function") 
async def created_task_queue(test_client, created_project, sample_task_queue_data):
    """Create a task queue for testing."""
    sample_task_queue_data["project_id"] = created_project["id"]
    response = await test_client.post("/api/v1/task-queues/", json=sample_task_queue_data)
    assert response.status_code == 200
    return response.json()


@pytest_asyncio.fixture(scope="function")
async def created_task(test_client, created_project, created_task_queue, sample_task_data):
    """Create a task for testing."""
    sample_task_data["project_id"] = created_project["id"]
    sample_task_data["task_queue_id"] = created_task_queue["id"]
    response = await test_client.post("/api/v1/tasks/", json=sample_task_data)
    assert response.status_code == 200
    return response.json()


# Performance testing fixtures
@pytest.fixture(scope="function")
def performance_timer():
    """Timer fixture for performance testing."""
    import time
    start_time = time.time()
    yield lambda: time.time() - start_time


# Mock external services
@pytest.fixture(scope="function")
def mock_command_executor():
    """Mock command executor for testing."""
    executor_mock = AsyncMock()
    executor_mock.execute_command = AsyncMock(return_value={
        "success": True,
        "output": "Command executed successfully",
        "error": None,
        "exit_code": 0,
        "execution_time": 1.23
    })
    return executor_mock


@pytest.fixture(scope="function")
def mock_file_system():
    """Mock file system operations for testing."""
    fs_mock = MagicMock()
    fs_mock.exists = MagicMock(return_value=True)
    fs_mock.read_file = MagicMock(return_value="file content")
    fs_mock.write_file = MagicMock(return_value=True)
    fs_mock.delete_file = MagicMock(return_value=True)
    fs_mock.create_directory = MagicMock(return_value=True)
    return fs_mock


# Configuration for specific test types
def pytest_configure(config):
    """Configure pytest with custom markers and settings."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers based on file paths."""
    for item in items:
        # Add unit marker to unit test files
        if "unit" in str(item.fspath):
            item.add_marker(pytest.mark.unit)
        
        # Add integration marker to integration test files
        if "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)
        
        # Add slow marker to performance tests
        if "performance" in str(item.fspath):
            item.add_marker(pytest.mark.slow)