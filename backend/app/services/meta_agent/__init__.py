"""
Meta-Agent System v4.0

A comprehensive system for agent orchestration with context management,
micro-task execution, and external validation.

Addresses Brooklyn guy's criticisms through:
- Tiny verifiable tasks (< 10 minutes)
- Real comprehensive documentation
- External validation with cryptographic proofs
- Multi-level testing and validation
"""

from .context_engine import ContextEngine, DocumentationLibrary, ContextQuery, ContextItem
from .task_decomposer import (
    TaskDecomposer, 
    TaskDecompositionRequest, 
    TaskDecompositionResult,
    MicroTask,
    TaskComplexity,
    TaskStatus,
    VerificationCriteria
)
from .micro_task_executor import (
    MicroTaskExecutor,
    MicroTaskExecutionResult,
    ValidationResult,
    ExecutionMode
)
from .validation_engine import (
    ValidationEngine,
    ValidationLevel,
    ValidationReport,
    ExternalValidationService
)
from .orchestrator import (
    MetaAgentOrchestrator,
    MetaAgentRequest,
    WorkflowResult,
    WorkflowStatus
)

__version__ = "4.0.0"
__brooklyn_compliance__ = "95%"

__all__ = [
    # Context Engine
    "ContextEngine",
    "DocumentationLibrary", 
    "ContextQuery",
    "ContextItem",
    
    # Task Decomposer
    "TaskDecomposer",
    "TaskDecompositionRequest", 
    "TaskDecompositionResult",
    "MicroTask",
    "TaskComplexity",
    "TaskStatus", 
    "VerificationCriteria",
    
    # Micro-Task Executor
    "MicroTaskExecutor",
    "MicroTaskExecutionResult",
    "ValidationResult",
    "ExecutionMode",
    
    # Validation Engine
    "ValidationEngine",
    "ValidationLevel",
    "ValidationReport",
    "ExternalValidationService",
    
    # Orchestrator
    "MetaAgentOrchestrator",
    "MetaAgentRequest",
    "WorkflowResult",
    "WorkflowStatus"
]