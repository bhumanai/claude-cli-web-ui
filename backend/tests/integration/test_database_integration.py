"""
Integration tests for database operations.
"""

import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import (
    Project, TaskQueue, Task, TaskDependency, TaskExecutionLog,
    ProjectStatus, TaskStatus, TaskPriority, DependencyType
)
from app.services.project_service import ProjectService
from app.services.task_service import TaskService
from app.services.task_queue_service import TaskQueueService


@pytest.mark.integration
@pytest.mark.database
class TestDatabaseIntegration:
    """Integration tests for database operations."""

    @pytest.mark.asyncio
    async def test_project_crud_operations(self, test_session: AsyncSession):
        """Test complete CRUD operations for projects."""
        service = ProjectService(test_session)
        
        # Create
        project = await service.create_project(
            name="Integration Test Project",
            description="Test project for integration testing",
            config={"env": "test", "debug": True},
            tags=["test", "integration"]
        )
        
        assert project.id is not None
        assert project.name == "Integration Test Project"
        assert project.status == ProjectStatus.ACTIVE
        assert project.created_at is not None
        
        # Read
        retrieved_project = await service.get_project(project.id)
        assert retrieved_project is not None
        assert retrieved_project.id == project.id
        assert retrieved_project.name == project.name
        
        # Update
        updated_project = await service.update_project(
            project_id=project.id,
            name="Updated Project Name",
            description="Updated description",
            status=ProjectStatus.ARCHIVED
        )
        
        assert updated_project.name == "Updated Project Name"
        assert updated_project.status == ProjectStatus.ARCHIVED
        assert updated_project.updated_at is not None
        
        # List
        projects = await service.list_projects(limit=10, offset=0)
        assert len(projects) > 0
        assert any(p.id == project.id for p in projects)
        
        # Delete
        success = await service.delete_project(project.id)
        assert success is True
        
        # Verify deletion
        deleted_project = await service.get_project(project.id)
        assert deleted_project is None

    @pytest.mark.asyncio
    async def test_task_queue_crud_operations(self, test_session: AsyncSession, created_project):
        """Test complete CRUD operations for task queues."""
        from app.services.redis_client import get_redis_client
        redis_client = await get_redis_client()
        service = TaskQueueService(test_session, redis_client)
        
        # Create
        queue = await service.create_task_queue(
            project_id=created_project["id"],
            name="Integration Test Queue",
            description="Test queue for integration testing",
            max_workers=5,
            priority=TaskPriority.MEDIUM,
            config={"timeout": 300},
            metadata={"type": "test"}
        )
        
        assert queue.id is not None
        assert queue.name == "Integration Test Queue"
        assert queue.max_workers == 5
        assert queue.priority == TaskPriority.MEDIUM
        
        # Read
        retrieved_queue = await service.get_task_queue(queue.id)
        assert retrieved_queue is not None
        assert retrieved_queue.id == queue.id
        assert retrieved_queue.name == queue.name
        
        # Update
        updated_queue = await service.update_task_queue(
            queue_id=queue.id,
            name="Updated Queue Name",
            max_workers=10,
            priority=TaskPriority.HIGH
        )
        
        assert updated_queue.name == "Updated Queue Name"
        assert updated_queue.max_workers == 10
        assert updated_queue.priority == TaskPriority.HIGH
        
        # List
        queues = await service.list_task_queues(
            project_id=created_project["id"],
            limit=10,
            offset=0
        )
        assert len(queues) > 0
        assert any(q.id == queue.id for q in queues)
        
        # Delete
        success = await service.delete_task_queue(queue.id)
        assert success is True

    @pytest.mark.asyncio
    async def test_task_crud_operations(self, test_session: AsyncSession, created_project, created_task_queue):
        """Test complete CRUD operations for tasks."""
        service = TaskService(test_session)
        
        # Create
        task = await service.create_task(
            project_id=created_project["id"],
            task_queue_id=created_task_queue["id"],
            name="Integration Test Task",
            command="echo 'integration test'",
            description="Test task for integration testing",
            priority=TaskPriority.HIGH,
            timeout=600,
            max_retries=5,
            input_data={"param1": "value1", "param2": "value2"},
            tags=["test", "integration"],
            metadata={"type": "test", "env": "integration"}
        )
        
        assert task.id is not None
        assert task.name == "Integration Test Task"
        assert task.status == TaskStatus.PENDING
        assert task.priority == TaskPriority.HIGH
        assert task.timeout == 600
        assert task.max_retries == 5
        
        # Read
        retrieved_task = await service.get_task(task.id)
        assert retrieved_task is not None
        assert retrieved_task.id == task.id
        assert retrieved_task.name == task.name
        assert retrieved_task.input_data == {"param1": "value1", "param2": "value2"}
        
        # Update
        updated_task = await service.update_task(
            task_id=task.id,
            name="Updated Task Name",
            status=TaskStatus.RUNNING,
            priority=TaskPriority.LOW,
            output_data={"result": "success"}
        )
        
        assert updated_task.name == "Updated Task Name"
        assert updated_task.status == TaskStatus.RUNNING
        assert updated_task.priority == TaskPriority.LOW
        assert updated_task.output_data == {"result": "success"}
        
        # List
        tasks = await service.list_tasks(
            project_id=created_project["id"],
            limit=10,
            offset=0
        )
        assert len(tasks) > 0
        assert any(t.id == task.id for t in tasks)
        
        # Delete
        success = await service.delete_task(task.id)
        assert success is True

    @pytest.mark.asyncio
    async def test_task_dependencies(self, test_session: AsyncSession, created_project, created_task_queue):
        """Test task dependency operations."""
        service = TaskService(test_session)
        
        # Create two tasks
        task1 = await service.create_task(
            project_id=created_project["id"],
            task_queue_id=created_task_queue["id"],
            name="Task 1",
            command="echo 'task 1'"
        )
        
        task2 = await service.create_task(
            project_id=created_project["id"],
            task_queue_id=created_task_queue["id"],
            name="Task 2",
            command="echo 'task 2'"
        )
        
        # Add dependency (task1 depends on task2)
        dependency = await service.add_task_dependency(
            task_id=task1.id,
            depends_on_task_id=task2.id,
            dependency_type=DependencyType.PREREQUISITE,
            is_hard_dependency=True
        )
        
        assert dependency.task_id == task1.id
        assert dependency.depends_on_task_id == task2.id
        assert dependency.dependency_type == DependencyType.PREREQUISITE
        assert dependency.is_hard_dependency is True
        
        # Get dependencies
        dependencies = await service.get_task_dependencies(task1.id)
        assert len(dependencies) == 1
        assert dependencies[0].depends_on_task_id == task2.id
        
        # Check if dependencies are satisfied (task2 is still pending)
        satisfied = await service.check_task_dependencies_satisfied(task1.id)
        assert satisfied is False
        
        # Complete task2
        await service.update_task(task2.id, status=TaskStatus.COMPLETED)
        
        # Check dependencies again
        satisfied = await service.check_task_dependencies_satisfied(task1.id)
        assert satisfied is True
        
        # Remove dependency
        success = await service.remove_task_dependency(task1.id, task2.id)
        assert success is True
        
        # Verify removal
        dependencies = await service.get_task_dependencies(task1.id)
        assert len(dependencies) == 0

    @pytest.mark.asyncio
    async def test_circular_dependency_prevention(self, test_session: AsyncSession, created_project, created_task_queue):
        """Test prevention of circular dependencies."""
        service = TaskService(test_session)
        
        # Create three tasks
        task1 = await service.create_task(
            project_id=created_project["id"],
            task_queue_id=created_task_queue["id"],
            name="Task 1",
            command="echo 'task 1'"
        )
        
        task2 = await service.create_task(
            project_id=created_project["id"],
            task_queue_id=created_task_queue["id"],
            name="Task 2",
            command="echo 'task 2'"
        )
        
        task3 = await service.create_task(
            project_id=created_project["id"],
            task_queue_id=created_task_queue["id"],
            name="Task 3",
            command="echo 'task 3'"
        )
        
        # Create dependencies: task1 -> task2 -> task3
        await service.add_task_dependency(task1.id, task2.id, DependencyType.PREREQUISITE)
        await service.add_task_dependency(task2.id, task3.id, DependencyType.PREREQUISITE)
        
        # Try to create circular dependency: task3 -> task1
        with pytest.raises(ValueError):
            await service.add_task_dependency(task3.id, task1.id, DependencyType.PREREQUISITE)

    @pytest.mark.asyncio
    async def test_task_execution_logs(self, test_session: AsyncSession, created_task):
        """Test task execution log operations."""
        from app.services.execution_service import ExecutionService
        from app.services.task_queue_service import TaskQueueService
        from app.services.redis_client import get_redis_client
        from app.services.command_executor import CommandExecutor
        
        redis_client = await get_redis_client()
        task_service = TaskService(test_session)
        task_queue_service = TaskQueueService(test_session, redis_client)
        command_executor = CommandExecutor()
        
        service = ExecutionService(
            test_session, task_service, task_queue_service, redis_client, command_executor
        )
        
        task_id = created_task["id"]
        
        # Add execution logs
        await service.add_execution_log(
            task_id=task_id,
            log_type="info",
            message="Task started",
            details={"start_time": datetime.utcnow().isoformat()}
        )
        
        await service.add_execution_log(
            task_id=task_id,
            log_type="output",
            message="Command output",
            details={"stdout": "Hello World"}
        )
        
        await service.add_execution_log(
            task_id=task_id,
            log_type="error",
            message="Task failed",
            details={"stderr": "Command not found", "exit_code": 1}
        )
        
        # Retrieve logs
        logs = await service.get_task_execution_logs(task_id, limit=10, offset=0)
        
        assert len(logs) == 3
        assert logs[0].log_type == "info"
        assert logs[1].log_type == "output"
        assert logs[2].log_type == "error"
        assert "Command not found" in logs[2].message

    @pytest.mark.asyncio
    async def test_project_statistics(self, test_session: AsyncSession, created_project, created_task_queue):
        """Test project statistics calculation."""
        project_service = ProjectService(test_session)
        task_service = TaskService(test_session)
        
        project_id = created_project["id"]
        queue_id = created_task_queue["id"]
        
        # Create tasks with different statuses
        await task_service.create_task(
            project_id=project_id,
            task_queue_id=queue_id,
            name="Pending Task",
            command="echo 'pending'"
        )
        
        running_task = await task_service.create_task(
            project_id=project_id,
            task_queue_id=queue_id,
            name="Running Task",
            command="echo 'running'"
        )
        await task_service.update_task(running_task.id, status=TaskStatus.RUNNING)
        
        completed_task = await task_service.create_task(
            project_id=project_id,
            task_queue_id=queue_id,
            name="Completed Task",
            command="echo 'completed'"
        )
        await task_service.update_task(completed_task.id, status=TaskStatus.COMPLETED)
        
        failed_task = await task_service.create_task(
            project_id=project_id,
            task_queue_id=queue_id,
            name="Failed Task",
            command="echo 'failed'"
        )
        await task_service.update_task(failed_task.id, status=TaskStatus.FAILED)
        
        # Get project statistics
        stats = await project_service.get_project_stats(project_id)
        
        assert stats is not None
        # The exact structure depends on the implementation
        # but should include task counts by status
        assert isinstance(stats, dict)

    @pytest.mark.asyncio
    async def test_transaction_rollback(self, test_session: AsyncSession):
        """Test transaction rollback on error."""
        service = ProjectService(test_session)
        
        # Start a transaction that will fail
        try:
            async with test_session.begin():
                # Create a project
                project = await service.create_project(
                    name="Rollback Test Project",
                    description="This should be rolled back"
                )
                
                # Force an error (e.g., try to create duplicate name)
                await service.create_project(
                    name="Rollback Test Project",  # Same name
                    description="Duplicate name"
                )
                
        except Exception:
            # Exception expected due to duplicate name
            pass
        
        # Verify the first project was also rolled back
        projects = await service.list_projects(search="Rollback Test Project")
        assert len(projects) == 0

    @pytest.mark.asyncio
    async def test_concurrent_task_updates(self, test_session: AsyncSession, created_task):
        """Test concurrent updates to the same task."""
        import asyncio
        from sqlalchemy.exc import SQLAlchemyError
        
        service = TaskService(test_session)
        task_id = created_task["id"]
        
        async def update_task_status(status):
            try:
                return await service.update_task(task_id, status=status)
            except SQLAlchemyError:
                return None
        
        # Try concurrent updates
        results = await asyncio.gather(
            update_task_status(TaskStatus.RUNNING),
            update_task_status(TaskStatus.COMPLETED),
            update_task_status(TaskStatus.FAILED),
            return_exceptions=True
        )
        
        # At least one should succeed
        successful_updates = [r for r in results if r is not None and not isinstance(r, Exception)]
        assert len(successful_updates) >= 1

    @pytest.mark.asyncio
    async def test_database_constraints(self, test_session: AsyncSession):
        """Test database constraints and foreign key relationships."""
        project_service = ProjectService(test_session)
        task_service = TaskService(test_session)
        
        # Create a project
        project = await project_service.create_project(
            name="Constraint Test Project"
        )
        
        # Try to create a task with invalid project_id
        with pytest.raises(ValueError):
            await task_service.create_task(
                project_id="invalid-project-id",
                task_queue_id="invalid-queue-id",
                name="Invalid Task",
                command="echo 'invalid'"
            )

    @pytest.mark.asyncio
    async def test_pagination_and_filtering(self, test_session: AsyncSession, created_project, created_task_queue):
        """Test pagination and filtering across database operations."""
        task_service = TaskService(test_session)
        project_id = created_project["id"]
        queue_id = created_task_queue["id"]
        
        # Create multiple tasks with different properties
        tasks_created = []
        for i in range(15):
            priority = TaskPriority.HIGH if i % 3 == 0 else TaskPriority.MEDIUM
            tags = ["test", "batch"] if i % 2 == 0 else ["test", "single"]
            
            task = await task_service.create_task(
                project_id=project_id,
                task_queue_id=queue_id,
                name=f"Batch Task {i}",
                command=f"echo 'task {i}'",
                priority=priority,
                tags=tags
            )
            tasks_created.append(task)
        
        # Test pagination
        first_page = await task_service.list_tasks(
            project_id=project_id,
            limit=10,
            offset=0
        )
        assert len(first_page) == 10
        
        second_page = await task_service.list_tasks(
            project_id=project_id,
            limit=10,
            offset=10
        )
        assert len(second_page) >= 5  # At least the remaining tasks
        
        # Test filtering by priority
        high_priority_tasks = await task_service.list_tasks(
            project_id=project_id,
            priority=TaskPriority.HIGH,
            limit=100,
            offset=0
        )
        assert len(high_priority_tasks) == 5  # Every 3rd task (0, 3, 6, 9, 12)
        
        # Test filtering by tags
        batch_tasks = await task_service.list_tasks(
            project_id=project_id,
            tags=["batch"],
            limit=100,
            offset=0
        )
        assert len(batch_tasks) == 8  # Every even-indexed task
        
        # Test search
        search_results = await task_service.list_tasks(
            project_id=project_id,
            search="Batch Task 1",
            limit=100,
            offset=0
        )
        # Should find tasks 1, 10, 11, 12, 13, 14
        assert len(search_results) >= 1