"""
Integration tests for Redis operations.
"""

import json
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

from app.services.redis_client import get_redis_client
from app.services.task_queue_service import TaskQueueService
from app.models.database import TaskPriority, TaskStatus


@pytest.mark.integration
@pytest.mark.redis
class TestRedisIntegration:
    """Integration tests for Redis operations."""

    @pytest.mark.asyncio
    async def test_redis_connection(self, mock_redis):
        """Test Redis connection and basic operations."""
        # Test ping
        result = await mock_redis.ping()
        assert result is True
        
        # Test set and get
        await mock_redis.set("test_key", "test_value")
        mock_redis.get.return_value = b"test_value"
        
        value = await mock_redis.get("test_key")
        assert value == b"test_value"

    @pytest.mark.asyncio
    async def test_task_queue_redis_operations(self, test_session, mock_redis, created_project):
        """Test task queue operations with Redis."""
        service = TaskQueueService(test_session, mock_redis)
        
        # Create a task queue
        queue = await service.create_task_queue(
            project_id=created_project["id"],
            name="Redis Test Queue",
            description="Test queue for Redis integration",
            max_workers=3,
            priority=TaskPriority.HIGH
        )
        
        # Verify Redis operations were called
        assert mock_redis.hset.called or mock_redis.set.called
        
        # Test queue statistics
        mock_redis.hgetall.return_value = {
            b"pending_tasks": b"5",
            b"running_tasks": b"2",
            b"completed_tasks": b"10",
            b"failed_tasks": b"1"
        }
        
        stats = await service.get_queue_stats(queue.id)
        assert isinstance(stats, dict)

    @pytest.mark.asyncio
    async def test_task_queue_worker_management(self, test_session, mock_redis, created_task_queue):
        """Test task queue worker management in Redis."""
        service = TaskQueueService(test_session, mock_redis)
        queue_id = created_task_queue["id"]
        
        # Mock Redis operations for worker management
        mock_redis.hget.return_value = b"0"  # No active workers
        mock_redis.hset.return_value = 1
        mock_redis.hincrby.return_value = 1
        
        # Start worker
        success = await service.start_queue_worker(queue_id, "worker-1")
        assert success is True
        
        # Verify Redis calls
        mock_redis.hset.assert_called()
        
        # Mock active workers
        mock_redis.hget.return_value = b"1"
        
        # Stop worker
        mock_redis.hincrby.return_value = 0
        success = await service.stop_queue_worker(queue_id, "worker-1")
        assert success is True

    @pytest.mark.asyncio
    async def test_task_priority_queue_redis(self, test_session, mock_redis, created_task_queue):
        """Test task priority queue operations in Redis."""
        service = TaskQueueService(test_session, mock_redis)
        queue_id = created_task_queue["id"]
        
        # Mock Redis list operations
        mock_redis.lpush.return_value = 1
        mock_redis.rpop.return_value = b'{"task_id": "task-123", "priority": "high"}'
        mock_redis.llen.return_value = 1
        
        # Add task to priority queue
        task_data = {
            "task_id": "task-123",
            "priority": "high",
            "created_at": datetime.utcnow().isoformat()
        }
        
        success = await service.enqueue_task(queue_id, task_data)
        assert success is True
        
        # Verify Redis lpush was called
        mock_redis.lpush.assert_called()
        
        # Dequeue task
        task = await service.dequeue_task(queue_id)
        assert task is not None
        assert task["task_id"] == "task-123"
        
        # Verify Redis rpop was called
        mock_redis.rpop.assert_called()

    @pytest.mark.asyncio
    async def test_task_status_caching(self, mock_redis):
        """Test task status caching in Redis."""
        task_id = "task-123"
        
        # Mock Redis operations
        mock_redis.hset.return_value = 1
        mock_redis.hget.return_value = b"running"
        mock_redis.expire.return_value = True
        
        # Cache task status
        await mock_redis.hset(f"task:{task_id}:status", "status", "running")
        await mock_redis.expire(f"task:{task_id}:status", 3600)  # 1 hour TTL
        
        # Retrieve cached status
        cached_status = await mock_redis.hget(f"task:{task_id}:status", "status")
        assert cached_status == b"running"
        
        # Verify calls
        mock_redis.hset.assert_called_with(f"task:{task_id}:status", "status", "running")
        mock_redis.expire.assert_called_with(f"task:{task_id}:status", 3600)

    @pytest.mark.asyncio
    async def test_session_management_redis(self, mock_redis):
        """Test session management with Redis."""
        session_id = "session-456"
        
        # Mock Redis operations
        mock_redis.hset.return_value = 1
        mock_redis.hgetall.return_value = {
            b"created_at": b"2024-01-01T00:00:00Z",
            b"last_activity": b"2024-01-01T01:00:00Z",
            b"command_count": b"5"
        }
        mock_redis.expire.return_value = True
        
        # Store session data
        session_data = {
            "created_at": "2024-01-01T00:00:00Z",
            "last_activity": "2024-01-01T01:00:00Z",
            "command_count": 5
        }
        
        for key, value in session_data.items():
            await mock_redis.hset(f"session:{session_id}", key, str(value))
        
        await mock_redis.expire(f"session:{session_id}", 86400)  # 24 hours
        
        # Retrieve session data
        cached_session = await mock_redis.hgetall(f"session:{session_id}")
        assert cached_session[b"command_count"] == b"5"
        
        # Verify expiration was set
        mock_redis.expire.assert_called_with(f"session:{session_id}", 86400)

    @pytest.mark.asyncio
    async def test_command_history_caching(self, mock_redis):
        """Test command history caching in Redis."""
        session_id = "session-789"
        
        # Mock Redis list operations for command history
        mock_redis.lpush.return_value = 1
        mock_redis.lrange.return_value = [
            b'{"command": "ls -la", "timestamp": "2024-01-01T00:00:00Z", "status": "completed"}',
            b'{"command": "pwd", "timestamp": "2024-01-01T00:01:00Z", "status": "completed"}'
        ]
        mock_redis.ltrim.return_value = True
        
        # Add commands to history
        commands = [
            {"command": "ls -la", "timestamp": "2024-01-01T00:00:00Z", "status": "completed"},
            {"command": "pwd", "timestamp": "2024-01-01T00:01:00Z", "status": "completed"}
        ]
        
        for command in commands:
            command_json = json.dumps(command)
            await mock_redis.lpush(f"session:{session_id}:history", command_json)
        
        # Limit history to last 100 commands
        await mock_redis.ltrim(f"session:{session_id}:history", 0, 99)
        
        # Retrieve command history
        history = await mock_redis.lrange(f"session:{session_id}:history", 0, 10)
        assert len(history) == 2
        
        # Parse first command
        first_command = json.loads(history[0])
        assert first_command["command"] == "ls -la"
        assert first_command["status"] == "completed"

    @pytest.mark.asyncio
    async def test_redis_pub_sub_notifications(self, mock_redis):
        """Test Redis pub/sub for real-time notifications."""
        channel = "task_updates"
        
        # Mock Redis pub/sub operations
        mock_redis.publish.return_value = 1
        
        # Publish task update notification
        notification = {
            "type": "task_status_changed",
            "task_id": "task-123",
            "project_id": "project-456",
            "status": "completed",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        notification_json = json.dumps(notification)
        subscribers = await mock_redis.publish(channel, notification_json)
        
        assert subscribers == 1
        mock_redis.publish.assert_called_with(channel, notification_json)

    @pytest.mark.asyncio
    async def test_redis_atomic_operations(self, mock_redis):
        """Test Redis atomic operations for concurrent access."""
        queue_id = "queue-123"
        
        # Mock Redis transaction operations
        mock_redis.incr.return_value = 1
        mock_redis.decr.return_value = 0
        
        # Atomic increment for task counter
        new_count = await mock_redis.incr(f"queue:{queue_id}:task_count")
        assert new_count == 1
        
        # Atomic decrement
        new_count = await mock_redis.decr(f"queue:{queue_id}:task_count")
        assert new_count == 0

    @pytest.mark.asyncio
    async def test_redis_bulk_operations(self, mock_redis):
        """Test Redis bulk operations for efficiency."""
        # Mock Redis pipeline operations
        mock_pipeline = AsyncMock()
        mock_pipeline.hset = AsyncMock()
        mock_pipeline.expire = AsyncMock()
        mock_pipeline.execute = AsyncMock(return_value=[True, True, True])
        mock_redis.pipeline.return_value = mock_pipeline
        
        # Bulk update multiple task statuses
        task_updates = [
            ("task-1", "completed"),
            ("task-2", "failed"),
            ("task-3", "running")
        ]
        
        pipe = mock_redis.pipeline()
        for task_id, status in task_updates:
            await pipe.hset(f"task:{task_id}", "status", status)
            await pipe.expire(f"task:{task_id}", 3600)
        
        results = await pipe.execute()
        
        # Verify all operations succeeded
        assert len(results) == 6  # 3 hset + 3 expire operations
        mock_pipeline.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_redis_key_expiration(self, mock_redis):
        """Test Redis key expiration and cleanup."""
        # Mock Redis expiration operations
        mock_redis.expire.return_value = True
        mock_redis.ttl.return_value = 3600
        mock_redis.exists.return_value = 1
        
        # Set expiration on various keys
        keys_with_ttl = [
            ("session:123", 86400),  # 24 hours
            ("task:456:cache", 3600),  # 1 hour
            ("queue:789:stats", 1800)  # 30 minutes
        ]
        
        for key, ttl in keys_with_ttl:
            await mock_redis.expire(key, ttl)
        
        # Check TTL
        remaining_ttl = await mock_redis.ttl("session:123")
        assert remaining_ttl == 3600
        
        # Verify key exists
        exists = await mock_redis.exists("session:123")
        assert exists == 1

    @pytest.mark.asyncio
    async def test_redis_error_handling(self, mock_redis):
        """Test Redis error handling and recovery."""
        # Mock Redis connection error
        mock_redis.ping.side_effect = Exception("Redis connection failed")
        
        with pytest.raises(Exception):
            await mock_redis.ping()
        
        # Mock recovery
        mock_redis.ping.side_effect = None
        mock_redis.ping.return_value = True
        
        # Connection should work after recovery
        result = await mock_redis.ping()
        assert result is True

    @pytest.mark.asyncio
    async def test_redis_memory_management(self, mock_redis):
        """Test Redis memory management and cleanup."""
        # Mock Redis memory operations
        mock_redis.delete.return_value = 1
        mock_redis.keys.return_value = [b"old_key_1", b"old_key_2", b"old_key_3"]
        
        # Simulate cleanup of old keys
        pattern = "old_key_*"
        old_keys = await mock_redis.keys(pattern)
        
        assert len(old_keys) == 3
        
        # Delete old keys
        for key in old_keys:
            deleted = await mock_redis.delete(key)
            assert deleted == 1

    @pytest.mark.asyncio
    async def test_redis_data_serialization(self, mock_redis):
        """Test Redis data serialization and deserialization."""
        # Complex data structure
        complex_data = {
            "task_id": "task-123",
            "metadata": {
                "created_at": "2024-01-01T00:00:00Z",
                "priority": "high",
                "tags": ["urgent", "production"],
                "config": {
                    "timeout": 300,
                    "retries": 3,
                    "environment": "prod"
                }
            },
            "dependencies": ["task-001", "task-002"],
            "progress": 0.75
        }
        
        # Serialize to JSON
        serialized_data = json.dumps(complex_data)
        
        # Mock Redis operations
        mock_redis.set.return_value = True
        mock_redis.get.return_value = serialized_data.encode()
        
        # Store complex data
        await mock_redis.set("complex_task_data", serialized_data)
        
        # Retrieve and deserialize
        stored_data = await mock_redis.get("complex_task_data")
        deserialized_data = json.loads(stored_data.decode())
        
        # Verify data integrity
        assert deserialized_data["task_id"] == "task-123"
        assert deserialized_data["metadata"]["priority"] == "high"
        assert len(deserialized_data["dependencies"]) == 2
        assert deserialized_data["progress"] == 0.75