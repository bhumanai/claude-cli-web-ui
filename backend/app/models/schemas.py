"""Pydantic schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field, validator


class CommandStatus(str, Enum):
    """Command execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OutputType(str, Enum):
    """Output message type."""
    STDOUT = "stdout"
    STDERR = "stderr"
    SYSTEM = "system"
    ERROR = "error"


class CommandRequest(BaseModel):
    """Request schema for command execution."""
    command: str = Field(..., description="Command to execute", min_length=1)
    session_id: Optional[str] = Field(None, description="Session ID")
    timeout: Optional[int] = Field(None, description="Command timeout in seconds", ge=1, le=3600)


class OutputMessage(BaseModel):
    """Output message from command execution."""
    type: OutputType = Field(..., description="Type of output message")
    content: str = Field(..., description="Content of the message")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")


class CommandResponse(BaseModel):
    """Response schema for command execution."""
    command_id: str = Field(..., description="Unique command identifier")
    session_id: str = Field(..., description="Session identifier")
    command: str = Field(..., description="Original command")
    status: CommandStatus = Field(..., description="Command execution status")
    output: List[OutputMessage] = Field(default=[], description="Command output messages")
    exit_code: Optional[int] = Field(None, description="Process exit code")
    started_at: datetime = Field(default_factory=datetime.utcnow, description="Command start time")
    completed_at: Optional[datetime] = Field(None, description="Command completion time")
    error: Optional[str] = Field(None, description="Error message if command failed")


class SessionInfo(BaseModel):
    """Session information schema."""
    session_id: str = Field(..., description="Unique session identifier")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Session creation time")
    last_activity: datetime = Field(default_factory=datetime.utcnow, description="Last activity time")
    command_count: int = Field(default=0, description="Number of commands executed", ge=0)
    is_active: bool = Field(default=True, description="Whether session is active")


class SessionList(BaseModel):
    """List of sessions response."""
    sessions: List[SessionInfo] = Field(..., description="List of sessions")
    total: int = Field(..., description="Total number of sessions", ge=0)


class CommandHistory(BaseModel):
    """Command history for a session."""
    session_id: str = Field(..., description="Session identifier")
    commands: List[CommandResponse] = Field(..., description="List of commands in chronological order")
    total: int = Field(..., description="Total number of commands", ge=0)


class HealthCheck(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Application version")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Check timestamp")
    uptime: float = Field(..., description="Uptime in seconds", ge=0)


class ErrorResponse(BaseModel):
    """Error response schema."""
    error: str = Field(..., description="Error message")
    code: str = Field(..., description="Error code")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Error timestamp")


class WebSocketMessage(BaseModel):
    """WebSocket message schema."""
    type: str = Field(..., description="Message type")
    command_id: Optional[str] = Field(None, description="Associated command ID")
    session_id: Optional[str] = Field(None, description="Associated session ID")
    data: Union[Dict[str, Any], str, OutputMessage] = Field(..., description="Message data")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")


class CommandSuggestion(BaseModel):
    """Command auto-completion suggestion."""
    command: str = Field(..., description="Suggested command")
    description: Optional[str] = Field(None, description="Command description")
    category: Optional[str] = Field(None, description="Command category")


class ServerStats(BaseModel):
    """Server statistics."""
    active_sessions: int = Field(..., description="Number of active sessions", ge=0)
    total_commands: int = Field(..., description="Total commands executed", ge=0)
    uptime: float = Field(..., description="Server uptime in seconds", ge=0)
    memory_usage: float = Field(..., description="Memory usage in MB", ge=0)
    cpu_usage: float = Field(..., description="CPU usage percentage", ge=0, le=100)


# Task Management Schemas

class ProjectStatus(str, Enum):
    """Project status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"  
    ARCHIVED = "archived"


class TaskQueueStatus(str, Enum):
    """Task queue status enumeration."""
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"


class TaskStatus(str, Enum):
    """Task status enumeration."""
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class TaskPriority(str, Enum):
    """Task priority enumeration."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ExecutionStatus(str, Enum):
    """Execution status enumeration."""
    STARTING = "starting"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


# Project Schemas

