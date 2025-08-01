"""SQLAlchemy database models."""

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
    UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(AsyncAttrs, DeclarativeBase):
    """Base class for all database models."""
    pass


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


class Project(Base):
    """Project model for organizing tasks."""
    
    __tablename__ = "projects"
    
    # Primary key
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4())
    )
    
    # Basic fields
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        SQLEnum(ProjectStatus),
        nullable=False,
        default=ProjectStatus.ACTIVE
    )
    
    # Metadata
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Relationships
    task_queues: Mapped[List["TaskQueue"]] = relationship(
        "TaskQueue", 
        back_populates="project",
        cascade="all, delete-orphan"
    )
    tasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="project",
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index("ix_projects_name", "name"),
        Index("ix_projects_status", "status"),
        Index("ix_projects_created_at", "created_at"),
    )


class TaskQueue(Base):
    """Task queue model for organizing task execution."""
    
    __tablename__ = "task_queues"
    
    # Primary key
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    
    # Foreign keys
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Basic fields
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[TaskQueueStatus] = mapped_column(
        SQLEnum(TaskQueueStatus),
        nullable=False,
        default=TaskQueueStatus.ACTIVE
    )
    
    # Queue configuration
    max_concurrent_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    retry_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    retry_delay: Mapped[int] = mapped_column(Integer, nullable=False, default=60)  # seconds
    timeout: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # seconds
    
    # Redis stream configuration
    redis_stream_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    consumer_group: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Metadata
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    last_processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="task_queues")
    tasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="task_queue",
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index("ix_task_queues_project_id", "project_id"),
        Index("ix_task_queues_name", "name"),
        Index("ix_task_queues_status", "status"),
        Index("ix_task_queues_redis_stream", "redis_stream_key"),
    )


class Task(Base):
    """Task model for individual task execution."""
    
    __tablename__ = "tasks"
    
    # Primary key
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    
    # Foreign keys
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False
    )
    task_queue_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("task_queues.id", ondelete="CASCADE"),
        nullable=False
    )
    parent_task_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True
    )
    
    # Basic fields
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    command: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Task execution configuration
    status: Mapped[TaskStatus] = mapped_column(
        SQLEnum(TaskStatus),
        nullable=False,
        default=TaskStatus.PENDING
    )
    priority: Mapped[TaskPriority] = mapped_column(
        SQLEnum(TaskPriority),
        nullable=False,
        default=TaskPriority.MEDIUM
    )
    
    # Scheduling and retry
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    timeout: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # seconds
    
    # Task data and results
    input_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    output_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Metadata
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    task_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # GitHub integration fields
    github_issue_number: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="GitHub issue number if task was created from an issue"
    )
    github_connection_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("github_connections.id", ondelete="SET NULL"),
        nullable=True,
        comment="Reference to GitHub connection if task is linked to GitHub"
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")
    task_queue: Mapped["TaskQueue"] = relationship("TaskQueue", back_populates="tasks")
    parent_task: Mapped[Optional["Task"]] = relationship(
        "Task",
        remote_side=[id],
        back_populates="subtasks"
    )
    subtasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="parent_task",
        cascade="all, delete-orphan"
    )
    dependencies: Mapped[List["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.task_id",
        back_populates="task",
        cascade="all, delete-orphan"
    )
    dependents: Mapped[List["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.depends_on_task_id",
        back_populates="depends_on_task"
    )
    execution_logs: Mapped[List["TaskExecutionLog"]] = relationship(
        "TaskExecutionLog",
        back_populates="task",
        cascade="all, delete-orphan"
    )
    github_connection: Mapped[Optional["GitHubConnection"]] = relationship(
        "GitHubConnection",
        back_populates="tasks"
    )
    
    # Indexes
    __table_args__ = (
        Index("ix_tasks_project_id", "project_id"),
        Index("ix_tasks_task_queue_id", "task_queue_id"),
        Index("ix_tasks_parent_task_id", "parent_task_id"),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_priority", "priority"),
        Index("ix_tasks_scheduled_at", "scheduled_at"),
        Index("ix_tasks_created_at", "created_at"),
        Index("ix_tasks_status_priority", "status", "priority"),
        Index("ix_tasks_github_issue_number", "github_issue_number"),
        Index("ix_tasks_github_connection_id", "github_connection_id"),
    )


class TaskDependency(Base):
    """Task dependency model for managing task dependencies."""
    
    __tablename__ = "task_dependencies"
    
    # Primary key
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    
    # Foreign keys
    task_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False
    )
    depends_on_task_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Dependency configuration
    dependency_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="completion"  # completion, success, failure
    )
    is_hard_dependency: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    
    # Relationships
    task: Mapped["Task"] = relationship(
        "Task",
        foreign_keys=[task_id],
        back_populates="dependencies"
    )
    depends_on_task: Mapped["Task"] = relationship(
        "Task",
        foreign_keys=[depends_on_task_id],
        back_populates="dependents"
    )
    
    # Indexes and constraints
    __table_args__ = (
        Index("ix_task_dependencies_task_id", "task_id"),
        Index("ix_task_dependencies_depends_on", "depends_on_task_id"),
        Index("ix_task_dependencies_type", "dependency_type"),
    )


