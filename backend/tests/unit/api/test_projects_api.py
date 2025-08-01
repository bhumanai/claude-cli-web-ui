"""
Unit tests for project management API endpoints.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.models.schemas import (
    ProjectCreateRequest,
    ProjectUpdateRequest,
    ProjectResponse,
    ProjectListResponse,
    ProjectStatsResponse
)


@pytest.mark.unit
@pytest.mark.api
class TestProjectsAPI:
    """Test cases for project management API endpoints."""

    @pytest.mark.asyncio
    async def test_create_project_success(self, test_client):
        """Test successful project creation."""
        project_data = {
            "name": "Test Project",
            "description": "A test project for unit testing",
            "config": {"environment": "test"},
            "tags": ["test", "api"]
        }
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == project_data["name"]
        assert data["description"] == project_data["description"]
        assert data["status"] == "active"
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_project_duplicate_name(self, test_client, created_project):
        """Test project creation with duplicate name."""
        project_data = {
            "name": created_project["name"],
            "description": "Another project with same name"
        }
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_create_project_minimal_data(self, test_client):
        """Test project creation with minimal required data."""
        project_data = {
            "name": "Minimal Project"
        }
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == project_data["name"]

    @pytest.mark.asyncio
    async def test_get_project_success(self, test_client, created_project):
        """Test successful project retrieval."""
        project_id = created_project["id"]
        
        response = await test_client.get(f"/api/v1/projects/{project_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == project_id
        assert data["name"] == created_project["name"]

    @pytest.mark.asyncio
    async def test_get_project_not_found(self, test_client):
        """Test project retrieval with non-existent ID."""
        response = await test_client.get("/api/v1/projects/non-existent-id")
        
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_projects_success(self, test_client, created_project):
        """Test successful project listing."""
        response = await test_client.get("/api/v1/projects/")
        
        assert response.status_code == 200
        data = response.json()
        assert "projects" in data
        assert "total" in data
        assert len(data["projects"]) > 0

    @pytest.mark.asyncio
    async def test_list_projects_with_status_filter(self, test_client, created_project):
        """Test project listing with status filter."""
        response = await test_client.get("/api/v1/projects/?status=active")
        
        assert response.status_code == 200
        data = response.json()
        for project in data["projects"]:
            assert project["status"] == "active"

    @pytest.mark.asyncio
    async def test_list_projects_invalid_status_filter(self, test_client):
        """Test project listing with invalid status filter."""
        response = await test_client.get("/api/v1/projects/?status=invalid_status")
        
        assert response.status_code == 400
        assert "Invalid status" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_projects_with_search(self, test_client, created_project):
        """Test project listing with search parameter."""
        search_term = "Test"
        response = await test_client.get(f"/api/v1/projects/?search={search_term}")
        
        assert response.status_code == 200
        data = response.json()
        for project in data["projects"]:
            assert (search_term.lower() in project["name"].lower() or
                   search_term.lower() in (project.get("description", "") or "").lower())

    @pytest.mark.asyncio
    async def test_list_projects_with_tags_filter(self, test_client):
        """Test project listing with tags filter."""
        # Create project with specific tags
        project_data = {
            "name": "Tagged Project",
            "tags": ["api", "test"]
        }
        await test_client.post("/api/v1/projects/", json=project_data)
        
        response = await test_client.get("/api/v1/projects/?tags=api&tags=test")
        
        assert response.status_code == 200
        data = response.json()
        for project in data["projects"]:
            project_tags = project.get("tags", [])
            assert any(tag in ["api", "test"] for tag in project_tags)

    @pytest.mark.asyncio
    async def test_list_projects_with_pagination(self, test_client, created_project):
        """Test project listing with pagination."""
        response = await test_client.get("/api/v1/projects/?limit=5&offset=0")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["projects"]) <= 5

    @pytest.mark.asyncio
    async def test_update_project_success(self, test_client, created_project):
        """Test successful project update."""
        project_id = created_project["id"]
        update_data = {
            "name": "Updated Project Name",
            "description": "Updated description",
            "status": "active"
        }
        
        response = await test_client.put(f"/api/v1/projects/{project_id}", json=update_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["description"] == update_data["description"]
        assert data["status"] == update_data["status"]

    @pytest.mark.asyncio
    async def test_update_project_not_found(self, test_client):
        """Test project update with non-existent ID."""
        update_data = {"name": "Updated Name"}
        
        response = await test_client.put("/api/v1/projects/non-existent-id", json=update_data)
        
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_project_duplicate_name(self, test_client, created_project):
        """Test project update with duplicate name."""
        # Create another project
        project_data = {
            "name": "Another Project"
        }
        response = await test_client.post("/api/v1/projects/", json=project_data)
        another_project = response.json()
        
        # Try to update first project with second project's name
        update_data = {
            "name": another_project["name"]
        }
        
        response = await test_client.put(f"/api/v1/projects/{created_project['id']}", json=update_data)
        
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_delete_project_success(self, test_client, created_project):
        """Test successful project deletion."""
        project_id = created_project["id"]
        
        response = await test_client.delete(f"/api/v1/projects/{project_id}")
        
        assert response.status_code == 200
        assert "Project deleted successfully" in response.json()["message"]

    @pytest.mark.asyncio
    async def test_delete_project_not_found(self, test_client):
        """Test project deletion with non-existent ID."""
        response = await test_client.delete("/api/v1/projects/non-existent-id")
        
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_archive_project_success(self, test_client, created_project):
        """Test successful project archiving."""
        project_id = created_project["id"]
        
        response = await test_client.post(f"/api/v1/projects/{project_id}/archive")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == project_id
        assert data["status"] == "archived"

    @pytest.mark.asyncio
    async def test_archive_project_not_found(self, test_client):
        """Test project archiving with non-existent ID."""
        response = await test_client.post("/api/v1/projects/non-existent-id/archive")
        
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_project_stats(self, test_client, created_project):
        """Test getting project statistics."""
        project_id = created_project["id"]
        
        response = await test_client.get(f"/api/v1/projects/{project_id}/stats")
        
        assert response.status_code == 200
        data = response.json()
        # Stats structure depends on implementation
        assert isinstance(data, dict)

    @pytest.mark.asyncio
    async def test_get_project_stats_not_found(self, test_client):
        """Test getting stats for non-existent project."""
        response = await test_client.get("/api/v1/projects/non-existent-id/stats")
        
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_project_tasks(self, test_client, created_project, created_task):
        """Test listing tasks for a project."""
        project_id = created_project["id"]
        
        response = await test_client.get(f"/api/v1/projects/{project_id}/tasks")
        
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_list_project_tasks_with_status_filter(self, test_client, created_project, created_task):
        """Test listing project tasks with status filter."""
        project_id = created_project["id"]
        
        response = await test_client.get(f"/api/v1/projects/{project_id}/tasks?status=pending")
        
        assert response.status_code == 200
        data = response.json()
        for task in data["tasks"]:
            assert task["status"] == "pending"

    @pytest.mark.asyncio
    async def test_list_project_tasks_not_found(self, test_client):
        """Test listing tasks for non-existent project."""
        response = await test_client.get("/api/v1/projects/non-existent-id/tasks")
        
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_project_queues(self, test_client, created_project, created_task_queue):
        """Test listing task queues for a project."""
        project_id = created_project["id"]
        
        response = await test_client.get(f"/api/v1/projects/{project_id}/queues")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_list_project_queues_not_found(self, test_client):
        """Test listing queues for non-existent project."""
        response = await test_client.get("/api/v1/projects/non-existent-id/queues")
        
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_projects_summary(self, test_client, created_project):
        """Test getting projects summary statistics."""
        response = await test_client.get("/api/v1/projects/summary/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


@pytest.mark.unit
@pytest.mark.api
class TestProjectsAPIValidation:
    """Test cases for project API input validation."""

    @pytest.mark.asyncio
    async def test_create_project_missing_name(self, test_client):
        """Test project creation with missing name."""
        response = await test_client.post("/api/v1/projects/", json={})
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_project_empty_name(self, test_client):
        """Test project creation with empty name."""
        project_data = {"name": ""}
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_project_name_too_long(self, test_client):
        """Test project creation with name too long."""
        project_data = {"name": "a" * 300}  # Assuming max length is 255
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_project_invalid_config(self, test_client):
        """Test project creation with invalid config format."""
        project_data = {
            "name": "Test Project",
            "config": "invalid-config-format"  # Should be dict
        }
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_projects_invalid_limit(self, test_client):
        """Test project listing with invalid limit parameter."""
        response = await test_client.get("/api/v1/projects/?limit=0")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_projects_limit_too_high(self, test_client):
        """Test project listing with limit parameter too high."""
        response = await test_client.get("/api/v1/projects/?limit=2000")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_projects_negative_offset(self, test_client):
        """Test project listing with negative offset parameter."""
        response = await test_client.get("/api/v1/projects/?offset=-1")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_project_invalid_status(self, test_client, created_project):
        """Test project update with invalid status."""
        project_id = created_project["id"]
        update_data = {
            "status": "invalid_status"
        }
        
        response = await test_client.put(f"/api/v1/projects/{project_id}", json=update_data)
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_project_invalid_config(self, test_client, created_project):
        """Test project update with invalid config format."""
        project_id = created_project["id"]
        update_data = {
            "config": "invalid-config-format"  # Should be dict
        }
        
        response = await test_client.put(f"/api/v1/projects/{project_id}", json=update_data)
        
        assert response.status_code == 422


@pytest.mark.unit
@pytest.mark.api
class TestProjectsAPIErrorHandling:
    """Test cases for project API error handling."""

    @pytest.mark.asyncio
    async def test_concurrent_project_creation(self, test_client):
        """Test concurrent project creation with same name."""
        import asyncio
        
        project_data = {
            "name": "Concurrent Project"
        }
        
        # Simulate concurrent creation
        async def create_project():
            return await test_client.post("/api/v1/projects/", json=project_data)
        
        # Run multiple concurrent creations
        results = await asyncio.gather(
            create_project(),
            create_project(),
            create_project(),
            return_exceptions=True
        )
        
        # Only one should succeed
        success_count = sum(1 for r in results if hasattr(r, 'status_code') and r.status_code == 200)
        assert success_count == 1

    @pytest.mark.asyncio
    async def test_project_operations_with_invalid_uuid(self, test_client):
        """Test project operations with invalid UUID format."""
        invalid_id = "not-a-valid-uuid"
        
        # Test get
        response = await test_client.get(f"/api/v1/projects/{invalid_id}")
        assert response.status_code in [400, 404, 422]
        
        # Test update
        response = await test_client.put(f"/api/v1/projects/{invalid_id}", json={"name": "Test"})
        assert response.status_code in [400, 404, 422]
        
        # Test delete
        response = await test_client.delete(f"/api/v1/projects/{invalid_id}")
        assert response.status_code in [400, 404, 422]

    @pytest.mark.asyncio
    async def test_project_with_special_characters(self, test_client):
        """Test project creation with special characters in name."""
        project_data = {
            "name": "Test Project with émojis 🚀 and spécial chars!",
            "description": "Test with unicode: 测试 ñiño αβγ"
        }
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        # Should handle unicode characters properly
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == project_data["name"]
        assert data["description"] == project_data["description"]

    @pytest.mark.asyncio
    async def test_large_project_config(self, test_client):
        """Test project creation with large config object."""
        large_config = {
            "settings": {f"key_{i}": f"value_{i}" for i in range(1000)},
            "nested": {
                "deep": {
                    "data": [f"item_{i}" for i in range(100)]
                }
            }
        }
        
        project_data = {
            "name": "Large Config Project",
            "config": large_config
        }
        
        response = await test_client.post("/api/v1/projects/", json=project_data)
        
        # Should handle large config objects
        assert response.status_code in [200, 413]  # 413 if payload too large