class ProjectCreateRequest(BaseModel):
    """Request schema for creating a project."""
    name: str = Field(..., description="Project name", min_length=1, max_length=255)
    description: Optional[str] = Field(None, description="Project description")
    config: Optional[Dict[str, Any]] = Field(None, description="Project configuration")
    tags: Optional[List[str]] = Field(None, description="Project tags")


class ProjectUpdateRequest(BaseModel):
    """Request schema for updating a project."""
    name: Optional[str] = Field(None, description="Project name", min_length=1, max_length=255)
    description: Optional[str] = Field(None, description="Project description")
    status: Optional[ProjectStatus] = Field(None, description="Project status")
    config: Optional[Dict[str, Any]] = Field(None, description="Project configuration")
    tags: Optional[List[str]] = Field(None, description="Project tags")


class ProjectResponse(BaseModel):
    """Response schema for project data."""
    id: str = Field(..., description="Project ID")
    name: str = Field(..., description="Project name")
    description: Optional[str] = Field(None, description="Project description")
    status: ProjectStatus = Field(..., description="Project status")
    config: Optional[Dict[str, Any]] = Field(None, description="Project configuration")
    tags: Optional[List[str]] = Field(None, description="Project tags")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    archived_at: Optional[datetime] = Field(None, description="Archive timestamp")


class ProjectListResponse(BaseModel):
    """Response schema for project list."""
    projects: List[ProjectResponse] = Field(..., description="List of projects")
    total: int = Field(..., description="Total number of projects", ge=0)


class ProjectStatsResponse(BaseModel):
    """Response schema for project statistics."""
    project_id: str = Field(..., description="Project ID")
    name: str = Field(..., description="Project name")
    status: ProjectStatus = Field(..., description="Project status")
    total_tasks: int = Field(..., description="Total number of tasks", ge=0)
    total_queues: int = Field(..., description="Total number of queues", ge=0)
    task_stats: Dict[str, int] = Field(..., description="Task counts by status")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    archived_at: Optional[datetime] = Field(None, description="Archive timestamp")


# Task Queue Schemas

class TaskQueueCreateRequest(BaseModel):
    """Request schema for creating a task queue."""
    project_id: str = Field(..., description="Project ID")
    name: str = Field(..., description="Queue name", min_length=1, max_length=255)
    description: Optional[str] = Field(None, description="Queue description")
    max_concurrent_tasks: int = Field(1, description="Maximum concurrent tasks", ge=1)
    retry_attempts: int = Field(3, description="Number of retry attempts", ge=0)
    retry_delay: int = Field(60, description="Retry delay in seconds", ge=0)
    timeout: Optional[int] = Field(None, description="Task timeout in seconds", ge=1)
    config: Optional[Dict[str, Any]] = Field(None, description="Queue configuration")


class TaskQueueUpdateRequest(BaseModel):
    """Request schema for updating a task queue."""
    name: Optional[str] = Field(None, description="Queue name", min_length=1, max_length=255)
    description: Optional[str] = Field(None, description="Queue description")
    status: Optional[TaskQueueStatus] = Field(None, description="Queue status")
    max_concurrent_tasks: Optional[int] = Field(None, description="Maximum concurrent tasks", ge=1)
    retry_attempts: Optional[int] = Field(None, description="Number of retry attempts", ge=0)
    retry_delay: Optional[int] = Field(None, description="Retry delay in seconds", ge=0)
    timeout: Optional[int] = Field(None, description="Task timeout in seconds", ge=1)
    config: Optional[Dict[str, Any]] = Field(None, description="Queue configuration")


class TaskQueueResponse(BaseModel):
    """Response schema for task queue data."""
    id: str = Field(..., description="Queue ID")
    project_id: str = Field(..., description="Project ID")
    name: str = Field(..., description="Queue name")
    description: Optional[str] = Field(None, description="Queue description")
    status: TaskQueueStatus = Field(..., description="Queue status")
    max_concurrent_tasks: int = Field(..., description="Maximum concurrent tasks")
    retry_attempts: int = Field(..., description="Number of retry attempts")
    retry_delay: int = Field(..., description="Retry delay in seconds")
    timeout: Optional[int] = Field(None, description="Task timeout in seconds")
    redis_stream_key: Optional[str] = Field(None, description="Redis stream key")
    consumer_group: Optional[str] = Field(None, description="Consumer group name")
    config: Optional[Dict[str, Any]] = Field(None, description="Queue configuration")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    last_processed_at: Optional[datetime] = Field(None, description="Last processed timestamp")