class TaskExecutionLog(Base):
    """Task execution log model for tracking execution history."""
    
    __tablename__ = "task_execution_logs"
    
    # Primary key
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    
    # Foreign keys
    task_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Execution details
    execution_id: Mapped[str] = mapped_column(String(255), nullable=False)  # UUID for this execution attempt
    status: Mapped[ExecutionStatus] = mapped_column(
        SQLEnum(ExecutionStatus),
        nullable=False
    )
    
    # Execution data
    command: Mapped[str] = mapped_column(Text, nullable=False)
    input_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    output_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Performance metrics
    cpu_usage: Mapped[Optional[float]] = mapped_column(nullable=True)
    memory_usage: Mapped[Optional[float]] = mapped_column(nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(nullable=True)
    
    # Execution environment
    worker_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Log entries
    stdout: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stderr: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    system_logs: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="execution_logs")
    
    # Indexes
    __table_args__ = (
        Index("ix_task_execution_logs_task_id", "task_id"),
        Index("ix_task_execution_logs_execution_id", "execution_id"),
        Index("ix_task_execution_logs_status", "status"),
        Index("ix_task_execution_logs_worker_id", "worker_id"),
        Index("ix_task_execution_logs_session_id", "session_id"),
        Index("ix_task_execution_logs_created_at", "created_at"),
    )


class GitHubConnection(Base):
    """GitHub connection model for repository integration."""
    
    __tablename__ = "github_connections"
    
    # Primary key
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    
    # Foreign key
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # GitHub connection details
    repository: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Repository in format 'owner/repo'"
    )
    username: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="GitHub username"
    )
    encrypted_token: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Encrypted GitHub personal access token"
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        comment="Connection status: active, inactive, error"
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project")
    issues: Mapped[List["GitHubIssue"]] = relationship(
        "GitHubIssue",
        back_populates="connection",
        cascade="all, delete-orphan"
    )
    tasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="github_connection"
    )
    
    # Constraints and indexes
    __table_args__ = (
        UniqueConstraint("project_id", "repository", name="uq_project_repository"),
        Index("ix_github_connections_project_id", "project_id"),
        Index("ix_github_connections_repository", "repository"),
        Index("ix_github_connections_status", "status"),
        Index("ix_github_connections_created_at", "created_at"),
    )


class GitHubIssue(Base):
    """GitHub issue cache model for storing issue data locally."""
    
    __tablename__ = "github_issues"
    
    # Primary key
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    
    # Foreign key
    connection_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("github_connections.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # GitHub issue details
    issue_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="GitHub issue number"
    )
    title: Mapped[str] = mapped_column(
        String(500),
        nullable=False
    )
    body: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )
    state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Issue state: open, closed"
    )
    labels: Mapped[Optional[List[str]]] = mapped_column(
        JSON,
        nullable=True,
        default=list
    )
    assignees: Mapped[Optional[List[str]]] = mapped_column(
        JSON,
        nullable=True,
        default=list
    )
    
    # GitHub timestamps
    github_created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    github_updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Sync metadata
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    html_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )
    
    # Relationships
    connection: Mapped["GitHubConnection"] = relationship(
        "GitHubConnection",
        back_populates="issues"
    )
    
    # Constraints and indexes
    __table_args__ = (
        UniqueConstraint("connection_id", "issue_number", name="uq_connection_issue"),
        Index("ix_github_issues_connection_id", "connection_id"),
        Index("ix_github_issues_issue_number", "issue_number"),
        Index("ix_github_issues_state", "state"),
        Index("ix_github_issues_synced_at", "synced_at"),
        Index("ix_github_issues_github_updated_at", "github_updated_at"),
    )