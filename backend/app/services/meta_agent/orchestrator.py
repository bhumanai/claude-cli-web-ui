"""
Meta-Agent System v4.0 Orchestrator

Final integration and orchestration layer for the complete Meta-Agent System.
Coordinates all components: Context Engine, Task Decomposer, Micro-Task Executor, 
and Validation Engine into a unified system.
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, AsyncGenerator, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import logging

from pydantic import BaseModel, Field

from app.core.logging_config import get_logger
from app.services.redis_client import RedisClient
from app.services.command_executor import CommandExecutor
from app.services.meta_agent.context_engine import ContextEngine, DocumentationLibrary
from app.services.meta_agent.task_decomposer import (
    TaskDecomposer, 
    TaskDecompositionRequest,
    TaskDecompositionResult,
    MicroTask
)
from app.services.meta_agent.micro_task_executor import (
    MicroTaskExecutor,
    MicroTaskExecutionResult,
    ExecutionMode
)
from app.services.meta_agent.validation_engine import (
    ValidationEngine,
    ValidationLevel,
    ValidationReport
)

logger = get_logger(__name__)


class WorkflowStatus(Enum):
    """Workflow execution status."""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class WorkflowStage(Enum):
    """Stages of Meta-Agent workflow."""
    INITIALIZATION = "initialization"
    CONTEXT_GATHERING = "context_gathering"
    TASK_DECOMPOSITION = "task_decomposition"
    TASK_EXECUTION = "task_execution"
    VALIDATION = "validation"
    FINALIZATION = "finalization"


@dataclass
class WorkflowResult:
    """Complete workflow execution result."""
    workflow_id: str
    original_request: Dict[str, Any]
    decomposition_result: TaskDecompositionResult
    execution_results: List[MicroTaskExecutionResult]
    validation_reports: List[ValidationReport]
    overall_status: WorkflowStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_duration_seconds: Optional[float] = None
    brooklyn_compliance_score: float = 0.0
    external_validation_proofs: List[str] = None
    recommendations: List[str] = None
    
    def __post_init__(self):
        if self.external_validation_proofs is None:
            self.external_validation_proofs = []
        if self.recommendations is None:
            self.recommendations = []


class MetaAgentRequest(BaseModel):
    """Request to the Meta-Agent System."""
    title: str = Field(..., description="Title of the task to be completed")
    description: str = Field(..., description="Detailed description of what needs to be done")
    context: Dict[str, Any] = Field(default={}, description="Additional context and constraints")
    max_task_duration_minutes: int = Field(default=10, description="Maximum duration for micro-tasks")
    preferred_agents: List[str] = Field(default=[], description="Preferred agents to use")
    validation_level: ValidationLevel = Field(default=ValidationLevel.COMPREHENSIVE, description="Level of validation required")
    require_external_validation: bool = Field(default=True, description="Require external validation")
    execution_mode: ExecutionMode = Field(default=ExecutionMode.SANDBOX, description="Execution environment mode")
    user_id: Optional[str] = Field(None, description="User ID for tracking")
    session_id: Optional[str] = Field(None, description="Session ID for execution")


class MetaAgentOrchestrator:
    """
    Meta-Agent System v4.0 Orchestrator
    
    Coordinates all components into a unified system that addresses
    Brooklyn guy's criticisms through tiny verifiable tasks, real
    documentation, and external validation.
    """
    
    def __init__(
        self,
        redis_client: RedisClient,
        command_executor: CommandExecutor
    ):
        self.redis_client = redis_client
        self.command_executor = command_executor
        
        # Initialize all components
        self.context_engine = ContextEngine(redis_client)
        self.documentation_library = DocumentationLibrary(self.context_engine)
        self.task_decomposer = TaskDecomposer(redis_client, self.context_engine)
        self.micro_task_executor = MicroTaskExecutor(
            redis_client, 
            command_executor,
            ExecutionMode.SANDBOX
        )
        self.validation_engine = ValidationEngine(redis_client)
        
        # Workflow tracking
        self.active_workflows: Dict[str, Dict[str, Any]] = {}
    
    async def initialize(self):
        """Initialize all Meta-Agent System components."""
        try:
            logger.info("Initializing Meta-Agent System v4.0")
            
            # Initialize context engine
            await self.context_engine.initialize()
            
            # Load default documentation
            await self._load_system_documentation()
            
            logger.info("Meta-Agent System v4.0 initialization completed")
            
        except Exception as e:
            logger.error(f"Meta-Agent System initialization failed: {e}")
            raise
    
    async def execute_workflow(
        self, 
        request: MetaAgentRequest
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute complete Meta-Agent workflow with real-time progress updates.
        
        Addresses Brooklyn guy's criticisms through comprehensive workflow.
        """
        workflow_id = str(uuid.uuid4())
        
        try:
            logger.info(f"Starting Meta-Agent workflow: {workflow_id}")
            
            # Initialize workflow tracking
            workflow_state = {
                "workflow_id": workflow_id,
                "status": WorkflowStatus.RUNNING,
                "stage": WorkflowStage.INITIALIZATION,
                "started_at": datetime.utcnow(),
                "request": request.dict(),
                "progress": {
                    "stages_completed": 0,
                    "total_stages": 6,
                    "current_stage": "initialization"
                }
            }
            
            self.active_workflows[workflow_id] = workflow_state
            
            # Yield initial progress
            yield self._create_progress_update(workflow_state, "Workflow initialized")
            
            # Stage 1: Context Gathering
            workflow_state["stage"] = WorkflowStage.CONTEXT_GATHERING
            yield self._create_progress_update(workflow_state, "Gathering context and documentation")
            
            context_items = await self._gather_context(request)
            
            # Stage 2: Task Decomposition
            workflow_state["stage"] = WorkflowStage.TASK_DECOMPOSITION
            workflow_state["progress"]["stages_completed"] = 1
            yield self._create_progress_update(workflow_state, "Decomposing task into micro-tasks")
            
            decomposition_request = TaskDecompositionRequest(
                title=request.title,
                description=request.description,
                context=request.context,
                max_task_duration_minutes=request.max_task_duration_minutes,
                preferred_agents=request.preferred_agents
            )
            
            decomposition_result = await self.task_decomposer.decompose_task(decomposition_request)
            
            yield self._create_progress_update(
                workflow_state, 
                f"Created {len(decomposition_result.micro_tasks)} micro-tasks"
            )
            
            # Stage 3: Task Execution
            workflow_state["stage"] = WorkflowStage.TASK_EXECUTION
            workflow_state["progress"]["stages_completed"] = 2
            
            execution_results = []
            
            for i, task_dict in enumerate(decomposition_result.micro_tasks):
                task = MicroTask(**task_dict)
                
                yield self._create_progress_update(
                    workflow_state,
                    f"Executing micro-task {i+1}/{len(decomposition_result.micro_tasks)}: {task.title}"
                )
                
                # Execute micro-task with progress updates
                async for execution_update in self.micro_task_executor.execute_micro_task(
                    task, 
                    request.session_id or f"workflow_{workflow_id}",
                    timeout_seconds=task.estimated_minutes * 60 + 60
                ):
                    # Forward execution progress
                    yield {
                        "type": "execution_progress",
                        "workflow_id": workflow_id,
                        "stage": "task_execution",
                        "task_id": task.id,
                        "task_progress": execution_update,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                
                # Get final execution result
                if execution_update["type"] == "completed":
                    execution_result = MicroTaskExecutionResult(**execution_update["result"])
                    execution_results.append(execution_result)
                else:
                    # Handle execution failure
                    yield self._create_error_update(
                        workflow_state,
                        f"Micro-task {task.title} failed: {execution_update.get('message', 'Unknown error')}"
                    )
            
            # Stage 4: Validation
            workflow_state["stage"] = WorkflowStage.VALIDATION
            workflow_state["progress"]["stages_completed"] = 3
            yield self._create_progress_update(workflow_state, "Validating execution results")
            
            validation_reports = []
            
            for i, execution_result in enumerate(execution_results):
                task = MicroTask(**decomposition_result.micro_tasks[i])
                
                yield self._create_progress_update(
                    workflow_state,
                    f"Validating task {i+1}/{len(execution_results)}: {task.title}"
                )
                
                validation_report = await self.validation_engine.validate_micro_task(
                    task,
                    execution_result,
                    request.validation_level
                )
                
                validation_reports.append(validation_report)
            
            # Stage 5: Finalization
            workflow_state["stage"] = WorkflowStage.FINALIZATION
            workflow_state["progress"]["stages_completed"] = 4
            yield self._create_progress_update(workflow_state, "Finalizing workflow and generating reports")
            
            # Calculate Brooklyn compliance score
            brooklyn_score = await self._calculate_brooklyn_compliance(
                decomposition_result,
                execution_results,
                validation_reports
            )
            
            # Generate external validation proofs
            external_proofs = []
            for validation_report in validation_reports:
                if validation_report.validation_proof:
                    external_proofs.append(validation_report.validation_proof)
            
            # Generate recommendations
            recommendations = await self._generate_workflow_recommendations(
                decomposition_result,
                execution_results,
                validation_reports,
                brooklyn_score
            )
            
            # Create final workflow result
            workflow_result = WorkflowResult(
                workflow_id=workflow_id,
                original_request=request.dict(),
                decomposition_result=decomposition_result,
                execution_results=execution_results,
                validation_reports=validation_reports,
                overall_status=WorkflowStatus.COMPLETED,
                started_at=workflow_state["started_at"],
                completed_at=datetime.utcnow(),
                total_duration_seconds=(datetime.utcnow() - workflow_state["started_at"]).total_seconds(),
                brooklyn_compliance_score=brooklyn_score,
                external_validation_proofs=external_proofs,
                recommendations=recommendations
            )
            
            # Cache final result
            await self._cache_workflow_result(workflow_id, workflow_result)
            
            # Final progress update
            workflow_state["status"] = WorkflowStatus.COMPLETED
            workflow_state["progress"]["stages_completed"] = 6
            
            yield {
                "type": "completed",
                "workflow_id": workflow_id,
                "status": "completed",
                "result": asdict(workflow_result),
                "brooklyn_compliance_score": brooklyn_score,
                "total_duration": workflow_result.total_duration_seconds,
                "recommendations": recommendations,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Workflow {workflow_id} failed: {e}")
            
            # Update workflow state
            if workflow_id in self.active_workflows:
                self.active_workflows[workflow_id]["status"] = WorkflowStatus.FAILED
            
            yield {
                "type": "error",
                "workflow_id": workflow_id,
                "status": "failed",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        
        finally:
            # Cleanup workflow tracking
            if workflow_id in self.active_workflows:
                del self.active_workflows[workflow_id]
    
    async def _gather_context(self, request: MetaAgentRequest) -> List[Any]:
        """Gather relevant context for the workflow."""
        # Search for relevant context
        from app.services.meta_agent.context_engine import ContextQuery
        
        query = ContextQuery(
            query_text=f"{request.title} {request.description}",
            context_types=[
                "task_patterns",
                "agent_capabilities",
                "best_practices",
                "security_guidelines"
            ],
            max_results=15,
            min_similarity=0.3
        )
        
        context_items = await self.context_engine.search_context(query)
        
        # Add agent-specific context if preferred agents specified
        for agent_name in request.preferred_agents:
            agent_context = await self.context_engine.get_context_for_agent(
                agent_name, 
                request.description
            )
            context_items.extend(agent_context)
        
        return context_items
    
    async def _calculate_brooklyn_compliance(
        self,
        decomposition_result: TaskDecompositionResult,
        execution_results: List[MicroTaskExecutionResult],
        validation_reports: List[ValidationReport]
    ) -> float:
        """Calculate Brooklyn guy compliance score."""
        score = 100.0
        
        # Check tiny verifiable tasks (25 points)
        tasks_compliant = True
        for task_dict in decomposition_result.micro_tasks:
            task = MicroTask(**task_dict)
            if task.estimated_minutes > 10 or len(task.verification) == 0:
                tasks_compliant = False
                break
        
        if not tasks_compliant:
            score -= 25
        
        # Check external validation (25 points)
        external_validation_present = all(
            len(result.external_validations) > 0 
            for result in execution_results
        )
        
        if not external_validation_present:
            score -= 25
        
        # Check verification proofs (25 points)
        proofs_present = all(
            result.verification_proof is not None 
            for result in execution_results
        )
        
        if not proofs_present:
            score -= 25
        
        # Check comprehensive validation (25 points)
        validation_quality = sum(
            1 for report in validation_reports 
            if report.total_tests >= 5 and 
               len(report.categories_tested) >= 3 and
               report.security_score >= 70
        ) / max(len(validation_reports), 1)
        
        score -= (1 - validation_quality) * 25
        
        return max(0.0, score)
    
    async def _generate_workflow_recommendations(
        self,
        decomposition_result: TaskDecompositionResult,
        execution_results: List[MicroTaskExecutionResult],
        validation_reports: List[ValidationReport],
        brooklyn_score: float
    ) -> List[str]:
        """Generate workflow recommendations."""
        recommendations = []
        
        # Brooklyn compliance recommendations
        if brooklyn_score < 90:
            recommendations.append("Improve Brooklyn guy compliance by ensuring all tasks are tiny (< 10 min) and verifiable")
        
        # Execution performance recommendations
        slow_tasks = [
            result for result in execution_results
            if (result.execution_time_seconds or 0) > 600  # > 10 minutes
        ]
        
        if slow_tasks:
            recommendations.append(f"{len(slow_tasks)} tasks took longer than 10 minutes - consider further decomposition")
        
        # Validation recommendations
        low_security_reports = [
            report for report in validation_reports
            if report.security_score < 80
        ]
        
        if low_security_reports:
            recommendations.append(f"{len(low_security_reports)} tasks have security scores < 80 - review security measures")
        
        # External validation recommendations
        failed_external_validations = 0
        for result in execution_results:
            failed_external_validations += sum(
                1 for validation in result.external_validations
                if validation.get("status") != "success"
            )
        
        if failed_external_validations > 0:
            recommendations.append(f"{failed_external_validations} external validations failed - review task quality")
        
        # Add positive recommendations
        if brooklyn_score >= 95:
            recommendations.append("Excellent Brooklyn guy compliance - all criticisms addressed")
        
        if all(len(result.validation_results) > 0 for result in execution_results):
            recommendations.append("All tasks have comprehensive validation - excellent quality assurance")
        
        return recommendations
    
    def _create_progress_update(self, workflow_state: Dict[str, Any], message: str) -> Dict[str, Any]:
        """Create standardized progress update."""
        progress = workflow_state["progress"]
        return {
            "type": "progress",
            "workflow_id": workflow_state["workflow_id"],
            "stage": workflow_state["stage"].value,
            "message": message,
            "progress": {
                "stages_completed": progress["stages_completed"],
                "total_stages": progress["total_stages"],
                "percentage": (progress["stages_completed"] / progress["total_stages"]) * 100
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def _create_error_update(self, workflow_state: Dict[str, Any], error_message: str) -> Dict[str, Any]:
        """Create standardized error update."""
        return {
            "type": "error",
            "workflow_id": workflow_state["workflow_id"],
            "stage": workflow_state["stage"].value,
            "error": error_message,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def _cache_workflow_result(self, workflow_id: str, result: WorkflowResult):
        """Cache workflow result in Redis."""
        await self.redis_client.set(
            f"workflow_result:{workflow_id}",
            json.dumps(asdict(result), default=str),
            expire=86400  # Cache for 24 hours
        )
    
    async def _load_system_documentation(self):
        """Load default system documentation."""
        system_docs = [
            {
                "doc_type": "api_specs",
                "title": "Meta-Agent System API",
                "content": "POST /api/v1/meta-agent/workflow - Execute complete Meta-Agent workflow with task decomposition, execution, and validation",
                "metadata": {"version": "4.0", "component": "orchestrator"}
            },
            {
                "doc_type": "best_practices", 
                "title": "Micro-Task Best Practices",
                "content": "All micro-tasks should be under 10 minutes, have clear verification criteria, and include external validation URLs",
                "metadata": {"addresses": "brooklyn_guy_criticism"}
            },
            {
                "doc_type": "security_docs",
                "title": "Security Guidelines",
                "content": "All task execution happens in sandboxed environments with resource limits and command sanitization",
                "metadata": {"security_level": "high"}
            }
        ]
        
        for doc in system_docs:
            await self.documentation_library.add_documentation(**doc)
    
    async def get_workflow_status(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get current status of a workflow."""
        if workflow_id in self.active_workflows:
            return self.active_workflows[workflow_id]
        
        # Check cached results
        cached_result = await self.redis_client.get(f"workflow_result:{workflow_id}")
        if cached_result:
            return json.loads(cached_result)
        
        return None
    
    async def cancel_workflow(self, workflow_id: str) -> bool:
        """Cancel an active workflow."""
        if workflow_id in self.active_workflows:
            self.active_workflows[workflow_id]["status"] = WorkflowStatus.CANCELLED
            
            # Cancel any active micro-task executions
            # This would need integration with the micro-task executor's cancel functionality
            
            return True
        
        return False
    
    def get_active_workflows(self) -> List[str]:
        """Get list of currently active workflow IDs."""
        return list(self.active_workflows.keys())