class TaskQueueListResponse(BaseModel):
    """Response schema for task queue list."""
    queues: List[TaskQueueResponse] = Field(..., description="List of task queues")
    total: int = Field(..., description="Total number of queues", ge=0)


class TaskQueueStatsResponse(BaseModel):
    """Response schema for task queue statistics."""
    queue_id: str = Field(..., description="Queue ID")
    name: str = Field(..., description="Queue name")
    status: TaskQueueStatus = Field(..., description="Queue status")
    total_tasks: int = Field(..., description="Total number of tasks", ge=0)
    max_concurrent_tasks: int = Field(..., description="Maximum concurrent tasks")
    retry_attempts: int = Field(..., description="Number of retry attempts")
    retry_delay: int = Field(..., description="Retry delay in seconds")
    timeout: Optional[int] = Field(None, description="Task timeout in seconds")
    last_processed_at: Optional[datetime] = Field(None, description="Last processed timestamp")
    redis_stats: Dict[str, Any] = Field(..., description="Redis stream statistics")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


# Task Schemas

class TaskCreateRequest(BaseModel):
    """Request schema for creating a task."""
    project_id: str = Field(..., description="Project ID")
    task_queue_id: str = Field(..., description="Task queue ID")
    name: str = Field(..., description="Task name", min_length=1, max_length=255)
    command: str = Field(..., description="Command to execute", min_length=1)
    description: Optional[str] = Field(None, description="Task description")
    priority: TaskPriority = Field(TaskPriority.MEDIUM, description="Task priority")
    scheduled_at: Optional[datetime] = Field(None, description="When to schedule the task")
    timeout: Optional[int] = Field(None, description="Task timeout in seconds", ge=1)
    max_retries: int = Field(3, description="Maximum retry attempts", ge=0)
    input_data: Optional[Dict[str, Any]] = Field(None, description="Task input data")
    tags: Optional[List[str]] = Field(None, description="Task tags")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Task metadata")
    parent_task_id: Optional[str] = Field(None, description="Parent task ID for subtasks")


class TaskUpdateRequest(BaseModel):
    """Request schema for updating a task."""
    name: Optional[str] = Field(None, description="Task name", min_length=1, max_length=255)
    description: Optional[str] = Field(None, description="Task description")
    command: Optional[str] = Field(None, description="Command to execute", min_length=1)
    status: Optional[TaskStatus] = Field(None, description="Task status")
    priority: Optional[TaskPriority] = Field(None, description="Task priority")
    scheduled_at: Optional[datetime] = Field(None, description="When to schedule the task")
    timeout: Optional[int] = Field(None, description="Task timeout in seconds", ge=1)
    max_retries: Optional[int] = Field(None, description="Maximum retry attempts", ge=0)
    input_data: Optional[Dict[str, Any]] = Field(None, description="Task input data")
    output_data: Optional[Dict[str, Any]] = Field(None, description="Task output data")
    error_message: Optional[str] = Field(None, description="Error message")
    tags: Optional[List[str]] = Field(None, description="Task tags")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Task metadata")


class TaskResponse(BaseModel):
    """Response schema for task data."""
    id: str = Field(..., description="Task ID")
    project_id: str = Field(..., description="Project ID")
    task_queue_id: str = Field(..., description="Task queue ID")
    parent_task_id: Optional[str] = Field(None, description="Parent task ID")
    name: str = Field(..., description="Task name")
    description: Optional[str] = Field(None, description="Task description")
    command: str = Field(..., description="Command to execute")
    status: TaskStatus = Field(..., description="Task status")
    priority: TaskPriority = Field(..., description="Task priority")
    scheduled_at: Optional[datetime] = Field(None, description="Scheduled execution time")
    retry_count: int = Field(..., description="Current retry count", ge=0)
    max_retries: int = Field(..., description="Maximum retry attempts", ge=0)
    timeout: Optional[int] = Field(None, description="Task timeout in seconds")
    input_data: Optional[Dict[str, Any]] = Field(None, description="Task input data")
    output_data: Optional[Dict[str, Any]] = Field(None, description="Task output data")
    error_message: Optional[str] = Field(None, description="Error message")
    tags: Optional[List[str]] = Field(None, description="Task tags")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Task metadata")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    started_at: Optional[datetime] = Field(None, description="Start timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")


