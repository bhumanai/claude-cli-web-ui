"""
Task Decomposer for Meta-Agent System v4.0

Breaks down complex tasks into tiny, verifiable micro-tasks.
Addresses Brooklyn guy's criticism about lack of tiny verifiable tasks.
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any, AsyncGenerator
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from pathlib import Path

from pydantic import BaseModel, Field, validator
import networkx as nx

from app.core.logging_config import get_logger
from app.services.redis_client import RedisClient
from app.services.meta_agent.context_engine import ContextEngine, ContextQuery

logger = get_logger(__name__)


class TaskComplexity(Enum):
    """Task complexity levels."""
    MICRO = "micro"          # < 5 minutes, single atomic action
    SMALL = "small"          # 5-15 minutes, few related actions
    MEDIUM = "medium"        # 15-60 minutes, moderate complexity
    LARGE = "large"          # 1-4 hours, significant complexity
    COMPLEX = "complex"      # > 4 hours, needs decomposition


class TaskStatus(Enum):
    """Task execution status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"


class TaskPriority(Enum):
    """Task priority levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class VerificationCriteria:
    """Criteria for verifying task completion."""
    type: str  # "file_exists", "api_response", "test_passes", "output_contains"
    parameters: Dict[str, Any]
    expected_result: Any
    timeout_seconds: int = 300


@dataclass
class MicroTask:
    """
    A micro-task that can be completed in under 10 minutes.
    
    Addresses Brooklyn guy's criticism about task granularity.
    """
    id: str
    title: str
    description: str
    agent_name: str
    command: Optional[str] = None
    parameters: Dict[str, Any] = None
    dependencies: List[str] = None  # IDs of prerequisite tasks
    verification: List[VerificationCriteria] = None
    estimated_minutes: int = 5
    complexity: TaskComplexity = TaskComplexity.MICRO
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    output: Optional[Dict[str, Any]] = None
    external_validation_url: Optional[str] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()
        if self.parameters is None:
            self.parameters = {}
        if self.dependencies is None:
            self.dependencies = []
        if self.verification is None:
            self.verification = []


class TaskDecompositionRequest(BaseModel):
    """Request to decompose a complex task."""
    title: str = Field(..., description="Title of the complex task")
    description: str = Field(..., description="Detailed description of what needs to be done")
    context: Dict[str, Any] = Field(default={}, description="Additional context and constraints")
    max_task_duration_minutes: int = Field(default=10, description="Maximum duration for micro-tasks")
    preferred_agents: List[str] = Field(default=[], description="Preferred agents to use")
    deadline: Optional[datetime] = Field(None, description="Optional deadline for completion")
    
    @validator('max_task_duration_minutes')
    def validate_max_duration(cls, v):
        if v < 1 or v > 60:
            raise ValueError("Max task duration must be between 1 and 60 minutes")
        return v


class TaskDecompositionResult(BaseModel):
    """Result of task decomposition."""
    original_task_id: str
    micro_tasks: List[Dict[str, Any]]  # Serialized MicroTask objects
    execution_graph: Dict[str, Any]    # Task dependency graph
    estimated_total_minutes: int
    critical_path_minutes: int
    validation_plan: Dict[str, Any]
    external_validation_urls: List[str]


class TaskDecomposer:
    """
    Task Decomposer for Meta-Agent System v4.0
    
    Breaks down complex tasks into tiny, verifiable micro-tasks
    that can be executed independently and validated externally.
    """
    
    def __init__(self, redis_client: RedisClient, context_engine: ContextEngine):
        self.redis_client = redis_client
        self.context_engine = context_engine
        self.agent_capabilities = {}
        self._load_agent_capabilities()
    
    async def decompose_task(
        self, 
        request: TaskDecompositionRequest
    ) -> TaskDecompositionResult:
        """
        Decompose a complex task into micro-tasks.
        
        Addresses Brooklyn guy's criticism by creating tiny, verifiable tasks.
        """
        try:
            logger.info(f"Starting task decomposition: {request.title}")
            
            # Generate unique task ID
            original_task_id = str(uuid.uuid4())
            
            # Get relevant context for task decomposition
            context_items = await self._get_decomposition_context(request)
            
            # Analyze task complexity and requirements
            task_analysis = await self._analyze_task_complexity(request, context_items)
            
            # Generate micro-tasks
            micro_tasks = await self._generate_micro_tasks(
                request, 
                task_analysis, 
                context_items
            )
            
            # Build dependency graph
            dependency_graph = self._build_dependency_graph(micro_tasks)
            
            # Calculate timing estimates
            timing_estimates = self._calculate_timing_estimates(micro_tasks, dependency_graph)
            
            # Generate validation plan
            validation_plan = await self._generate_validation_plan(micro_tasks)
            
            # Create external validation URLs
            external_urls = await self._create_external_validation_urls(micro_tasks)
            
            # Store decomposition result
            result = TaskDecompositionResult(
                original_task_id=original_task_id,
                micro_tasks=[asdict(task) for task in micro_tasks],
                execution_graph=nx.node_link_data(dependency_graph),
                estimated_total_minutes=timing_estimates["total"],
                critical_path_minutes=timing_estimates["critical_path"],
                validation_plan=validation_plan,
                external_validation_urls=external_urls
            )
            
            # Cache the result
            await self._cache_decomposition_result(original_task_id, result)
            
            logger.info(
                f"Task decomposition completed: {len(micro_tasks)} micro-tasks created",
                extra={
                    "task_id": original_task_id,
                    "micro_task_count": len(micro_tasks),
                    "estimated_minutes": timing_estimates["total"]
                }
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Task decomposition failed: {e}")
            raise
    
    async def _get_decomposition_context(
        self, 
        request: TaskDecompositionRequest
    ) -> List[Any]:
        """Get relevant context for task decomposition."""
        query_text = f"{request.title} {request.description}"
        
        query = ContextQuery(
            query_text=query_text,
            context_types=[
                "task_patterns",
                "agent_capabilities", 
                "best_practices",
                "integration_docs"
            ],
            max_results=20,
            min_similarity=0.3
        )
        
        return await self.context_engine.search_context(query)
    
    async def _analyze_task_complexity(
        self, 
        request: TaskDecompositionRequest, 
        context_items: List[Any]
    ) -> Dict[str, Any]:
        """Analyze task complexity and determine decomposition strategy."""
        # Simple heuristics for task complexity analysis
        description_length = len(request.description.split())
        context_complexity = len(request.context)
        
        # Determine complexity level
        if description_length < 20 and context_complexity < 3:
            complexity = TaskComplexity.SMALL
        elif description_length < 50 and context_complexity < 5:
            complexity = TaskComplexity.MEDIUM
        elif description_length < 100 and context_complexity < 10:
            complexity = TaskComplexity.LARGE
        else:
            complexity = TaskComplexity.COMPLEX
        
        # Identify required capabilities
        required_capabilities = self._identify_required_capabilities(
            request.description, 
            context_items
        )
        
        return {
            "complexity": complexity,
            "description_length": description_length,
            "required_capabilities": required_capabilities,
            "estimated_micro_tasks": max(3, description_length // 10),
            "decomposition_strategy": "linear" if complexity in [TaskComplexity.MICRO, TaskComplexity.SMALL] else "hierarchical"
        }
    
    def _identify_required_capabilities(
        self, 
        description: str, 
        context_items: List[Any]
    ) -> List[str]:
        """Identify required agent capabilities from task description."""
        # Simple keyword-based capability detection
        capabilities = []
        
        capability_keywords = {
            "python": ["python", "py", "script", "api", "flask", "django"],
            "frontend": ["react", "vue", "angular", "html", "css", "javascript"],
            "backend": ["api", "server", "database", "sql", "endpoint"], 
            "devops": ["deploy", "docker", "kubernetes", "aws", "cloud"],
            "security": ["auth", "secure", "encrypt", "validate", "permission"],
            "testing": ["test", "spec", "validate", "verify", "check"]
        }
        
        description_lower = description.lower()
        for capability, keywords in capability_keywords.items():
            if any(keyword in description_lower for keyword in keywords):
                capabilities.append(capability)
        
        return capabilities
    
    async def _generate_micro_tasks(
        self,
        request: TaskDecompositionRequest,
        task_analysis: Dict[str, Any],
        context_items: List[Any]
    ) -> List[MicroTask]:
        """Generate micro-tasks from complex task analysis."""
        micro_tasks = []
        
        # Generate micro-tasks based on complexity
        if task_analysis["complexity"] == TaskComplexity.MICRO:
            # Already a micro-task, just wrap it
            micro_tasks.append(self._create_single_micro_task(request))
            
        elif task_analysis["complexity"] == TaskComplexity.SMALL:
            # Split into 2-3 micro-tasks
            micro_tasks.extend(self._create_small_task_breakdown(request))
            
        else:
            # Complex task - hierarchical breakdown
            micro_tasks.extend(self._create_hierarchical_breakdown(
                request, 
                task_analysis, 
                context_items
            ))
        
        # Assign verification criteria to each micro-task
        for task in micro_tasks:
            task.verification = self._generate_verification_criteria(task)
        
        return micro_tasks
    
    def _create_single_micro_task(self, request: TaskDecompositionRequest) -> MicroTask:
        """Create a single micro-task for simple requests."""
        return MicroTask(
            id=str(uuid.uuid4()),
            title=request.title,
            description=request.description,
            agent_name=self._select_best_agent(request.description, request.preferred_agents),
            estimated_minutes=min(request.max_task_duration_minutes, 10),
            complexity=TaskComplexity.MICRO,
            priority=TaskPriority.MEDIUM
        )
    
    def _create_small_task_breakdown(self, request: TaskDecompositionRequest) -> List[MicroTask]:
        """Break down small tasks into 2-3 micro-tasks."""
        # Simple breakdown strategy for small tasks
        breakdown_patterns = {
            "setup": ["Setup and initialization", "Implementation", "Testing and validation"],
            "create": ["Design and planning", "Implementation", "Documentation"],
            "fix": ["Problem analysis", "Solution implementation", "Verification"],
            "update": ["Current state analysis", "Update implementation", "Validation"]
        }
        
        # Determine pattern based on first word
        first_word = request.description.split()[0].lower()
        pattern = breakdown_patterns.get(first_word, breakdown_patterns["create"])
        
        micro_tasks = []
        for i, phase in enumerate(pattern):
            task = MicroTask(
                id=str(uuid.uuid4()),
                title=f"{request.title} - {phase}",
                description=f"{phase}: {request.description}",
                agent_name=self._select_best_agent(request.description, request.preferred_agents),
                estimated_minutes=min(request.max_task_duration_minutes, 8),
                complexity=TaskComplexity.MICRO,
                priority=TaskPriority.HIGH if i == 0 else TaskPriority.MEDIUM,
                dependencies=[micro_tasks[i-1].id] if i > 0 else []
            )
            micro_tasks.append(task)
        
        return micro_tasks
    
    def _create_hierarchical_breakdown(
        self,
        request: TaskDecompositionRequest,
        task_analysis: Dict[str, Any],
        context_items: List[Any]
    ) -> List[MicroTask]:
        """Create hierarchical breakdown for complex tasks."""
        micro_tasks = []
        
        # Standard phases for complex tasks
        phases = [
            ("Analysis", "Analyze requirements and create detailed plan", 8),
            ("Setup", "Setup development environment and dependencies", 6),
            ("Implementation", "Core implementation work", 10),
            ("Testing", "Comprehensive testing and validation", 7),
            ("Documentation", "Create documentation and examples", 5),
            ("Integration", "Integration with existing systems", 8),
            ("Validation", "External validation and verification", 6)
        ]
        
        for i, (phase_name, phase_desc, duration) in enumerate(phases):
            # Skip phases not relevant to the specific task
            if not self._is_phase_relevant(phase_name, request.description, task_analysis):
                continue
            
            task = MicroTask(
                id=str(uuid.uuid4()),
                title=f"{request.title} - {phase_name}",
                description=f"{phase_desc} for: {request.description}",
                agent_name=self._select_agent_for_phase(phase_name, request.preferred_agents),
                estimated_minutes=min(duration, request.max_task_duration_minutes),
                complexity=TaskComplexity.MICRO,
                priority=TaskPriority.HIGH if phase_name == "Analysis" else TaskPriority.MEDIUM,
                dependencies=[micro_tasks[-1].id] if micro_tasks else []
            )
            micro_tasks.append(task)
        
        return micro_tasks
    
    def _is_phase_relevant(
        self, 
        phase_name: str, 
        description: str, 
        task_analysis: Dict[str, Any]
    ) -> bool:
        """Determine if a phase is relevant for the task."""
        phase_keywords = {
            "Analysis": ["complex", "design", "architecture"],
            "Setup": ["new", "create", "build", "develop"],
            "Implementation": True,  # Always relevant
            "Testing": ["test", "validate", "verify", "quality"],
            "Documentation": ["document", "guide", "manual", "readme"],
            "Integration": ["integrate", "connect", "api", "service"],
            "Validation": ["validate", "verify", "check", "audit"]
        }
        
        keywords = phase_keywords.get(phase_name, [])
        if keywords is True:
            return True
        
        description_lower = description.lower()
        return any(keyword in description_lower for keyword in keywords)
    
    def _select_best_agent(self, description: str, preferred_agents: List[str]) -> str:
        """Select the best agent for a task based on description and preferences."""
        if preferred_agents:
            return preferred_agents[0]  # Use first preferred agent
        
        # Simple agent selection based on keywords
        agent_keywords = {
            "python-pro": ["python", "api", "backend", "script"],
            "frontend-developer": ["react", "vue", "html", "css", "ui"],
            "security-auditor": ["security", "auth", "validate", "encrypt"],
            "test-automator": ["test", "spec", "verify", "qa"],
            "devops-troubleshooter": ["deploy", "docker", "aws", "cloud"],
            "backend-architect": ["architecture", "design", "system"]
        }
        
        description_lower = description.lower()
        for agent, keywords in agent_keywords.items():
            if any(keyword in description_lower for keyword in keywords):
                return agent
        
        return "workflow-coordinator"  # Default fallback
    
    def _select_agent_for_phase(self, phase_name: str, preferred_agents: List[str]) -> str:
        """Select appropriate agent for specific phase."""
        phase_agents = {
            "Analysis": "backend-architect",
            "Setup": "devops-troubleshooter", 
            "Implementation": preferred_agents[0] if preferred_agents else "python-pro",
            "Testing": "test-automator",
            "Documentation": "project-doc-manager",
            "Integration": "workflow-coordinator",
            "Validation": "security-auditor"
        }
        
        return phase_agents.get(phase_name, "workflow-coordinator")
    
    def _generate_verification_criteria(self, task: MicroTask) -> List[VerificationCriteria]:
        """Generate verification criteria for a micro-task."""
        criteria = []
        
        # Generate criteria based on task type and agent
        if "test" in task.title.lower() or task.agent_name == "test-automator":
            criteria.append(VerificationCriteria(
                type="test_passes",
                parameters={"test_command": "pytest", "min_coverage": 80},
                expected_result=True,
                timeout_seconds=300
            ))
        
        if "api" in task.description.lower():
            criteria.append(VerificationCriteria(
                type="api_response",
                parameters={"endpoint": "/health", "method": "GET"},
                expected_result={"status": "ok"},
                timeout_seconds=30
            ))
        
        if "file" in task.description.lower() or "create" in task.description.lower():
            criteria.append(VerificationCriteria(
                type="file_exists",
                parameters={"path": "output.txt"},  # This would be task-specific
                expected_result=True,
                timeout_seconds=10
            ))
        
        # Always add output verification
        criteria.append(VerificationCriteria(
            type="output_contains",
            parameters={"keywords": ["completed", "success", "done"]},
            expected_result=True,
            timeout_seconds=10
        ))
        
        return criteria
    
    def _build_dependency_graph(self, micro_tasks: List[MicroTask]) -> nx.DiGraph:
        """Build dependency graph for micro-tasks."""
        graph = nx.DiGraph()
        
        # Add nodes
        for task in micro_tasks:
            graph.add_node(task.id, task=task)
        
        # Add edges for dependencies
        for task in micro_tasks:
            for dependency_id in task.dependencies:
                if graph.has_node(dependency_id):
                    graph.add_edge(dependency_id, task.id)
        
        return graph
    
    def _calculate_timing_estimates(
        self, 
        micro_tasks: List[MicroTask], 
        dependency_graph: nx.DiGraph
    ) -> Dict[str, int]:
        """Calculate timing estimates including critical path."""
        total_minutes = sum(task.estimated_minutes for task in micro_tasks)
        
        # Calculate critical path
        try:
            # Add weights to edges for critical path calculation
            for u, v in dependency_graph.edges():
                task = next(t for t in micro_tasks if t.id == v)
                dependency_graph[u][v]['weight'] = task.estimated_minutes
            
            critical_path = nx.dag_longest_path(dependency_graph, weight='weight')
            critical_path_minutes = nx.dag_longest_path_length(dependency_graph, weight='weight')
        except:
            # Fallback if graph has cycles or other issues
            critical_path_minutes = total_minutes
        
        return {
            "total": total_minutes,
            "critical_path": critical_path_minutes,
            "parallelizable": total_minutes - critical_path_minutes
        }
    
    async def _generate_validation_plan(self, micro_tasks: List[MicroTask]) -> Dict[str, Any]:
        """Generate comprehensive validation plan for micro-tasks."""
        return {
            "total_verification_criteria": sum(len(task.verification) for task in micro_tasks),
            "external_validation_required": True,
            "validation_phases": [
                {"phase": "individual_task_validation", "tasks": len(micro_tasks)},
                {"phase": "integration_validation", "tasks": 1},
                {"phase": "end_to_end_validation", "tasks": 1}
            ],
            "estimated_validation_minutes": len(micro_tasks) * 2  # 2 minutes per task
        }
    
    async def _create_external_validation_urls(self, micro_tasks: List[MicroTask]) -> List[str]:
        """Create external validation URLs for micro-tasks."""
        # Generate external validation URLs for each micro-task
        # This addresses Brooklyn guy's criticism about external validation
        urls = []
        
        for task in micro_tasks:
            # Generate a validation URL (in real implementation, this would be actual URLs)
            validation_url = f"https://validation.meta-agent.com/validate/{task.id}"
            task.external_validation_url = validation_url
            urls.append(validation_url)
        
        return urls
    
    async def _cache_decomposition_result(
        self, 
        task_id: str, 
        result: TaskDecompositionResult
    ):
        """Cache decomposition result in Redis."""
        await self.redis_client.set(
            f"task_decomposition:{task_id}",
            result.json(),
            expire=86400  # Cache for 24 hours
        )
    
    def _load_agent_capabilities(self):
        """Load agent capabilities from agent definitions."""
        # This would load from the actual agent files
        # For now, using basic capability mapping
        self.agent_capabilities = {
            "python-pro": ["python", "api", "backend", "testing"],
            "frontend-developer": ["react", "vue", "html", "css", "javascript"],
            "security-auditor": ["security", "auth", "validation", "audit"],
            "test-automator": ["testing", "qa", "verification"],
            "devops-troubleshooter": ["deployment", "docker", "cloud", "infrastructure"],
            "backend-architect": ["architecture", "design", "scalability", "performance"]
        }
    
    async def get_decomposition_result(self, task_id: str) -> Optional[TaskDecompositionResult]:
        """Retrieve cached decomposition result."""
        cached_result = await self.redis_client.get(f"task_decomposition:{task_id}")
        if cached_result:
            return TaskDecompositionResult.parse_raw(cached_result)
        return None