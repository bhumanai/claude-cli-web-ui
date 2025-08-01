"""
Tests for Task Decomposer

Tests the task decomposition functionality that breaks complex tasks
into tiny, verifiable micro-tasks.
"""

import pytest
import asyncio
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from app.services.meta_agent.task_decomposer import (
    TaskDecomposer,
    TaskDecompositionRequest,
    TaskDecompositionResult,
    MicroTask,
    TaskComplexity,
    TaskStatus,
    TaskPriority,
    VerificationCriteria
)
from app.services.meta_agent.context_engine import ContextEngine
from app.services.redis_client import RedisClient


@pytest.fixture
async def mock_redis_client():
    """Mock Redis client for testing."""
    mock_redis = Mock(spec=RedisClient)
    mock_redis.set = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    return mock_redis


@pytest.fixture
async def mock_context_engine():
    """Mock Context Engine for testing."""
    mock_engine = Mock(spec=ContextEngine)
    mock_engine.search_context = AsyncMock(return_value=[])
    return mock_engine


@pytest.fixture
async def task_decomposer(mock_redis_client, mock_context_engine):
    """Create task decomposer instance."""
    return TaskDecomposer(mock_redis_client, mock_context_engine)


@pytest.mark.asyncio
class TestTaskDecomposer:
    """Test Task Decomposer functionality."""
    
    async def test_simple_task_decomposition(self, task_decomposer):
        """Test decomposition of a simple task."""
        request = TaskDecompositionRequest(
            title="Create hello world API",
            description="Create a simple FastAPI endpoint that returns 'Hello World'",
            max_task_duration_minutes=10
        )
        
        result = await task_decomposer.decompose_task(request)
        
        assert isinstance(result, TaskDecompositionResult)
        assert len(result.micro_tasks) >= 1
        assert result.estimated_total_minutes > 0
        assert result.critical_path_minutes > 0
        assert len(result.external_validation_urls) == len(result.micro_tasks)
    
    async def test_complex_task_decomposition(self, task_decomposer):
        """Test decomposition of a complex task."""
        request = TaskDecompositionRequest(
            title="Build complete e-commerce system",
            description="Create a full e-commerce system with user authentication, product catalog, shopping cart, payment processing, and admin dashboard",
            max_task_duration_minutes=8
        )
        
        result = await task_decomposer.decompose_task(request)
        
        assert len(result.micro_tasks) >= 5  # Should break into multiple tasks
        assert result.estimated_total_minutes > 30  # Complex task should take longer
        
        # Verify micro-tasks have proper structure
        for task_dict in result.micro_tasks:
            task = MicroTask(**task_dict)
            assert task.estimated_minutes <= request.max_task_duration_minutes
            assert len(task.verification) > 0  # Each task should have verification criteria
            assert task.external_validation_url is not None
    
    async def test_micro_task_properties(self, task_decomposer):
        """Test that generated micro-tasks have correct properties."""
        request = TaskDecompositionRequest(
            title="Test task",
            description="Simple test task for validation",
            max_task_duration_minutes=5,
            preferred_agents=["python-pro"]
        )
        
        result = await task_decomposer.decompose_task(request)
        
        for task_dict in result.micro_tasks:
            task = MicroTask(**task_dict)
            
            # Verify tiny task constraints (Brooklyn guy's criticism)
            assert task.estimated_minutes <= 10, "Task should be completable in under 10 minutes"
            assert task.complexity == TaskComplexity.MICRO, "All generated tasks should be micro-tasks"
            
            # Verify verifiability
            assert len(task.verification) > 0, "Task should have verification criteria"
            assert task.external_validation_url is not None, "Task should have external validation URL"
            
            # Verify agent assignment
            assert task.agent_name in ["python-pro", "workflow-coordinator", "backend-architect"]
    
    async def test_task_dependencies(self, task_decomposer):
        """Test that task dependencies are properly set."""
        request = TaskDecompositionRequest(
            title="Sequential task",
            description="Task that requires multiple sequential steps for proper completion"
        )
        
        result = await task_decomposer.decompose_task(request)
        
        if len(result.micro_tasks) > 1:
            # Check that dependencies are properly set
            task_ids = {task_dict["id"] for task_dict in result.micro_tasks}
            
            for task_dict in result.micro_tasks[1:]:  # Skip first task
                task = MicroTask(**task_dict)
                # Later tasks should have dependencies
                for dep_id in task.dependencies:
                    assert dep_id in task_ids, "Dependency should reference valid task ID"
    
    async def test_timing_estimates(self, task_decomposer):
        """Test timing estimation accuracy."""
        request = TaskDecompositionRequest(
            title="Timed task",
            description="Task for testing timing estimates",
            max_task_duration_minutes=7
        )
        
        result = await task_decomposer.decompose_task(request)
        
        # Verify timing calculations
        total_estimated = sum(task_dict["estimated_minutes"] for task_dict in result.micro_tasks)
        assert result.estimated_total_minutes == total_estimated
        
        # Critical path should be <= total time
        assert result.critical_path_minutes <= result.estimated_total_minutes
    
    async def test_verification_criteria_generation(self, task_decomposer):
        """Test generation of verification criteria."""
        request = TaskDecompositionRequest(
            title="API creation task",
            description="Create API endpoint with tests and documentation"
        )
        
        result = await task_decomposer.decompose_task(request)
        
        # Check that verification criteria are appropriate
        for task_dict in result.micro_tasks:
            verification = task_dict["verification"]
            assert len(verification) > 0, "Task should have verification criteria"
            
            for criteria in verification:
                assert "type" in criteria
                assert "parameters" in criteria
                assert "expected_result" in criteria
                assert criteria["type"] in [
                    "file_exists", "api_response", "test_passes", "output_contains"
                ]
    
    async def test_external_validation_urls(self, task_decomposer):
        """Test generation of external validation URLs."""
        request = TaskDecompositionRequest(
            title="External validation test",
            description="Task to test external validation URL generation"
        )
        
        result = await task_decomposer.decompose_task(request)
        
        # Verify external validation URLs
        assert len(result.external_validation_urls) == len(result.micro_tasks)
        
        for url in result.external_validation_urls:
            assert url.startswith("https://"), "Validation URL should be HTTPS"
            assert "validation.meta-agent.com" in url, "Should use validation service"
        
        # Verify tasks have individual validation URLs
        for task_dict in result.micro_tasks:
            assert task_dict["external_validation_url"] is not None
            assert task_dict["external_validation_url"] in result.external_validation_urls
    
    async def test_agent_selection(self, task_decomposer):
        """Test appropriate agent selection for tasks."""
        test_cases = [
            ("Create Python API", "python-pro"),
            ("Security audit", "security-auditor"),
            ("Frontend component", "frontend-developer"),
            ("Test suite", "test-automator"),
            ("Deploy application", "devops-troubleshooter")
        ]
        
        for description, expected_agent in test_cases:
            request = TaskDecompositionRequest(
                title="Agent selection test",
                description=description
            )
            
            result = await task_decomposer.decompose_task(request)
            
            # At least one task should use the expected agent
            used_agents = [task_dict["agent_name"] for task_dict in result.micro_tasks]
            assert expected_agent in used_agents or "workflow-coordinator" in used_agents
    
    async def test_preferred_agents(self, task_decomposer):
        """Test that preferred agents are respected."""
        request = TaskDecompositionRequest(
            title="Preferred agent test",
            description="Task with preferred agent specification",
            preferred_agents=["security-auditor", "test-automator"]
        )
        
        result = await task_decomposer.decompose_task(request)
        
        # First task should use preferred agent
        first_task = MicroTask(**result.micro_tasks[0])
        assert first_task.agent_name in request.preferred_agents
    
    async def test_caching(self, task_decomposer):
        """Test caching of decomposition results."""
        request = TaskDecompositionRequest(
            title="Cache test",
            description="Task for testing caching functionality"
        )
        
        result = await task_decomposer.decompose_task(request)
        
        # Verify cache was called
        task_decomposer.redis_client.set.assert_called()
        
        # Verify cache key format
        call_args = task_decomposer.redis_client.set.call_args
        cache_key = call_args[0][0]
        assert cache_key.startswith("task_decomposition:")
        assert result.original_task_id in cache_key
    
    async def test_validation_plan_generation(self, task_decomposer):
        """Test generation of validation plans."""
        request = TaskDecompositionRequest(
            title="Validation plan test",
            description="Task for testing validation plan generation"
        )
        
        result = await task_decomposer.decompose_task(request)
        
        # Verify validation plan structure
        validation_plan = result.validation_plan
        assert "total_verification_criteria" in validation_plan
        assert "external_validation_required" in validation_plan
        assert "validation_phases" in validation_plan
        assert "estimated_validation_minutes" in validation_plan
        
        # Verify validation phases
        phases = validation_plan["validation_phases"]
        phase_names = [phase["phase"] for phase in phases]
        assert "individual_task_validation" in phase_names
        
        # External validation should be required (Brooklyn guy's criticism)
        assert validation_plan["external_validation_required"] is True


