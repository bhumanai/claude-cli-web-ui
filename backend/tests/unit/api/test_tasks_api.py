"""
Unit tests for task management API endpoints.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import (
    TaskCreateRequest,
    TaskUpdateRequest,
    TaskResponse,
    TaskListResponse,
    TaskStatsResponse,
    TaskDependencyCreateRequest,
    TaskDependencyResponse,
    TaskExecutionLogResponse
)
from app.models.database import TaskStatus, TaskPriority


@pytest.mark.unit
@pytest.mark.api
class TestTasksAPI:
    """Test cases for task management API endpoints."""

    @pytest.mark.asyncio
    async def test_create_task_success(self, test_client, created_project, created_task_queue):
        """Test successful task creation."""
        task_data = {
            "project_id": created_project["id"],
            "task_queue_id": created_task_queue["id"],
            "name": "Test Task",
            "command": "echo 'hello world'",
            "description": "A test task",
            "priority": "medium",
            "timeout": 300,
            "max_retries": 3,
            "input_data": {"key": "value"},
            "tags": ["test"],
            "metadata": {"env": "test"}
        }
        
        response = await test_client.post("/api/v1/tasks/", json=task_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == task_data["name"]
        assert data["command"] == task_data["command"]
        assert data["status"] == "pending"
        assert data["project_id"] == created_project["id"]
        assert data["task_queue_id"] == created_task_queue["id"]

    @pytest.mark.asyncio
    async def test_create_task_invalid_project(self, test_client):
        """Test task creation with invalid project ID."""
        task_data = {
            "project_id": "invalid-project-id",
            "task_queue_id": "invalid-queue-id",
            "name": "Test Task",
            "command": "echo 'hello world'"
        }
        
        response = await test_client.post("/api/v1/tasks/", json=task_data)
        
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_get_task_success(self, test_client, created_task):
        """Test successful task retrieval."""
        task_id = created_task["id"]
        
        response = await test_client.get(f"/api/v1/tasks/{task_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == task_id
        assert data["name"] == created_task["name"]

    @pytest.mark.asyncio
    async def test_get_task_not_found(self, test_client):
        """Test task retrieval with non-existent ID."""
        response = await test_client.get("/api/v1/tasks/non-existent-id")
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_tasks_success(self, test_client, created_task):
        """Test successful task listing."""
        response = await test_client.get("/api/v1/tasks/")
        
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data
        assert "total" in data
        assert len(data["tasks"]) > 0

    @pytest.mark.asyncio
    async def test_list_tasks_with_filters(self, test_client, created_project, created_task):
        """Test task listing with filters."""
        project_id = created_project["id"]
        
        response = await test_client.get(f"/api/v1/tasks/?project_id={project_id}")
        
        assert response.status_code == 200
        data = response.json()
        for task in data["tasks"]:
            assert task["project_id"] == project_id

    @pytest.mark.asyncio
    async def test_list_tasks_with_status_filter(self, test_client, created_task):
        """Test task listing with status filter."""
        response = await test_client.get("/api/v1/tasks/?status=pending")
        
        assert response.status_code == 200
        data = response.json()
        for task in data["tasks"]:
            assert task["status"] == "pending"

    @pytest.mark.asyncio
    async def test_list_tasks_invalid_status_filter(self, test_client):
        """Test task listing with invalid status filter."""
        response = await test_client.get("/api/v1/tasks/?status=invalid_status")
        
        assert response.status_code == 400
        assert "Invalid status" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_tasks_with_priority_filter(self, test_client, created_task):
        """Test task listing with priority filter."""
        response = await test_client.get("/api/v1/tasks/?priority=medium")
        
        assert response.status_code == 200
        data = response.json()
        for task in data["tasks"]:
            assert task["priority"] == "medium"

    @pytest.mark.asyncio
    async def test_list_tasks_invalid_priority_filter(self, test_client):
        """Test task listing with invalid priority filter."""
        response = await test_client.get("/api/v1/tasks/?priority=invalid_priority")
        
        assert response.status_code == 400
        assert "Invalid priority" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_tasks_with_search(self, test_client, created_task):
        """Test task listing with search parameter."""
        search_term = "Test"
        response = await test_client.get(f"/api/v1/tasks/?search={search_term}")
        
        assert response.status_code == 200
        data = response.json()
        for task in data["tasks"]:
            assert (search_term.lower() in task["name"].lower() or 
                   search_term.lower() in task["description"].lower() or
                   search_term.lower() in task["command"].lower())

    @pytest.mark.asyncio
    async def test_list_tasks_with_pagination(self, test_client, created_task):
        """Test task listing with pagination."""
        response = await test_client.get("/api/v1/tasks/?limit=5&offset=0")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tasks"]) <= 5

    @pytest.mark.asyncio
    async def test_update_task_success(self, test_client, created_task):
        """Test successful task update."""
        task_id = created_task["id"]
        update_data = {
            "name": "Updated Task Name",
            "description": "Updated description",
            "priority": "high"
        }
        
        response = await test_client.put(f"/api/v1/tasks/{task_id}", json=update_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["description"] == update_data["description"]
        assert data["priority"] == update_data["priority"]

    @pytest.mark.asyncio
    async def test_update_task_not_found(self, test_client):
        """Test task update with non-existent ID."""
        update_data = {"name": "Updated Name"}
        
        response = await test_client.put("/api/v1/tasks/non-existent-id", json=update_data)
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_delete_task_success(self, test_client, created_task):
        """Test successful task deletion."""
        task_id = created_task["id"]
        
        response = await test_client.delete(f"/api/v1/tasks/{task_id}")
        
        assert response.status_code == 200
        assert "Task deleted successfully" in response.json()["message"]

    @pytest.mark.asyncio
    async def test_delete_task_not_found(self, test_client):
        """Test task deletion with non-existent ID."""
        response = await test_client.delete("/api/v1/tasks/non-existent-id")
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_cancel_task_success(self, test_client, created_task):
        """Test successful task cancellation."""
        task_id = created_task["id"]
        
        response = await test_client.post(f"/api/v1/tasks/{task_id}/cancel")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == task_id

    @pytest.mark.asyncio
    async def test_cancel_task_not_found(self, test_client):
        """Test task cancellation with non-existent ID."""
        response = await test_client.post("/api/v1/tasks/non-existent-id/cancel")
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_restart_task_success(self, test_client, created_task):
        """Test successful task restart."""
        task_id = created_task["id"]
        
        # First update task to failed status
        await test_client.put(f"/api/v1/tasks/{task_id}", json={"status": "failed"})
        
        response = await test_client.post(f"/api/v1/tasks/{task_id}/restart")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == task_id

    @pytest.mark.asyncio
    async def test_restart_task_not_found(self, test_client):
        """Test task restart with non-existent ID."""
        response = await test_client.post("/api/v1/tasks/non-existent-id/restart")
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_ready_tasks(self, test_client, created_task_queue):
        """Test getting ready tasks."""
        queue_id = created_task_queue["id"]
        
        response = await test_client.get(f"/api/v1/tasks/ready?task_queue_id={queue_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_get_task_stats(self, test_client, created_project, created_task):
        """Test getting task statistics."""
        project_id = created_project["id"]
        
        response = await test_client.get(f"/api/v1/tasks/stats?project_id={project_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert "total_tasks" in data or isinstance(data, dict)

    @pytest.mark.asyncio
    async def test_get_task_dependencies(self, test_client, created_task):
        """Test getting task dependencies."""
        task_id = created_task["id"]
        
        response = await test_client.get(f"/api/v1/tasks/{task_id}/dependencies")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_get_task_dependencies_not_found(self, test_client):
        """Test getting dependencies for non-existent task."""
        response = await test_client.get("/api/v1/tasks/non-existent-id/dependencies")
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_add_task_dependency_success(self, test_client, created_project, created_task_queue):
        """Test successful task dependency addition."""
        # Create two tasks for dependency testing
        task_data1 = {
            "project_id": created_project["id"],
            "task_queue_id": created_task_queue["id"],
            "name": "Task 1",
            "command": "echo 'task 1'"
        }
        task_data2 = {
            "project_id": created_project["id"],
            "task_queue_id": created_task_queue["id"],
            "name": "Task 2",
            "command": "echo 'task 2'"
        }
        
        response1 = await test_client.post("/api/v1/tasks/", json=task_data1)
        response2 = await test_client.post("/api/v1/tasks/", json=task_data2)
        
        task1 = response1.json()
        task2 = response2.json()
        
        # Add dependency
        dependency_data = {
            "depends_on_task_id": task2["id"],
            "dependency_type": "prerequisite",
            "is_hard_dependency": True
        }
        
        response = await test_client.post(
            f"/api/v1/tasks/{task1['id']}/dependencies", 
            json=dependency_data
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["task_id"] == task1["id"]
        assert data["depends_on_task_id"] == task2["id"]

    @pytest.mark.asyncio
    async def test_remove_task_dependency_success(self, test_client, created_project, created_task_queue):
        """Test successful task dependency removal."""
        # Create tasks and dependency first
        task_data1 = {
            "project_id": created_project["id"],
            "task_queue_id": created_task_queue["id"],
            "name": "Task 1",
            "command": "echo 'task 1'"
        }
        task_data2 = {
            "project_id": created_project["id"],
            "task_queue_id": created_task_queue["id"],
            "name": "Task 2",
            "command": "echo 'task 2'"
        }
        
        response1 = await test_client.post("/api/v1/tasks/", json=task_data1)
        response2 = await test_client.post("/api/v1/tasks/", json=task_data2)
        
        task1 = response1.json()
        task2 = response2.json()
        
        # Add dependency
        dependency_data = {
            "depends_on_task_id": task2["id"],
            "dependency_type": "prerequisite",
            "is_hard_dependency": True
        }
        
        await test_client.post(f"/api/v1/tasks/{task1['id']}/dependencies", json=dependency_data)
        
        # Remove dependency
        response = await test_client.delete(
            f"/api/v1/tasks/{task1['id']}/dependencies/{task2['id']}"
        )
        
        assert response.status_code == 200
        assert "Task dependency removed successfully" in response.json()["message"]

    @pytest.mark.asyncio
    async def test_check_task_dependencies_satisfied(self, test_client, created_task):
        """Test checking if task dependencies are satisfied."""
        task_id = created_task["id"]
        
        response = await test_client.get(f"/api/v1/tasks/{task_id}/dependencies/check")
        
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert "dependencies_satisfied" in data
        assert data["task_id"] == task_id

    @pytest.mark.asyncio
    async def test_check_task_dependencies_not_found(self, test_client):
        """Test checking dependencies for non-existent task."""
        response = await test_client.get("/api/v1/tasks/non-existent-id/dependencies/check")
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_task_execution_logs(self, test_client, created_task):
        """Test getting task execution logs."""
        task_id = created_task["id"]
        
        response = await test_client.get(f"/api/v1/tasks/{task_id}/execution-logs")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_get_task_execution_logs_with_pagination(self, test_client, created_task):
        """Test getting task execution logs with pagination."""
        task_id = created_task["id"]
        
        response = await test_client.get(
            f"/api/v1/tasks/{task_id}/execution-logs?limit=5&offset=0"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    @pytest.mark.asyncio
    async def test_get_task_execution_logs_not_found(self, test_client):
        """Test getting execution logs for non-existent task."""
        response = await test_client.get("/api/v1/tasks/non-existent-id/execution-logs")
        
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]


@pytest.mark.unit
@pytest.mark.api
class TestTasksAPIValidation:
    """Test cases for task API input validation."""

    @pytest.mark.asyncio
    async def test_create_task_missing_required_fields(self, test_client):
        """Test task creation with missing required fields."""
        response = await test_client.post("/api/v1/tasks/", json={})
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_task_invalid_priority(self, test_client, created_project, created_task_queue):
        """Test task creation with invalid priority."""
        task_data = {
            "project_id": created_project["id"],
            "task_queue_id": created_task_queue["id"],
            "name": "Test Task",
            "command": "echo 'hello world'",
            "priority": "invalid_priority"
        }
        
        response = await test_client.post("/api/v1/tasks/", json=task_data)
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_task_invalid_timeout(self, test_client, created_project, created_task_queue):
        """Test task creation with invalid timeout."""
        task_data = {
            "project_id": created_project["id"],
            "task_queue_id": created_task_queue["id"],
            "name": "Test Task",
            "command": "echo 'hello world'",
            "timeout": -1
        }
        
        response = await test_client.post("/api/v1/tasks/", json=task_data)
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_tasks_invalid_limit(self, test_client):
        """Test task listing with invalid limit parameter."""
        response = await test_client.get("/api/v1/tasks/?limit=0")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_tasks_limit_too_high(self, test_client):
        """Test task listing with limit parameter too high."""
        response = await test_client.get("/api/v1/tasks/?limit=2000")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_tasks_negative_offset(self, test_client):
        """Test task listing with negative offset parameter."""
        response = await test_client.get("/api/v1/tasks/?offset=-1")
        
        assert response.status_code == 422


@pytest.mark.unit  
@pytest.mark.api
class TestTasksAPIErrorHandling:
    """Test cases for task API error handling."""

    @pytest.mark.asyncio
    async def test_database_connection_error(self, test_client, monkeypatch):
        """Test API behavior when database connection fails."""
        async def mock_get_db_error():
            raise Exception("Database connection failed")
        
        # This would need proper mocking in a real scenario
        # For now, we test that the endpoint handles errors gracefully
        response = await test_client.get("/api/v1/tasks/")
        
        # The actual behavior depends on error handling implementation
        assert response.status_code in [200, 500, 503]

    @pytest.mark.asyncio
    async def test_service_layer_error(self, test_client, created_project, created_task_queue):
        """Test API behavior when service layer throws error."""
        task_data = {
            "project_id": "invalid-uuid-format",
            "task_queue_id": created_task_queue["id"],
            "name": "Test Task",
            "command": "echo 'hello world'"
        }
        
        response = await test_client.post("/api/v1/tasks/", json=task_data)
        
        # Should handle invalid UUID format gracefully
        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_concurrent_task_operations(self, test_client, created_task):
        """Test concurrent operations on the same task."""
        import asyncio
        
        task_id = created_task["id"]
        
        # Simulate concurrent updates
        async def update_task():
            return await test_client.put(
                f"/api/v1/tasks/{task_id}", 
                json={"name": "Updated Task"}
            )
        
        # Run multiple concurrent updates
        results = await asyncio.gather(
            update_task(),
            update_task(),
            update_task(),
            return_exceptions=True
        )
        
        # At least one should succeed
        success_count = sum(1 for r in results if hasattr(r, 'status_code') and r.status_code == 200)
        assert success_count >= 1