"""Task management API endpoints."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models.schemas import (
    TaskCreateRequest,
    TaskUpdateRequest,
    TaskResponse,
    TaskListResponse,
    TaskStatsResponse,
    TaskDependencyCreateRequest,
    TaskDependencyResponse,
    TaskExecutionLogResponse,
    TaskExecutionRequest,
    ErrorResponse
)
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/", response_model=TaskResponse)
async def create_task(
    task_data: TaskCreateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Create a new task.
    
    Args:
        task_data: Task creation data
        db: Database session
        
    Returns:
        Created task
        
    Raises:
        HTTPException: If project or queue doesn't exist
    """
    service = TaskService(db)
    
    try:
        task = await service.create_task(
            project_id=task_data.project_id,
            task_queue_id=task_data.task_queue_id,
            name=task_data.name,
            command=task_data.command,
            description=task_data.description,
            priority=task_data.priority,
            scheduled_at=task_data.scheduled_at,
            timeout=task_data.timeout,
            max_retries=task_data.max_retries,
            input_data=task_data.input_data,
            tags=task_data.tags,
            metadata=task_data.metadata,
            parent_task_id=task_data.parent_task_id
        )
        return TaskResponse.model_validate(task)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=TaskListResponse)
async def list_tasks(
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    task_queue_id: Optional[str] = Query(None, description="Filter by task queue ID"),
    status: Optional[str] = Query(None, description="Filter by task status"),
    priority: Optional[str] = Query(None, description="Filter by task priority"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    search: Optional[str] = Query(None, description="Search in name, description, and command"),
    parent_task_id: Optional[str] = Query(None, description="Filter by parent task ID"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of tasks"),
    offset: int = Query(0, ge=0, description="Number of tasks to skip"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    List tasks with optional filtering.
    
    Args:
        project_id: Filter by project ID
        task_queue_id: Filter by task queue ID
        status: Filter by task status
        priority: Filter by task priority
        tags: Filter by tags
        search: Search term
        parent_task_id: Filter by parent task ID
        limit: Maximum number of tasks
        offset: Number of tasks to skip
        db: Database session
        
    Returns:
        List of tasks
    """
    service = TaskService(db)
    
    # Convert status string to enum if provided
    from app.models.database import TaskStatus, TaskPriority
    status_enum = None
    if status:
        try:
            status_enum = TaskStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid status '{status}'. Must be one of: {[s.value for s in TaskStatus]}"
            )
    
    # Convert priority string to enum if provided
    priority_enum = None
    if priority:
        try:
            priority_enum = TaskPriority(priority)
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid priority '{priority}'. Must be one of: {[p.value for p in TaskPriority]}"
            )
    
    tasks = await service.list_tasks(
        project_id=project_id,
        task_queue_id=task_queue_id,
        status=status_enum,
        priority=priority_enum,
        tags=tags,
        search=search,
        parent_task_id=parent_task_id,
        limit=limit,
        offset=offset
    )
    
    return TaskListResponse(
        tasks=[TaskResponse.model_validate(t) for t in tasks],
        total=len(tasks)
    )


@router.get("/ready", response_model=TaskListResponse)
async def get_ready_tasks(
    task_queue_id: Optional[str] = Query(None, description="Filter by task queue ID"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of tasks"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get tasks that are ready to be executed.
    
    Args:
        task_queue_id: Filter by task queue ID
        limit: Maximum number of tasks
        db: Database session
        
    Returns:
        List of ready tasks
    """
    service = TaskService(db)
    
    tasks = await service.get_ready_tasks(
        task_queue_id=task_queue_id,
        limit=limit
    )
    
    return TaskListResponse(
        tasks=[TaskResponse.model_validate(t) for t in tasks],
        total=len(tasks)
    )


@router.get("/stats", response_model=TaskStatsResponse)
async def get_task_stats(
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    task_queue_id: Optional[str] = Query(None, description="Filter by task queue ID"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get task statistics.
    
    Args:
        project_id: Filter by project ID
        task_queue_id: Filter by task queue ID
        db: Database session
        
    Returns:
        Task statistics
    """
    service = TaskService(db)
    
    stats = await service.get_task_stats(
        project_id=project_id,
        task_queue_id=task_queue_id
    )
    
    return TaskStatsResponse.model_validate(stats)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get task by ID.
    
    Args:
        task_id: Task ID
        db: Database session
        
    Returns:
        Task details
        
    Raises:
        HTTPException: If task not found
    """
    service = TaskService(db)
    
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskResponse.model_validate(task)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    task_data: TaskUpdateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Update task.
    
    Args:
        task_id: Task ID
        task_data: Task update data
        db: Database session
        
    Returns:
        Updated task
        
    Raises:
        HTTPException: If task not found
    """
    service = TaskService(db)
    
    task = await service.update_task(
        task_id=task_id,
        name=task_data.name,
        description=task_data.description,
        command=task_data.command,
        status=task_data.status,
        priority=task_data.priority,
        scheduled_at=task_data.scheduled_at,
        timeout=task_data.timeout,
        max_retries=task_data.max_retries,
        input_data=task_data.input_data,
        output_data=task_data.output_data,
        error_message=task_data.error_message,
        tags=task_data.tags,
        metadata=task_data.metadata
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskResponse.model_validate(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Delete task and all associated data.
    
    Args:
        task_id: Task ID
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If task not found
    """
    service = TaskService(db)
    
    success = await service.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"message": "Task deleted successfully"}


@router.post("/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(
    task_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Cancel a task.
    
    Args:
        task_id: Task ID
        db: Database session
        
    Returns:
        Updated task
        
    Raises:
        HTTPException: If task not found
    """
    service = TaskService(db)
    
    task = await service.cancel_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskResponse.model_validate(task)


@router.post("/{task_id}/restart", response_model=TaskResponse)
async def restart_task(
    task_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Restart a failed or cancelled task.
    
    Args:
        task_id: Task ID
        db: Database session
        
    Returns:
        Updated task
        
    Raises:
        HTTPException: If task not found or cannot be restarted
    """
    service = TaskService(db)
    
    try:
        task = await service.restart_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        return TaskResponse.model_validate(task)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{task_id}/dependencies", response_model=List[TaskDependencyResponse])
async def get_task_dependencies(
    task_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get task dependencies.
    
    Args:
        task_id: Task ID
        db: Database session
        
    Returns:
        List of task dependencies
        
    Raises:
        HTTPException: If task not found
    """
    service = TaskService(db)
    
    # Verify task exists
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    dependencies = await service.get_task_dependencies(task_id)
    
    return [TaskDependencyResponse.model_validate(d) for d in dependencies]


@router.post("/{task_id}/dependencies", response_model=TaskDependencyResponse)
async def add_task_dependency(
    task_id: str,
    dependency_data: TaskDependencyCreateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Add task dependency.
    
    Args:
        task_id: Task ID
        dependency_data: Dependency creation data
        db: Database session
        
    Returns:
        Created task dependency
        
    Raises:
        HTTPException: If tasks don't exist or circular dependency detected
    """
    service = TaskService(db)
    
    # Override task_id from URL
    dependency_data.task_id = task_id
    
    try:
        dependency = await service.add_task_dependency(
            task_id=dependency_data.task_id,
            depends_on_task_id=dependency_data.depends_on_task_id,
            dependency_type=dependency_data.dependency_type,
            is_hard_dependency=dependency_data.is_hard_dependency
        )
        return TaskDependencyResponse.model_validate(dependency)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{task_id}/dependencies/{depends_on_task_id}")
async def remove_task_dependency(
    task_id: str,
    depends_on_task_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Remove task dependency.
    
    Args:
        task_id: Task ID
        depends_on_task_id: Task ID this task depends on
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If dependency not found
    """
    service = TaskService(db)
    
    success = await service.remove_task_dependency(task_id, depends_on_task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task dependency not found")
    
    return {"message": "Task dependency removed successfully"}


@router.get("/{task_id}/dependencies/check")
async def check_task_dependencies_satisfied(
    task_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Check if all task dependencies are satisfied.
    
    Args:
        task_id: Task ID
        db: Database session
        
    Returns:
        Dependencies satisfaction status
        
    Raises:
        HTTPException: If task not found
    """
    service = TaskService(db)
    
    # Verify task exists
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    satisfied = await service.check_task_dependencies_satisfied(task_id)
    
    return {"task_id": task_id, "dependencies_satisfied": satisfied}


@router.get("/{task_id}/execution-logs", response_model=List[TaskExecutionLogResponse])
async def get_task_execution_logs(
    task_id: str,
    limit: int = Query(10, ge=1, le=100, description="Maximum number of logs"),
    offset: int = Query(0, ge=0, description="Number of logs to skip"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get execution logs for a task.
    
    Args:
        task_id: Task ID
        limit: Maximum number of logs
        offset: Number of logs to skip
        db: Database session
        
    Returns:
        List of execution logs
        
    Raises:
        HTTPException: If task not found
    """
    service = TaskService(db)
    
    # Verify task exists
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Import ExecutionService to get logs
    from app.services.execution_service import ExecutionService
    from app.services.task_queue_service import TaskQueueService
    from app.services.redis_client import get_redis_client
    from app.services.command_executor import CommandExecutor
    
    redis_client = await get_redis_client()
    task_queue_service = TaskQueueService(db, redis_client)
    command_executor = CommandExecutor()
    
    execution_service = ExecutionService(
        db, service, task_queue_service, redis_client, command_executor
    )
    
    logs = await execution_service.get_task_execution_logs(
        task_id=task_id,
        limit=limit,
        offset=offset
    )
    
    return [TaskExecutionLogResponse.model_validate(log) for log in logs]