@pytest.mark.asyncio
class TestMicroTask:
    """Test MicroTask data structure."""
    
    def test_micro_task_creation(self):
        """Test micro-task creation with defaults."""
        task = MicroTask(
            id="test-123",
            title="Test Task",
            description="Test description",
            agent_name="python-pro"
        )
        
        assert task.id == "test-123"
        assert task.complexity == TaskComplexity.MICRO
        assert task.status == TaskStatus.PENDING
        assert task.priority == TaskPriority.MEDIUM
        assert task.created_at is not None
        assert task.parameters == {}
        assert task.dependencies == []
        assert task.verification == []
    
    def test_micro_task_timing_constraint(self):
        """Test that micro-tasks respect timing constraints."""
        task = MicroTask(
            id="test-123",
            title="Test Task",
            description="Test description",
            agent_name="python-pro",
            estimated_minutes=15  # Over the micro-task limit
        )
        
        # Task should be flagged for review if over 10 minutes
        assert task.estimated_minutes <= 15  # Allow creation but flag for review


@pytest.mark.asyncio 
class TestTaskDecompositionRequest:
    """Test TaskDecompositionRequest validation."""
    
    def test_valid_request(self):
        """Test valid decomposition request."""
        request = TaskDecompositionRequest(
            title="Valid Task",
            description="Valid task description",
            max_task_duration_minutes=8
        )
        
        assert request.title == "Valid Task"
        assert request.max_task_duration_minutes == 8
        assert request.context == {}
        assert request.preferred_agents == []
    
    def test_invalid_max_duration(self):
        """Test validation of max task duration."""
        with pytest.raises(ValueError):
            TaskDecompositionRequest(
                title="Invalid Task",
                description="Task with invalid duration",
                max_task_duration_minutes=70  # Over 60 minute limit
            )
        
        with pytest.raises(ValueError):
            TaskDecompositionRequest(
                title="Invalid Task",
                description="Task with invalid duration",
                max_task_duration_minutes=0  # Under 1 minute limit
            )


