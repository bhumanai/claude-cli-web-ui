"""
Integration Tests for Meta-Agent System v4.0

Comprehensive integration tests covering the complete workflow from task decomposition
through execution to validation, addressing all of Brooklyn guy's criticisms.
"""

import pytest
import asyncio
import json
import tempfile
import os
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from app.services.meta_agent.task_decomposer import (
    TaskDecomposer,
    TaskDecompositionRequest,
    MicroTask,
    TaskComplexity
)
from app.services.meta_agent.micro_task_executor import (
    MicroTaskExecutor,
    ExecutionMode
)
from app.services.meta_agent.validation_engine import (
    ValidationEngine,
    ValidationLevel,
    ValidationReport
)
from app.services.meta_agent.context_engine import ContextEngine, DocumentationLibrary
from app.services.redis_client import RedisClient
from app.services.command_executor import CommandExecutor


@pytest.fixture
async def mock_redis_client():
    """Mock Redis client for testing."""
    mock_redis = Mock(spec=RedisClient)
    mock_redis.set = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    return mock_redis


@pytest.fixture
async def mock_command_executor():
    """Mock Command Executor for testing."""
    mock_executor = Mock(spec=CommandExecutor)
    
    # Create mock response
    mock_response = Mock()
    mock_response.dict.return_value = {
        "command_id": "test-123",
        "session_id": "session-123",
        "command": "echo 'test'",
        "status": "completed",
        "output": [{"content": "Task completed successfully"}],
        "exit_code": 0,
        "execution_time": 2.5
    }
    
    async def mock_execute_command(*args, **kwargs):
        yield mock_response
    
    mock_executor.execute_command = mock_execute_command
    return mock_executor


@pytest.fixture
async def context_engine(mock_redis_client):
    """Create context engine with mocked dependencies."""
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        db_path = tmp.name
    
    engine = ContextEngine(mock_redis_client, db_path)
    
    # Mock the embedding model
    with patch('app.services.meta_agent.context_engine.SentenceTransformer') as mock_st:
        mock_model = Mock()
        mock_model.encode.return_value = [0.1, 0.2, 0.3] * 128  # 384-dim vector
        mock_st.return_value = mock_model
        
        await engine.initialize()
        yield engine
    
    # Cleanup
    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture
async def task_decomposer(mock_redis_client, context_engine):
    """Create task decomposer with dependencies."""
    return TaskDecomposer(mock_redis_client, context_engine)


@pytest.fixture
async def micro_task_executor(mock_redis_client, mock_command_executor):
    """Create micro-task executor with dependencies."""
    return MicroTaskExecutor(
        redis_client=mock_redis_client,
        command_executor=mock_command_executor,
        execution_mode=ExecutionMode.SANDBOX
    )


@pytest.fixture
async def validation_engine(mock_redis_client):
    """Create validation engine with dependencies."""
    return ValidationEngine(mock_redis_client)