class TaskListResponse(BaseModel):
    """Response schema for task list."""
    tasks: List[TaskResponse] = Field(..., description="List of tasks")
    total: int = Field(..., description="Total number of tasks", ge=0)


class TaskStatsResponse(BaseModel):
    """Response schema for task statistics."""
    total_tasks: int = Field(..., description="Total number of tasks", ge=0)
    status_counts: Dict[str, int] = Field(..., description="Task counts by status")
    filters: Dict[str, Optional[str]] = Field(..., description="Applied filters")


# Task Dependency Schemas

class TaskDependencyCreateRequest(BaseModel):
    """Request schema for creating a task dependency."""
    task_id: str = Field(..., description="Task ID")
    depends_on_task_id: str = Field(..., description="Task ID this task depends on")
    dependency_type: str = Field("completion", description="Type of dependency")
    is_hard_dependency: bool = Field(True, description="Whether this is a hard dependency")


class TaskDependencyResponse(BaseModel):
    """Response schema for task dependency data."""
    id: str = Field(..., description="Dependency ID")
    task_id: str = Field(..., description="Task ID")
    depends_on_task_id: str = Field(..., description="Task ID this task depends on")
    dependency_type: str = Field(..., description="Type of dependency")
    is_hard_dependency: bool = Field(..., description="Whether this is a hard dependency")
    created_at: datetime = Field(..., description="Creation timestamp")


# Task Execution Schemas

class TaskExecutionLogResponse(BaseModel):
    """Response schema for task execution log."""
    id: str = Field(..., description="Log ID")
    task_id: str = Field(..., description="Task ID")
    execution_id: str = Field(..., description="Execution ID")
    status: ExecutionStatus = Field(..., description="Execution status")
    command: str = Field(..., description="Executed command")
    input_data: Optional[Dict[str, Any]] = Field(None, description="Input data")
    output_data: Optional[Dict[str, Any]] = Field(None, description="Output data")
    error_message: Optional[str] = Field(None, description="Error message")
    exit_code: Optional[int] = Field(None, description="Process exit code")
    cpu_usage: Optional[float] = Field(None, description="CPU usage")
    memory_usage: Optional[float] = Field(None, description="Memory usage")
    duration_seconds: Optional[float] = Field(None, description="Execution duration")
    worker_id: Optional[str] = Field(None, description="Worker ID")
    session_id: Optional[str] = Field(None, description="Session ID")
    stdout: Optional[str] = Field(None, description="Standard output")
    stderr: Optional[str] = Field(None, description="Standard error")
    system_logs: Optional[Dict[str, Any]] = Field(None, description="System logs")
    created_at: datetime = Field(..., description="Creation timestamp")
    started_at: Optional[datetime] = Field(None, description="Start timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")


class TaskExecutionRequest(BaseModel):
    """Request schema for task execution."""
    task_id: str = Field(..., description="Task ID to execute")
    session_id: Optional[str] = Field(None, description="Session ID for command execution")


class ExecutionStatsResponse(BaseModel):
    """Response schema for execution statistics."""
    running_executions: int = Field(..., description="Number of running executions", ge=0)
    active_consumers: int = Field(..., description="Number of active consumers", ge=0)
    consumer_details: Dict[str, Dict[str, Any]] = Field(..., description="Consumer details")


# Queue Consumer Schemas

class QueueConsumerStartRequest(BaseModel):
    """Request schema for starting a queue consumer."""
    queue_id: str = Field(..., description="Task queue ID")
    consumer_name: Optional[str] = Field(None, description="Consumer name")


class QueueConsumerResponse(BaseModel):
    """Response schema for queue consumer."""
    consumer_id: str = Field(..., description="Consumer ID")
    queue_id: str = Field(..., description="Queue ID")
    consumer_name: str = Field(..., description="Consumer name")
    is_running: bool = Field(..., description="Whether consumer is running")