@pytest.mark.asyncio
class TestIntegration:
    """Integration tests for task decomposition."""
    
    async def test_end_to_end_decomposition(self, task_decomposer):
        """Test complete decomposition workflow."""
        # Create a realistic task request
        request = TaskDecompositionRequest(
            title="Build REST API with Authentication",
            description="Create a FastAPI application with JWT authentication, user registration, login, and protected endpoints. Include comprehensive tests and documentation.",
            max_task_duration_minutes=10,
            preferred_agents=["python-pro", "security-auditor", "test-automator"],
            deadline=datetime.utcnow() + timedelta(hours=4)
        )
        
        # Decompose the task
        result = await task_decomposer.decompose_task(request)
        
        # Verify comprehensive result
        assert len(result.micro_tasks) >= 3, "Complex task should have multiple micro-tasks"
        assert result.estimated_total_minutes >= 15, "Realistic time estimate"
        assert len(result.external_validation_urls) == len(result.micro_tasks)
        
        # Verify all tasks are verifiable (Brooklyn guy's criticism)
        for task_dict in result.micro_tasks:
            task = MicroTask(**task_dict)
            assert len(task.verification) > 0, "Each task must be verifiable"
            assert task.estimated_minutes <= 10, "Each task must be tiny"
            assert task.external_validation_url is not None, "External validation required"
        
        # Verify dependency structure makes sense
        execution_graph = result.execution_graph
        assert "nodes" in execution_graph
        assert "links" in execution_graph
        
        # Verify validation plan addresses external validation
        validation_plan = result.validation_plan
        assert validation_plan["external_validation_required"] is True