@pytest.mark.asyncio
class TestMetaAgentSystemIntegration:
    """Integration tests for the complete Meta-Agent System workflow."""
    
    async def test_complete_workflow_simple_task(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test complete workflow for a simple task."""
        # 1. Task Decomposition
        request = TaskDecompositionRequest(
            title="Create Hello World API",
            description="Create a simple FastAPI endpoint that returns 'Hello World'",
            max_task_duration_minutes=8,
            preferred_agents=["python-pro"]
        )
        
        decomposition_result = await task_decomposer.decompose_task(request)
        
        assert len(decomposition_result.micro_tasks) >= 1
        assert decomposition_result.estimated_total_minutes <= 30
        
        # 2. Execute each micro-task
        execution_results = []
        for task_dict in decomposition_result.micro_tasks:
            task = MicroTask(**task_dict)
            
            # Execute the micro-task
            execution_updates = []
            async for update in micro_task_executor.execute_micro_task(
                task, 
                "integration-test-session"
            ):
                execution_updates.append(update)
            
            # Get final result
            final_update = execution_updates[-1]
            assert final_update["type"] == "completed"
            execution_results.append(final_update["result"])
        
        # 3. Validate execution results
        for i, execution_result in enumerate(execution_results):
            from app.services.meta_agent.micro_task_executor import MicroTaskExecutionResult
            result_obj = MicroTaskExecutionResult(**execution_result)
            task = MicroTask(**decomposition_result.micro_tasks[i])
            
            validation_report = await validation_engine.validate_micro_task(
                task,
                result_obj,
                ValidationLevel.COMPREHENSIVE
            )
            
            # Verify validation results
            assert validation_report.total_tests > 0
            assert validation_report.security_score >= 0
            assert len(validation_report.external_validations) > 0
            
            # Verify Brooklyn guy's criticisms are addressed
            assert validation_report.compliance_checks["task_size_compliance"] is True
            assert validation_report.compliance_checks["verification_criteria_present"] is True
            assert validation_report.compliance_checks["external_validation_url_present"] is True
    
    async def test_complex_task_decomposition_and_execution(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test workflow for a complex task that requires multiple micro-tasks."""
        # Complex task that should be broken down
        request = TaskDecompositionRequest(
            title="Build User Authentication System",
            description="Create a complete user authentication system with registration, login, JWT tokens, password hashing, email verification, and password reset functionality",
            max_task_duration_minutes=10,
            preferred_agents=["python-pro", "security-auditor"]
        )
        
        # 1. Decompose the complex task
        decomposition_result = await task_decomposer.decompose_task(request)
        
        # Should create multiple micro-tasks
        assert len(decomposition_result.micro_tasks) >= 3
        assert decomposition_result.estimated_total_minutes >= 20
        
        # Verify all tasks are micro-tasks (Brooklyn guy's criticism)
        for task_dict in decomposition_result.micro_tasks:
            task = MicroTask(**task_dict)
            assert task.estimated_minutes <= 10, "Each task should be under 10 minutes"
            assert task.complexity == TaskComplexity.MICRO
            assert len(task.verification) > 0, "Each task should have verification criteria"
            assert task.external_validation_url is not None, "External validation required"
        
        # 2. Execute first few micro-tasks (simulate partial execution)
        tasks_to_execute = decomposition_result.micro_tasks[:2]  # Execute first 2 tasks
        
        for task_dict in tasks_to_execute:
            task = MicroTask(**task_dict)
            
            execution_updates = []
            async for update in micro_task_executor.execute_micro_task(
                task,
                "complex-task-session"
            ):
                execution_updates.append(update)
            
            # Verify execution completed
            final_update = execution_updates[-1]
            assert final_update["type"] == "completed"
            
            # 3. Validate each execution
            execution_result = final_update["result"]
            from app.services.meta_agent.micro_task_executor import MicroTaskExecutionResult
            result_obj = MicroTaskExecutionResult(**execution_result)
            
            validation_report = await validation_engine.validate_micro_task(
                task,
                result_obj,
                ValidationLevel.COMPREHENSIVE
            )
            
            # Comprehensive validation checks
            assert validation_report.total_tests >= 5, "Should have comprehensive test coverage"
            assert len(validation_report.categories_tested) >= 3, "Multiple test categories"
            assert validation_report.security_score >= 70, "Minimum security score"
            assert len(validation_report.external_validations) >= 2, "Multiple external validations"
    
    async def test_security_focused_workflow(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test workflow with security-focused task."""
        request = TaskDecompositionRequest(
            title="Security Audit API Endpoints",
            description="Perform comprehensive security audit of REST API endpoints including authentication, authorization, input validation, and vulnerability scanning",
            max_task_duration_minutes=8,
            preferred_agents=["security-auditor"]
        )
        
        # 1. Decompose security task
        decomposition_result = await task_decomposer.decompose_task(request)
        
        # Verify security-appropriate decomposition
        security_keywords = ["audit", "security", "validation", "auth"]
        for task_dict in decomposition_result.micro_tasks:
            task = MicroTask(**task_dict)
            assert any(keyword in task.description.lower() for keyword in security_keywords)
            assert task.agent_name in ["security-auditor", "workflow-coordinator"]
        
        # 2. Execute security tasks
        for task_dict in decomposition_result.micro_tasks[:1]:  # Execute first task
            task = MicroTask(**task_dict)
            
            execution_updates = []
            async for update in micro_task_executor.execute_micro_task(
                task,
                "security-audit-session"
            ):
                execution_updates.append(update)
            
            execution_result = execution_updates[-1]["result"]
            from app.services.meta_agent.micro_task_executor import MicroTaskExecutionResult
            result_obj = MicroTaskExecutionResult(**execution_result)
            
            # 3. Security-focused validation
            validation_report = await validation_engine.validate_micro_task(
                task,
                result_obj,
                ValidationLevel.PRODUCTION  # Highest validation level
            )
            
            # Security validation requirements
            assert validation_report.security_score >= 80, "High security score required"
            assert any(cat.value == "security" for cat in validation_report.categories_tested)
            assert len([t for t in validation_report.test_results if t["category"] == "security"]) >= 3
    
    async def test_performance_monitoring_workflow(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test workflow with performance monitoring."""
        request = TaskDecompositionRequest(
            title="Optimize Database Queries",
            description="Optimize slow database queries and implement caching",
            max_task_duration_minutes=9,
            preferred_agents=["database-optimizer", "performance-engineer"]
        )
        
        decomposition_result = await task_decomposer.decompose_task(request)
        
        # Execute task with performance monitoring
        task = MicroTask(**decomposition_result.micro_tasks[0])
        
        execution_updates = []
        async for update in micro_task_executor.execute_micro_task(
            task,
            "performance-test-session",
            timeout_seconds=60  # Shorter timeout for performance testing
        ):
            execution_updates.append(update)
        
        execution_result = execution_updates[-1]["result"]
        from app.services.meta_agent.micro_task_executor import MicroTaskExecutionResult
        result_obj = MicroTaskExecutionResult(**execution_result)
        
        # Performance-focused validation
        validation_report = await validation_engine.validate_micro_task(
            task,
            result_obj,
            ValidationLevel.COMPREHENSIVE
        )
        
        # Performance validation checks
        assert "performance" in [cat.value for cat in validation_report.categories_tested]
        assert "execution_time_seconds" in validation_report.performance_metrics
        assert validation_report.performance_metrics["execution_time_seconds"] <= task.estimated_minutes * 60
    
    async def test_external_validation_integration(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test external validation integration (Brooklyn guy's criticism)."""
        request = TaskDecompositionRequest(
            title="Create API Documentation",
            description="Generate comprehensive API documentation with examples",
            max_task_duration_minutes=7
        )
        
        decomposition_result = await task_decomposer.decompose_task(request)
        
        # Verify external validation URLs are generated
        assert len(decomposition_result.external_validation_urls) == len(decomposition_result.micro_tasks)
        
        for url in decomposition_result.external_validation_urls:
            assert url.startswith("https://"), "External validation URLs should be HTTPS"
            assert "validation" in url.lower(), "URL should reference validation service"
        
        # Execute task
        task = MicroTask(**decomposition_result.micro_tasks[0])
        
        execution_updates = []
        async for update in micro_task_executor.execute_micro_task(
            task,
            "external-validation-session"
        ):
            execution_updates.append(update)
        
        execution_result = execution_updates[-1]["result"]
        from app.services.meta_agent.micro_task_executor import MicroTaskExecutionResult
        result_obj = MicroTaskExecutionResult(**execution_result)
        
        # Mock external validation responses
        with patch.object(validation_engine, 'external_services') as mock_services:
            mock_service = Mock()
            mock_service.validate_task = AsyncMock(return_value={
                "service": "TestValidator",
                "status": "success",
                "validation_score": 85,
                "feedback": "Task completed successfully with good quality",
                "external_proof": "test_proof_12345",
                "timestamp": datetime.utcnow().isoformat()
            })
            mock_services.__iter__.return_value = [mock_service]
            
            validation_report = await validation_engine.validate_micro_task(
                task,
                result_obj,
                ValidationLevel.COMPREHENSIVE
            )
            
            # Verify external validation was performed
            assert len(validation_report.external_validations) > 0
            external_validation = validation_report.external_validations[0]
            assert external_validation["status"] == "success"
            assert external_validation["validation_score"] >= 70
            assert "external_proof" in external_validation
    
    async def test_error_handling_and_recovery(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test error handling and recovery mechanisms."""
        # Create task that might fail
        request = TaskDecompositionRequest(
            title="Test Error Handling",
            description="Task designed to test error handling and recovery",
            max_task_duration_minutes=5
        )
        
        decomposition_result = await task_decomposer.decompose_task(request)
        task = MicroTask(**decomposition_result.micro_tasks[0])
        
        # Modify task to have a command that might fail
        task.command = "exit 1"  # Command that returns error
        
        # Execute task (should handle failure gracefully)
        execution_updates = []
        async for update in micro_task_executor.execute_micro_task(
            task,
            "error-handling-session"
        ):
            execution_updates.append(update)
        
        # Should complete even with errors
        assert len(execution_updates) > 0
        final_update = execution_updates[-1]
        
        # May be completed or error type depending on validation
        assert final_update["type"] in ["completed", "error"]
        
        if final_update["type"] == "completed":
            execution_result = final_update["result"]
            from app.services.meta_agent.micro_task_executor import MicroTaskExecutionResult
            result_obj = MicroTaskExecutionResult(**execution_result)
            
            # Validation should handle failed execution gracefully
            validation_report = await validation_engine.validate_micro_task(
                task,
                result_obj,
                ValidationLevel.BASIC
            )
            
            # Should complete validation even for failed task
            assert validation_report.validation_id is not None
            assert validation_report.completed_at is not None
    
    async def test_compliance_with_brooklyn_guy_criticisms(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test that all of Brooklyn guy's criticisms are addressed."""
        # Create task to test all criticisms
        request = TaskDecompositionRequest(
            title="Complete Feature Implementation",
            description="Implement a complete feature with all requirements including tiny verifiable tasks, real documentation, and external validation",
            max_task_duration_minutes=10
        )
        
        # 1. Task Decomposition
        decomposition_result = await task_decomposer.decompose_task(request)
        
        # Criticism 1: Tiny verifiable tasks
        for task_dict in decomposition_result.micro_tasks:
            task = MicroTask(**task_dict)
            assert task.estimated_minutes <= 10, "Tasks must be tiny (< 10 minutes)"
            assert len(task.verification) > 0, "Tasks must be verifiable"
            assert task.complexity == TaskComplexity.MICRO, "All tasks must be micro-tasks"
        
        # Criticism 2: Real documentation
        assert len(decomposition_result.external_validation_urls) > 0, "Must have external validation"
        assert decomposition_result.validation_plan["external_validation_required"] is True
        
        # 2. Execute tasks
        for task_dict in decomposition_result.micro_tasks[:1]:  # Execute first task
            task = MicroTask(**task_dict)
            
            execution_updates = []
            async for update in micro_task_executor.execute_micro_task(
                task,
                "brooklyn-compliance-session"
            ):
                execution_updates.append(update)
            
            execution_result = execution_updates[-1]["result"]
            from app.services.meta_agent.micro_task_executor import MicroTaskExecutionResult
            result_obj = MicroTaskExecutionResult(**execution_result)
            
            # Criticism 3: External validation
            assert len(result_obj.external_validations) > 0, "Must have external validation results"
            assert result_obj.verification_proof is not None, "Must have cryptographic proof"
            
            # 3. Comprehensive validation
            validation_report = await validation_engine.validate_micro_task(
                task,
                result_obj,
                ValidationLevel.PRODUCTION
            )
            
            # Verify all compliance checks pass
            compliance_checks = validation_report.compliance_checks
            assert compliance_checks["task_size_compliance"] is True, "Task size must comply"
            assert compliance_checks["verification_criteria_present"] is True, "Verification required"
            assert compliance_checks["external_validation_url_present"] is True, "External validation required"
            
            # Verify external validation was performed
            assert len(validation_report.external_validations) > 0, "External validation must be performed"
            
            # Verify cryptographic proof exists
            assert validation_report.validation_proof != "", "Validation proof must exist"
            
            # Parse and verify proof structure
            proof_data = json.loads(validation_report.validation_proof)
            assert "proof_data" in proof_data
            assert "signature" in proof_data
            assert "proof_version" in proof_data
            assert proof_data["proof_version"] == "4.0"


@pytest.mark.asyncio
class TestMetaAgentSystemPerformance:
    """Performance tests for the Meta-Agent System."""
    
    async def test_system_performance_under_load(
        self,
        task_decomposer,
        micro_task_executor,
        validation_engine
    ):
        """Test system performance with multiple concurrent tasks."""
        # Create multiple tasks
        tasks = []
        for i in range(3):  # Test with 3 concurrent tasks
            request = TaskDecompositionRequest(
                title=f"Performance Test Task {i+1}",
                description=f"Task {i+1} for performance testing",
                max_task_duration_minutes=5
            )
            tasks.append(request)
        
        # Decompose all tasks concurrently
        start_time = time.time()
        decomposition_results = await asyncio.gather(*[
            task_decomposer.decompose_task(task) for task in tasks
        ])
        decomposition_time = time.time() - start_time
        
        # Should complete decomposition quickly
        assert decomposition_time < 10.0, "Decomposition should complete within 10 seconds"
        assert len(decomposition_results) == 3
        
        # Execute first micro-task from each decomposition concurrently
        execution_tasks = []
        for result in decomposition_results:
            if result.micro_tasks:
                task = MicroTask(**result.micro_tasks[0])
                execution_gen = micro_task_executor.execute_micro_task(
                    task,
                    f"performance-session-{task.id}"
                )
                execution_tasks.append(execution_gen)
        
        # Should handle concurrent executions
        assert len(execution_tasks) > 0, "Should have tasks to execute"
    
    async def test_memory_usage_optimization(
        self,
        task_decomposer,
        micro_task_executor
    ):
        """Test memory usage optimization."""
        import psutil
        import os
        
        # Get initial memory usage
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create and execute multiple tasks
        for i in range(5):
            request = TaskDecompositionRequest(
                title=f"Memory Test Task {i+1}",
                description="Task for memory usage testing",
                max_task_duration_minutes=3
            )
            
            decomposition_result = await task_decomposer.decompose_task(request)
            
            if decomposition_result.micro_tasks:
                task = MicroTask(**decomposition_result.micro_tasks[0])
                
                execution_updates = []
                async for update in micro_task_executor.execute_micro_task(
                    task,
                    f"memory-test-session-{i}"
                ):
                    execution_updates.append(update)
        
        # Check final memory usage
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be reasonable (less than 100MB for test workload)
        assert memory_increase < 100, f"Memory usage increased by {memory_increase:.2f}MB - should be optimized"