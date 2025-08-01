"""Task queue management API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models.schemas import (
    TaskQueueCreateRequest,
    TaskQueueUpdateRequest,
    TaskQueueResponse,
    TaskQueueListResponse,
    TaskQueueStatsResponse,
    QueueConsumerStartRequest,
    QueueConsumerResponse,
    ErrorResponse
)
from app.services.task_queue_service import TaskQueueService
from app.services.redis_client import get_redis_client

router = APIRouter(prefix="/task-queues", tags=["task-queues"])


@router.post("/", response_model=TaskQueueResponse)
async def create_task_queue(
    queue_data: TaskQueueCreateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Create a new task queue.
    
    Args:
        queue_data: Task queue creation data
        db: Database session
        
    Returns:
        Created task queue
        
    Raises:
        HTTPException: If project doesn't exist or queue name already exists
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    try:
        queue = await service.create_task_queue(
            project_id=queue_data.project_id,
            name=queue_data.name,
            description=queue_data.description,
            max_concurrent_tasks=queue_data.max_concurrent_tasks,
            retry_attempts=queue_data.retry_attempts,
            retry_delay=queue_data.retry_delay,
            timeout=queue_data.timeout,
            config=queue_data.config
        )
        return TaskQueueResponse.model_validate(queue)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=TaskQueueListResponse)
async def list_task_queues(
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    status: Optional[str] = Query(None, description="Filter by queue status"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of queues"),
    offset: int = Query(0, ge=0, description="Number of queues to skip"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    List task queues with optional filtering.
    
    Args:
        project_id: Filter by project ID
        status: Filter by queue status
        limit: Maximum number of queues
        offset: Number of queues to skip
        db: Database session
        
    Returns:
        List of task queues
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    # Convert status string to enum if provided
    from app.models.database import TaskQueueStatus
    status_enum = None
    if status:
        try:
            status_enum = TaskQueueStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid status '{status}'. Must be one of: {[s.value for s in TaskQueueStatus]}"
            )
    
    queues = await service.list_task_queues(
        project_id=project_id,
        status=status_enum,
        limit=limit,
        offset=offset
    )
    
    return TaskQueueListResponse(
        queues=[TaskQueueResponse.model_validate(q) for q in queues],
        total=len(queues)
    )


@router.get("/{queue_id}", response_model=TaskQueueResponse)
async def get_task_queue(
    queue_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get task queue by ID.
    
    Args:
        queue_id: Queue ID
        db: Database session
        
    Returns:
        Task queue details
        
    Raises:
        HTTPException: If queue not found
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    queue = await service.get_task_queue(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Task queue not found")
    
    return TaskQueueResponse.model_validate(queue)


@router.put("/{queue_id}", response_model=TaskQueueResponse)
async def update_task_queue(
    queue_id: str,
    queue_data: TaskQueueUpdateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Update task queue.
    
    Args:
        queue_id: Queue ID
        queue_data: Queue update data
        db: Database session
        
    Returns:
        Updated task queue
        
    Raises:
        HTTPException: If queue not found or name already exists
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    try:
        queue = await service.update_task_queue(
            queue_id=queue_id,
            name=queue_data.name,
            description=queue_data.description,
            status=queue_data.status,
            max_concurrent_tasks=queue_data.max_concurrent_tasks,
            retry_attempts=queue_data.retry_attempts,
            retry_delay=queue_data.retry_delay,
            timeout=queue_data.timeout,
            config=queue_data.config
        )
        
        if not queue:
            raise HTTPException(status_code=404, detail="Task queue not found")
        
        return TaskQueueResponse.model_validate(queue)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{queue_id}")
async def delete_task_queue(
    queue_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Delete task queue and clean up Redis resources.
    
    Args:
        queue_id: Queue ID
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If queue not found
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    success = await service.delete_task_queue(queue_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task queue not found")
    
    return {"message": "Task queue deleted successfully"}


@router.post("/{queue_id}/pause", response_model=TaskQueueResponse)
async def pause_queue(
    queue_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Pause task queue processing.
    
    Args:
        queue_id: Queue ID
        db: Database session
        
    Returns:
        Updated task queue
        
    Raises:
        HTTPException: If queue not found
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    queue = await service.pause_queue(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Task queue not found")
    
    return TaskQueueResponse.model_validate(queue)


@router.post("/{queue_id}/resume", response_model=TaskQueueResponse)
async def resume_queue(
    queue_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Resume task queue processing.
    
    Args:
        queue_id: Queue ID
        db: Database session
        
    Returns:
        Updated task queue
        
    Raises:
        HTTPException: If queue not found
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    queue = await service.resume_queue(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Task queue not found")
    
    return TaskQueueResponse.model_validate(queue)


@router.get("/{queue_id}/stats", response_model=TaskQueueStatsResponse)
async def get_queue_stats(
    queue_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get task queue statistics.
    
    Args:
        queue_id: Queue ID
        db: Database session
        
    Returns:
        Queue statistics
        
    Raises:
        HTTPException: If queue not found
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    stats = await service.get_queue_stats(queue_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Task queue not found")
    
    return TaskQueueStatsResponse.model_validate(stats)


@router.post("/{queue_id}/add-task")
async def add_task_to_queue(
    queue_id: str,
    task_data: dict,
    priority: int = Query(0, description="Task priority (higher = more important)"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Add task to Redis queue.
    
    Args:
        queue_id: Queue ID
        task_data: Task data to add
        priority: Task priority
        db: Database session
        
    Returns:
        Message ID if successful
        
    Raises:
        HTTPException: If queue not found or inactive
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    message_id = await service.add_task_to_queue(
        queue_id=queue_id,
        task_data=task_data,
        priority=priority
    )
    
    if not message_id:
        raise HTTPException(
            status_code=400, 
            detail="Failed to add task to queue. Queue may not exist or be inactive."
        )
    
    return {"message_id": message_id, "queue_id": queue_id}


@router.get("/{queue_id}/next-tasks")
async def get_next_tasks(
    queue_id: str,
    consumer_name: str = Query(..., description="Consumer identifier"),
    count: int = Query(1, ge=1, le=10, description="Maximum number of tasks to get"),
    block_time: Optional[int] = Query(1000, description="Block time in milliseconds"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get next tasks from queue for processing.
    
    Args:
        queue_id: Queue ID
        consumer_name: Consumer identifier
        count: Maximum number of tasks to get
        block_time: Block time in milliseconds
        db: Database session
        
    Returns:
        List of task messages
        
    Raises:
        HTTPException: If queue not found
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    # Verify queue exists
    queue = await service.get_task_queue(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Task queue not found")
    
    try:
        tasks = await service.get_next_tasks(
            queue_id=queue_id,
            consumer_name=consumer_name,
            count=count,
            block_time=block_time
        )
        
        return {"tasks": tasks, "count": len(tasks)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get tasks: {str(e)}")


@router.post("/{queue_id}/acknowledge")
async def acknowledge_task(
    queue_id: str,
    message_id: str = Query(..., description="Message ID to acknowledge"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Acknowledge task completion.
    
    Args:
        queue_id: Queue ID
        message_id: Message ID to acknowledge
        db: Database session
        
    Returns:
        Success status
        
    Raises:
        HTTPException: If queue not found or acknowledgment fails
    """
    redis_client = await get_redis_client()
    service = TaskQueueService(db, redis_client)
    
    # Verify queue exists
    queue = await service.get_task_queue(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Task queue not found")
    
    try:
        success = await service.acknowledge_task(queue_id, message_id)
        
        return {"acknowledged": success, "message_id": message_id}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to acknowledge task: {str(e)}")