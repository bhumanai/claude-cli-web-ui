"""Task management service for CRUD operations and status management."""

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import and_, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging_config import get_logger
from app.models.database import (
    Task, 
    TaskStatus, 
    TaskPriority, 
    TaskQueue, 
    Project,
    TaskDependency,
    TaskExecutionLog
)

logger = get_logger(__name__)


class TaskService:
    """Service for managing tasks."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create_task(
        self,
        project_id: str,
        task_queue_id: str,
        name: str,
        command: str,
        description: Optional[str] = None,
        priority: TaskPriority = TaskPriority.MEDIUM,
        scheduled_at: Optional[datetime] = None,
        timeout: Optional[int] = None,
        max_retries: int = 3,
        input_data: Optional[Dict] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
        parent_task_id: Optional[str] = None
    ) -> Task:
        """
        Create a new task.
        
        Args:
            project_id: Project ID
            task_queue_id: Task queue ID
            name: Task name
            command: Command to execute
            description: Task description
            priority: Task priority
            scheduled_at: When to schedule the task
            timeout: Task timeout in seconds
            max_retries: Maximum retry attempts
            input_data: Task input data
            tags: Task tags
            metadata: Task metadata
            parent_task_id: Parent task ID for subtasks
            
        Returns:
            Created task
            
        Raises:
            ValueError: If project or queue doesn't exist
        """
        logger.info("Creating task", project_id=project_id, name=name)
        
        # Verify project exists
        project_result = await self.session.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project with ID '{project_id}' not found")
        
        # Verify task queue exists and belongs to project
        queue_result = await self.session.execute(
            select(TaskQueue).where(
                and_(
                    TaskQueue.id == task_queue_id,
                    TaskQueue.project_id == project_id
                )
            )
        )
        task_queue = queue_result.scalar_one_or_none()
        if not task_queue:
            raise ValueError(f"Task queue with ID '{task_queue_id}' not found in project")
        
        # Verify parent task exists if specified
        if parent_task_id:
            parent_result = await self.session.execute(
                select(Task).where(Task.id == parent_task_id)
            )
            parent_task = parent_result.scalar_one_or_none()
            if not parent_task:
                raise ValueError(f"Parent task with ID '{parent_task_id}' not found")
            if parent_task.project_id != project_id:
                raise ValueError("Parent task must be in the same project")
        
        # Create task
        task = Task(
            project_id=project_id,
            task_queue_id=task_queue_id,
            parent_task_id=parent_task_id,
            name=name,
            description=description,
            command=command,
            status=TaskStatus.PENDING,
            priority=priority,
            scheduled_at=scheduled_at,
            timeout=timeout,
            max_retries=max_retries,
            input_data=input_data or {},
            tags=tags or [],
            task_metadata=metadata or {}
        )
        
        self.session.add(task)
        await self.session.commit()
        await self.session.refresh(task)
        
        logger.info("Task created successfully", 
                   task_id=task.id, name=name)
        
        return task
    
    async def get_task(self, task_id: str) -> Optional[Task]:
        """
        Get task by ID.
        
        Args:
            task_id: Task ID
            
        Returns:
            Task if found, None otherwise
        """
        result = await self.session.execute(
            select(Task)
            .options(
                selectinload(Task.project),
                selectinload(Task.task_queue),
                selectinload(Task.parent_task),
                selectinload(Task.subtasks),
                selectinload(Task.dependencies),
                selectinload(Task.execution_logs)
            )
            .where(Task.id == task_id)
        )
        return result.scalar_one_or_none()
    
    async def list_tasks(
        self,
        project_id: Optional[str] = None,
        task_queue_id: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        priority: Optional[TaskPriority] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        parent_task_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Task]:
        """
        List tasks with optional filtering.
        
        Args:
            project_id: Filter by project ID
            task_queue_id: Filter by task queue ID
            status: Filter by task status
            priority: Filter by task priority
            tags: Filter by tags (tasks must have all specified tags)
            search: Search in name and description
            parent_task_id: Filter by parent task ID
            limit: Maximum number of tasks to return
            offset: Number of tasks to skip
            
        Returns:
            List of tasks
        """
        query = select(Task).options(
            selectinload(Task.project),
            selectinload(Task.task_queue),
            selectinload(Task.parent_task)
        )
        
        # Apply filters
        conditions = []
        
        if project_id:
            conditions.append(Task.project_id == project_id)
        
        if task_queue_id:
            conditions.append(Task.task_queue_id == task_queue_id)
        
        if status:
            conditions.append(Task.status == status)
        
        if priority:
            conditions.append(Task.priority == priority)
        
        if parent_task_id:
            conditions.append(Task.parent_task_id == parent_task_id)
        
        if tags:
            # Tasks must have all specified tags
            for tag in tags:
                conditions.append(Task.tags.contains([tag]))
        
        if search:
            search_term = f"%{search}%"
            conditions.append(
                or_(
                    Task.name.ilike(search_term),
                    Task.description.ilike(search_term),
                    Task.command.ilike(search_term)
                )
            )
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # Apply ordering and pagination
        query = (query
                .order_by(desc(Task.priority), desc(Task.created_at))
                .limit(limit)
                .offset(offset))
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_task(
        self,
        task_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        command: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        priority: Optional[TaskPriority] = None,
        scheduled_at: Optional[datetime] = None,
        timeout: Optional[int] = None,
        max_retries: Optional[int] = None,
        input_data: Optional[Dict] = None,
        output_data: Optional[Dict] = None,
        error_message: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict] = None
    ) -> Optional[Task]:
        """
        Update task.
        
        Args:
            task_id: Task ID
            name: New task name
            description: New task description
            command: New command
            status: New task status
            priority: New task priority
            scheduled_at: New scheduled time
            timeout: New timeout
            max_retries: New max retries
            input_data: New input data
            output_data: New output data
            error_message: New error message
            tags: New tags
            metadata: New metadata
            
        Returns:
            Updated task if found, None otherwise
        """
        task = await self.get_task(task_id)
        if not task:
            return None
        
        logger.info("Updating task", task_id=task_id)
        
        # Update fields
        if name is not None:
            task.name = name
        
        if description is not None:
            task.description = description
        
        if command is not None:
            task.command = command
        
        if status is not None:
            old_status = task.status
            task.status = status
            
            # Update timestamps based on status changes
            if status == TaskStatus.RUNNING and old_status != TaskStatus.RUNNING:
                task.started_at = datetime.utcnow()
            elif status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                if not task.started_at:
                    task.started_at = datetime.utcnow()
                task.completed_at = datetime.utcnow()
        
        if priority is not None:
            task.priority = priority
        
        if scheduled_at is not None:
            task.scheduled_at = scheduled_at
        
        if timeout is not None:
            task.timeout = timeout
        
        if max_retries is not None:
            task.max_retries = max_retries
        
        if input_data is not None:
            task.input_data = input_data
        
        if output_data is not None:
            task.output_data = output_data
        
        if error_message is not None:
            task.error_message = error_message
        
        if tags is not None:
            task.tags = tags
        
        if metadata is not None:
            task.task_metadata = metadata
        
        await self.session.commit()
        await self.session.refresh(task)
        
        logger.info("Task updated successfully", task_id=task_id)
        
        return task
    
    async def delete_task(self, task_id: str) -> bool:
        """
        Delete task and all associated data.
        
        Args:
            task_id: Task ID
            
        Returns:
            True if task was deleted, False if not found
        """
        task = await self.get_task(task_id)
        if not task:
            return False
        
        logger.warning("Deleting task", task_id=task_id, name=task.name)
        
        await self.session.delete(task)
        await self.session.commit()
        
        logger.warning("Task deleted successfully", task_id=task_id)
        
        return True
    
    async def update_task_status(
        self, 
        task_id: str, 
        status: TaskStatus,
        error_message: Optional[str] = None
    ) -> Optional[Task]:
        """
        Update task status with automatic timestamp management.
        
        Args:
            task_id: Task ID
            status: New status
            error_message: Error message if status is FAILED
            
        Returns:
            Updated task if found, None otherwise
        """
        return await self.update_task(
            task_id=task_id,
            status=status,
            error_message=error_message
        )
    
    async def increment_retry_count(self, task_id: str) -> Optional[Task]:
        """
        Increment task retry count.
        
        Args:
            task_id: Task ID
            
        Returns:
            Updated task if found, None otherwise
        """
        task = await self.get_task(task_id)
        if not task:
            return None
        
        task.retry_count += 1
        
        # Update status based on retry count
        if task.retry_count >= task.max_retries:
            task.status = TaskStatus.FAILED
            task.completed_at = datetime.utcnow()
        else:
            task.status = TaskStatus.RETRYING
        
        await self.session.commit()
        await self.session.refresh(task)
        
        logger.info("Incremented task retry count", 
                   task_id=task_id, retry_count=task.retry_count)
        
        return task
    
    async def get_ready_tasks(
        self,
        task_queue_id: Optional[str] = None,
        limit: int = 10
    ) -> List[Task]:
        """
        Get tasks that are ready to be executed.
        
        Args:
            task_queue_id: Filter by task queue ID
            limit: Maximum number of tasks to return
            
        Returns:
            List of ready tasks
        """
        now = datetime.utcnow()
        
        query = select(Task).where(
            and_(
                Task.status == TaskStatus.PENDING,
                or_(
                    Task.scheduled_at.is_(None),
                    Task.scheduled_at <= now
                )
            )
        )
        
        if task_queue_id:
            query = query.where(Task.task_queue_id == task_queue_id)
        
        # Order by priority (high first) then by creation time
        query = query.order_by(
            desc(Task.priority),
            Task.created_at
        ).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_task_dependencies(self, task_id: str) -> List[TaskDependency]:
        """
        Get task dependencies.
        
        Args:
            task_id: Task ID
            
        Returns:
            List of task dependencies
        """
        result = await self.session.execute(
            select(TaskDependency)
            .options(
                selectinload(TaskDependency.depends_on_task)
            )
            .where(TaskDependency.task_id == task_id)
        )
        return list(result.scalars().all())
    
    async def add_task_dependency(
        self,
        task_id: str,
        depends_on_task_id: str,
        dependency_type: str = "completion",
        is_hard_dependency: bool = True
    ) -> TaskDependency:
        """
        Add task dependency.
        
        Args:
            task_id: Task ID
            depends_on_task_id: Task ID this task depends on
            dependency_type: Type of dependency
            is_hard_dependency: Whether this is a hard dependency
            
        Returns:
            Created task dependency
            
        Raises:
            ValueError: If tasks don't exist or circular dependency detected
        """
        # Verify both tasks exist
        task_result = await self.session.execute(
            select(Task).where(Task.id.in_([task_id, depends_on_task_id]))
        )
        tasks = {task.id: task for task in task_result.scalars().all()}
        
        if task_id not in tasks:
            raise ValueError(f"Task with ID '{task_id}' not found")
        if depends_on_task_id not in tasks:
            raise ValueError(f"Dependency task with ID '{depends_on_task_id}' not found")
        
        # Check for circular dependency (basic check)
        if task_id == depends_on_task_id:
            raise ValueError("Task cannot depend on itself")
        
        # Create dependency
        dependency = TaskDependency(
            task_id=task_id,
            depends_on_task_id=depends_on_task_id,
            dependency_type=dependency_type,
            is_hard_dependency=is_hard_dependency
        )
        
        self.session.add(dependency)
        await self.session.commit()
        await self.session.refresh(dependency)
        
        logger.info("Added task dependency", 
                   task_id=task_id, depends_on=depends_on_task_id)
        
        return dependency
    
    async def remove_task_dependency(
        self, 
        task_id: str, 
        depends_on_task_id: str
    ) -> bool:
        """
        Remove task dependency.
        
        Args:
            task_id: Task ID
            depends_on_task_id: Task ID this task depends on
            
        Returns:
            True if dependency was removed, False if not found
        """
        result = await self.session.execute(
            select(TaskDependency).where(
                and_(
                    TaskDependency.task_id == task_id,
                    TaskDependency.depends_on_task_id == depends_on_task_id
                )
            )
        )
        dependency = result.scalar_one_or_none()
        
        if not dependency:
            return False
        
        await self.session.delete(dependency)
        await self.session.commit()
        
        logger.info("Removed task dependency",
                   task_id=task_id, depends_on=depends_on_task_id)
        
        return True
    
    async def check_task_dependencies_satisfied(self, task_id: str) -> bool:
        """
        Check if all task dependencies are satisfied.
        
        Args:
            task_id: Task ID
            
        Returns:
            True if all dependencies are satisfied
        """
        dependencies = await self.get_task_dependencies(task_id)
        
        for dependency in dependencies:
            depend_task = dependency.depends_on_task
            
            if dependency.dependency_type == "completion":
                if depend_task.status not in [TaskStatus.COMPLETED, TaskStatus.FAILED]:
                    if dependency.is_hard_dependency:
                        return False
            elif dependency.dependency_type == "success":
                if depend_task.status != TaskStatus.COMPLETED:
                    if dependency.is_hard_dependency:
                        return False
            elif dependency.dependency_type == "failure":
                if depend_task.status != TaskStatus.FAILED:
                    if dependency.is_hard_dependency:
                        return False
        
        return True
    
    async def get_task_stats(
        self, 
        project_id: Optional[str] = None,
        task_queue_id: Optional[str] = None
    ) -> Dict:
        """
        Get task statistics.
        
        Args:
            project_id: Filter by project ID
            task_queue_id: Filter by task queue ID
            
        Returns:
            Task statistics
        """
        query = select(
            Task.status,
            func.count(Task.id).label('count')
        )
        
        # Apply filters
        conditions = []
        if project_id:
            conditions.append(Task.project_id == project_id)
        if task_queue_id:
            conditions.append(Task.task_queue_id == task_queue_id)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        query = query.group_by(Task.status)
        
        result = await self.session.execute(query)
        status_counts = {row.status: row.count for row in result}
        
        # Get total count
        total = sum(status_counts.values())
        
        return {
            "total_tasks": total,
            "status_counts": status_counts,
            "filters": {
                "project_id": project_id,
                "task_queue_id": task_queue_id
            }
        }
    
    async def cancel_task(self, task_id: str) -> Optional[Task]:
        """
        Cancel a task.
        
        Args:
            task_id: Task ID
            
        Returns:
            Updated task if found, None otherwise
        """
        return await self.update_task_status(task_id, TaskStatus.CANCELLED)
    
    async def restart_task(self, task_id: str) -> Optional[Task]:
        """
        Restart a failed or cancelled task.
        
        Args:
            task_id: Task ID
            
        Returns:
            Updated task if found, None otherwise
        """
        task = await self.get_task(task_id)
        if not task:
            return None
        
        if task.status not in [TaskStatus.FAILED, TaskStatus.CANCELLED]:
            raise ValueError(f"Cannot restart task with status {task.status}")
        
        # Reset task state
        task.status = TaskStatus.PENDING
        task.retry_count = 0
        task.error_message = None
        task.output_data = {}
        task.started_at = None
        task.completed_at = None
        
        await self.session.commit()
        await self.session.refresh(task)
        
        logger.info("Restarted task", task_id=task_id)
        
        return task