# WebSocket Message Schemas for Task Updates

class TaskWebSocketMessage(BaseModel):
    """WebSocket message for task updates."""
    type: str = Field(..., description="Message type")
    task_id: str = Field(..., description="Task ID")
    project_id: str = Field(..., description="Project ID")
    queue_id: str = Field(..., description="Queue ID")
    status: Optional[TaskStatus] = Field(None, description="Task status")
    data: Optional[Dict[str, Any]] = Field(None, description="Additional data")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")


class ProjectWebSocketMessage(BaseModel):
    """WebSocket message for project updates."""
    type: str = Field(..., description="Message type")
    project_id: str = Field(..., description="Project ID")
    status: Optional[ProjectStatus] = Field(None, description="Project status")
    data: Optional[Dict[str, Any]] = Field(None, description="Additional data")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")


# GitHub Integration Schemas

class GitHubConnectionRequest(BaseModel):
    """Request schema for connecting GitHub repository."""
    token: str = Field(..., description="GitHub personal access token", min_length=1)
    repository: str = Field(..., description="Repository in format 'owner/repo'", min_length=1)
    project_id: str = Field(..., description="Project UUID", min_length=1)

    @validator('repository')
    def validate_repository_format(cls, v):
        """Validate repository format."""
        if not v or '/' not in v:
            raise ValueError('Repository must be in format "owner/repo"')
        parts = v.split('/')
        if len(parts) != 2 or not all(part.strip() for part in parts):
            raise ValueError('Repository must be in format "owner/repo"')
        return v

    @validator('token')
    def validate_token_format(cls, v):
        """Validate GitHub token format."""
        if not v.startswith(('ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_')):
            raise ValueError('Invalid GitHub token format')
        return v


class GitHubConnectionResponse(BaseModel):
    """Response schema for GitHub connection."""
    id: str = Field(..., description="Connection UUID")
    repository: str = Field(..., description="Repository name")
    username: str = Field(..., description="GitHub username")  
    connected_at: datetime = Field(..., description="Connection timestamp")
    project_id: str = Field(..., description="Associated project ID")
    status: str = Field(..., description="Connection status")


class GitHubIssueResponse(BaseModel):
    """Response schema for GitHub issue."""
    number: int = Field(..., description="Issue number")
    title: str = Field(..., description="Issue title")
    body: Optional[str] = Field(None, description="Issue description")
    state: str = Field(..., description="Issue state (open/closed)")
    labels: Optional[List[str]] = Field(default=[], description="Issue labels")
    assignees: Optional[List[str]] = Field(default=[], description="Assigned users")
    created_at: datetime = Field(..., description="GitHub creation time")
    updated_at: datetime = Field(..., description="GitHub update time")
    html_url: str = Field(..., description="GitHub issue URL")


class GitHubIssuesListResponse(BaseModel):
    """Response schema for GitHub issues list."""
    issues: List[GitHubIssueResponse] = Field(..., description="List of issues")
    total: int = Field(..., description="Total number of issues", ge=0)
    page: int = Field(..., description="Current page number", ge=1)
    has_more: bool = Field(..., description="Whether more pages are available")


class CreateTaskFromIssueRequest(BaseModel):
    """Request schema for creating task from GitHub issue."""
    project_id: str = Field(..., description="Target project UUID")
    repository: str = Field(..., description="GitHub repository in format 'owner/repo'")
    priority: TaskPriority = Field(TaskPriority.MEDIUM, description="Task priority")
    additional_tags: Optional[List[str]] = Field(None, description="Additional tags for the task")

    @validator('repository')
    def validate_repository_format(cls, v):
        """Validate repository format."""
        if not v or '/' not in v:
            raise ValueError('Repository must be in format "owner/repo"')
        parts = v.split('/')
        if len(parts) != 2 or not all(part.strip() for part in parts):
            raise ValueError('Repository must be in format "owner/repo"')
        return v


class CreateTaskFromIssueResponse(BaseModel):
    """Response schema for task creation from GitHub issue."""
    task_id: str = Field(..., description="Created task UUID")
    github_issue_number: int = Field(..., description="GitHub issue number")
    created_at: datetime = Field(..., description="Task creation timestamp")