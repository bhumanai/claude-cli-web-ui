"""Task execution API endpoints."""

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models.schemas import (
    TaskExecutionRequest,
    TaskExecutionLogResponse,
    ExecutionStatsResponse,
    QueueConsumerStartRequest,
    QueueConsumerResponse,
    ErrorResponse
)
from app.services.execution_service import ExecutionService
from app.services.task_service import TaskService
from app.services.task_queue_service import TaskQueueService
from app.services.command_executor import CommandExecutor
from app.services.redis_client import get_redis_client

router = APIRouter(prefix="/execution", tags=["execution"])


async def get_execution_service(db: AsyncSession = Depends(get_db_session)) -> ExecutionService:
    """Get execution service with all dependencies."""
    redis_client = await get_redis_client()
    task_service = TaskService(db)
    task_queue_service = TaskQueueService(db, redis_client)
    command_executor = CommandExecutor()
    
    return ExecutionService(
        db, task_service, task_queue_service, redis_client, command_executor
    )


@router.post("/execute-task", response_model=TaskExecutionLogResponse)
async def execute_task_endpoint(
    execution_data: TaskExecutionRequest,
    execution_service: ExecutionService = Depends(get_execution_service)
):
    """
    Execute a single task.
    
    Args:
        execution_data: Task execution data
        execution_service: Execution service
        
    Returns:
        Task execution log
        
    Raises:
        HTTPException: If task not found or not ready for execution
    """
    try:
        execution_log = await execution_service.execute_task(
            task_id=execution_data.task_id,
            session_id=execution_data.session_id
        )
        return TaskExecutionLogResponse.model_validate(execution_log)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")


@router.post("/consumers/start", response_model=QueueConsumerResponse)
async def start_queue_consumer(
    consumer_data: QueueConsumerStartRequest,
    execution_service: ExecutionService = Depends(get_execution_service)
):
    """
    Start a consumer for a task queue.
    
    Args:
        consumer_data: Consumer start data
        execution_service: Execution service
        
    Returns:
        Consumer information
        
    Raises:
        HTTPException: If queue not found or consumer already running
    """
    try:
        consumer_id = await execution_service.start_queue_consumer(
            queue_id=consumer_data.queue_id,
            consumer_name=consumer_data.consumer_name
        )
        
        # Parse consumer ID to extract components
        queue_id, consumer_name = consumer_id.split(":", 1)
        
        return QueueConsumerResponse(
            consumer_id=consumer_id,
            queue_id=queue_id,
            consumer_name=consumer_name,
            is_running=True
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start consumer: {str(e)}")


@router.post("/consumers/{consumer_id}/stop")
async def stop_queue_consumer(
    consumer_id: str,
    execution_service: ExecutionService = Depends(get_execution_service)
):
    """
    Stop a queue consumer.
    
    Args:
        consumer_id: Consumer ID
        execution_service: Execution service
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If consumer not found
    """
    success = await execution_service.stop_queue_consumer(consumer_id)
    if not success:
        raise HTTPException(status_code=404, detail="Consumer not found")
    
    return {"message": "Consumer stopped successfully", "consumer_id": consumer_id}


@router.get("/consumers", response_model=List[QueueConsumerResponse])
async def list_queue_consumers(
    execution_service: ExecutionService = Depends(get_execution_service)
):
    """
    List all active queue consumers.
    
    Args:
        execution_service: Execution service
        
    Returns:
        List of consumers
    """
    stats = await execution_service.get_execution_stats()
    
    consumers = []
    for consumer_id, details in stats["consumer_details"].items():
        consumers.append(QueueConsumerResponse(
            consumer_id=consumer_id,
            queue_id=details["queue_id"],
            consumer_name=details["consumer_name"],
            is_running=details["is_running"]
        ))
    
    return consumers


@router.get("/stats", response_model=ExecutionStatsResponse)
async def get_execution_stats(
    execution_service: ExecutionService = Depends(get_execution_service)
):
    """
    Get execution service statistics.
    
    Args:
        execution_service: Execution service
        
    Returns:
        Execution statistics
    """
    stats = await execution_service.get_execution_stats()
    return ExecutionStatsResponse.model_validate(stats)


@router.post("/tasks/{task_id}/cancel")
async def cancel_task_execution(
    task_id: str,
    execution_service: ExecutionService = Depends(get_execution_service)
):
    """
    Cancel a running task execution.
    
    Args:
        task_id: Task ID
        execution_service: Execution service
        
    Returns:
        Success status
        
    Raises:
        HTTPException: If task not found
    """
    success = await execution_service.cancel_task_execution(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"cancelled": success, "task_id": task_id}


# Bulk Operations

@router.post("/execute-ready-tasks")
async def execute_ready_tasks(
    queue_id: Optional[str] = Query(None, description="Filter by queue ID"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of tasks to execute"),
    execution_service: ExecutionService = Depends(get_execution_service),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Execute multiple ready tasks.
    
    Args:
        queue_id: Filter by queue ID
        limit: Maximum number of tasks to execute
        execution_service: Execution service
        db: Database session
        
    Returns:
        Execution results
    """
    task_service = TaskService(db)
    
    # Get ready tasks
    ready_tasks = await task_service.get_ready_tasks(
        task_queue_id=queue_id,
        limit=limit
    )
    
    if not ready_tasks:
        return {"message": "No ready tasks found", "executed_count": 0}
    
    executed_tasks = []
    failed_tasks = []
    
    # Execute each task
    for task in ready_tasks:
        try:
            execution_log = await execution_service.execute_task(task.id)
            executed_tasks.append({
                "task_id": task.id,
                "execution_id": execution_log.execution_id,
                "status": execution_log.status
            })
        except Exception as e:
            failed_tasks.append({
                "task_id": task.id,
                "error": str(e)
            })
    
    return {
        "message": f"Executed {len(executed_tasks)} tasks, {len(failed_tasks)} failed",
        "executed_count": len(executed_tasks),
        "failed_count": len(failed_tasks),
        "executed_tasks": executed_tasks,
        "failed_tasks": failed_tasks
    }


@router.get("/health")
async def execution_health_check(
    execution_service: ExecutionService = Depends(get_execution_service),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Health check for execution service.
    
    Args:
        execution_service: Execution service
        db: Database session
        
    Returns:
        Health status
    """
    try:
        # Check database connection
        await db.execute("SELECT 1")
        db_healthy = True
    except Exception:
        db_healthy = False
    
    try:
        # Check Redis connection
        from app.services.redis_client import get_redis_client
        redis_client = await get_redis_client()
        redis_healthy = await redis_client.health_check()
    except Exception:
        redis_healthy = False
    
    # Get execution stats
    try:
        stats = await execution_service.get_execution_stats()
        execution_healthy = True
    except Exception:
        stats = {}
        execution_healthy = False
    
    overall_healthy = db_healthy and redis_healthy and execution_healthy
    
    return {
        "status": "healthy" if overall_healthy else "unhealthy",
        "database": "healthy" if db_healthy else "unhealthy",
        "redis": "healthy" if redis_healthy else "unhealthy", 
        "execution_service": "healthy" if execution_healthy else "unhealthy",
        "stats": stats
    }