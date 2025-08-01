"""Task queue management service with Redis Streams."""

from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging_config import get_logger
from app.models.database import TaskQueue, TaskQueueStatus, Project
from app.services.redis_client import RedisClient

logger = get_logger(__name__)


class TaskQueueService:
    """Service for managing task queues."""
    
    def __init__(self, session: AsyncSession, redis_client: RedisClient):
        self.session = session
        self.redis_client = redis_client
    
    async def create_task_queue(
        self,
        project_id: str,
        name: str,
        description: Optional[str] = None,
        max_concurrent_tasks: int = 1,
        retry_attempts: int = 3,
        retry_delay: int = 60,
        timeout: Optional[int] = None,
        config: Optional[Dict] = None
    ) -> TaskQueue:
        """
        Create a new task queue.
        
        Args:
            project_id: Project ID
            name: Queue name
            description: Queue description
            max_concurrent_tasks: Maximum concurrent tasks
            retry_attempts: Number of retry attempts
            retry_delay: Retry delay in seconds
            timeout: Task timeout in seconds
            config: Queue configuration
            
        Returns:
            Created task queue
            
        Raises:
            ValueError: If project doesn't exist or queue name already exists in project
        """
        logger.info("Creating task queue", project_id=project_id, name=name)
        
        # Verify project exists
        project_result = await self.session.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project with ID '{project_id}' not found")
        
        # Check if queue name already exists in project
        existing = await self.get_queue_by_name(project_id, name)
        if existing:
            raise ValueError(f"Queue with name '{name}' already exists in project")
        
        # Generate Redis stream key and consumer group
        redis_stream_key = f"claude:project:{project_id}:queue:{name}"
        consumer_group = f"queue_{name}_consumers"
        
        # Create task queue
        task_queue = TaskQueue(
            project_id=project_id,
            name=name,
            description=description,
            max_concurrent_tasks=max_concurrent_tasks,
            retry_attempts=retry_attempts,
            retry_delay=retry_delay,
            timeout=timeout,
            redis_stream_key=redis_stream_key,
            consumer_group=consumer_group,
            config=config or {},
            status=TaskQueueStatus.ACTIVE
        )
        
        self.session.add(task_queue)
        await self.session.commit()
        await self.session.refresh(task_queue)
        
        # Create Redis stream and consumer group
        try:
            await self.redis_client.create_stream_group(
                redis_stream_key, 
                consumer_group,
                "0"
            )
            logger.info("Created Redis stream group", 
                       stream=redis_stream_key, group=consumer_group)
        except Exception as e:
            logger.error("Failed to create Redis stream group", 
                        stream=redis_stream_key, error=str(e))
            # Don't fail queue creation if Redis setup fails
        
        logger.info("Task queue created successfully", 
                   queue_id=task_queue.id, name=name)
        
        return task_queue
    
    async def get_task_queue(self, queue_id: str) -> Optional[TaskQueue]:
        """
        Get task queue by ID.
        
        Args:
            queue_id: Queue ID
            
        Returns:
            Task queue if found, None otherwise
        """
        result = await self.session.execute(
            select(TaskQueue)
            .options(
                selectinload(TaskQueue.project),
                selectinload(TaskQueue.tasks)
            )
            .where(TaskQueue.id == queue_id)
        )
        return result.scalar_one_or_none()
    
    async def get_queue_by_name(
        self, 
        project_id: str, 
        name: str
    ) -> Optional[TaskQueue]:
        """
        Get task queue by project ID and name.
        
        Args:
            project_id: Project ID
            name: Queue name
            
        Returns:
            Task queue if found, None otherwise
        """
        result = await self.session.execute(
            select(TaskQueue)
            .where(
                and_(
                    TaskQueue.project_id == project_id,
                    TaskQueue.name == name
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def list_task_queues(
        self,
        project_id: Optional[str] = None,
        status: Optional[TaskQueueStatus] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[TaskQueue]:
        """
        List task queues with optional filtering.
        
        Args:
            project_id: Filter by project ID
            status: Filter by queue status
            limit: Maximum number of queues to return
            offset: Number of queues to skip
            
        Returns:
            List of task queues
        """
        query = select(TaskQueue).options(
            selectinload(TaskQueue.project),
            selectinload(TaskQueue.tasks)
        )
        
        # Apply filters
        conditions = []
        
        if project_id:
            conditions.append(TaskQueue.project_id == project_id)
        
        if status:
            conditions.append(TaskQueue.status == status)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # Apply ordering and pagination
        query = query.order_by(desc(TaskQueue.created_at)).limit(limit).offset(offset)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_task_queue(
        self,
        queue_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[TaskQueueStatus] = None,
        max_concurrent_tasks: Optional[int] = None,
        retry_attempts: Optional[int] = None,
        retry_delay: Optional[int] = None,
        timeout: Optional[int] = None,
        config: Optional[Dict] = None
    ) -> Optional[TaskQueue]:
        """
        Update task queue.
        
        Args:
            queue_id: Queue ID
            name: New queue name
            description: New queue description
            status: New queue status
            max_concurrent_tasks: New max concurrent tasks
            retry_attempts: New retry attempts
            retry_delay: New retry delay
            timeout: New timeout
            config: New configuration
            
        Returns:
            Updated task queue if found, None otherwise
            
        Raises:
            ValueError: If new name already exists in project
        """
        task_queue = await self.get_task_queue(queue_id)
        if not task_queue:
            return None
        
        logger.info("Updating task queue", queue_id=queue_id)
        
        # Check if new name conflicts with existing queue in project
        if name and name != task_queue.name:
            existing = await self.get_queue_by_name(task_queue.project_id, name)
            if existing and existing.id != queue_id:
                raise ValueError(f"Queue with name '{name}' already exists in project")
            task_queue.name = name
        
        # Update fields
        if description is not None:
            task_queue.description = description
        
        if status is not None:
            task_queue.status = status
        
        if max_concurrent_tasks is not None:
            task_queue.max_concurrent_tasks = max_concurrent_tasks
        
        if retry_attempts is not None:
            task_queue.retry_attempts = retry_attempts
        
        if retry_delay is not None:
            task_queue.retry_delay = retry_delay
        
        if timeout is not None:
            task_queue.timeout = timeout
        
        if config is not None:
            task_queue.config = config
        
        await self.session.commit()
        await self.session.refresh(task_queue)
        
        logger.info("Task queue updated successfully", queue_id=queue_id)
        
        return task_queue
    
    async def delete_task_queue(self, queue_id: str) -> bool:
        """
        Delete task queue and clean up Redis resources.
        
        Args:
            queue_id: Queue ID
            
        Returns:
            True if queue was deleted, False if not found
        """
        task_queue = await self.get_task_queue(queue_id)
        if not task_queue:
            return False
        
        logger.warning("Deleting task queue", 
                      queue_id=queue_id, name=task_queue.name)
        
        # Clean up Redis stream (optional - streams can persist)
        if task_queue.redis_stream_key:
            try:
                # Get stream info to check if it exists
                stream_info = await self.redis_client.get_stream_info(
                    task_queue.redis_stream_key
                )
                
                # Optionally delete the stream entirely
                # await self.redis_client.client.delete(task_queue.redis_stream_key)
                
                logger.info("Redis stream cleanup completed", 
                           stream=task_queue.redis_stream_key)
            except Exception as e:
                logger.warning("Failed to clean up Redis stream", 
                              stream=task_queue.redis_stream_key, error=str(e))
        
        await self.session.delete(task_queue)
        await self.session.commit()
        
        logger.warning("Task queue deleted successfully", queue_id=queue_id)
        
        return True
    
    async def pause_queue(self, queue_id: str) -> Optional[TaskQueue]:
        """
        Pause task queue processing.
        
        Args:
            queue_id: Queue ID
            
        Returns:
            Updated task queue if found, None otherwise
        """
        return await self.update_task_queue(
            queue_id=queue_id,
            status=TaskQueueStatus.PAUSED
        )
    
    async def resume_queue(self, queue_id: str) -> Optional[TaskQueue]:
        """
        Resume task queue processing.
        
        Args:
            queue_id: Queue ID
            
        Returns:
            Updated task queue if found, None otherwise
        """
        return await self.update_task_queue(
            queue_id=queue_id,
            status=TaskQueueStatus.ACTIVE
        )
    
    async def get_queue_stats(self, queue_id: str) -> Optional[Dict]:
        """
        Get task queue statistics.
        
        Args:
            queue_id: Queue ID
            
        Returns:
            Queue statistics if found, None otherwise
        """
        task_queue = await self.get_task_queue(queue_id)
        if not task_queue:
            return None
        
        # Get Redis stream info
        redis_stats = {}
        if task_queue.redis_stream_key:
            try:
                stream_info = await self.redis_client.get_stream_info(
                    task_queue.redis_stream_key
                )
                redis_stats = {
                    "stream_length": stream_info.get("length", 0),
                    "last_generated_id": stream_info.get("last-generated-id"),
                    "groups": stream_info.get("groups", 0)
                }
                
                # Get pending messages count
                pending_info = await self.redis_client.get_pending_messages(
                    task_queue.redis_stream_key,
                    task_queue.consumer_group
                )
                redis_stats["pending_messages"] = len(pending_info) if isinstance(pending_info, list) else pending_info.get("pending", 0)
                
            except Exception as e:
                logger.error("Failed to get Redis stream stats", 
                            stream=task_queue.redis_stream_key, error=str(e))
                redis_stats = {"error": str(e)}
        
        # Get task count from database
        from app.models.database import Task
        from sqlalchemy import func
        
        task_count_result = await self.session.execute(
            select(func.count(Task.id))
            .where(Task.task_queue_id == queue_id)
        )
        total_tasks = task_count_result.scalar() or 0
        
        return {
            "queue_id": queue_id,
            "name": task_queue.name,
            "status": task_queue.status,
            "total_tasks": total_tasks,
            "max_concurrent_tasks": task_queue.max_concurrent_tasks,
            "retry_attempts": task_queue.retry_attempts,
            "retry_delay": task_queue.retry_delay,
            "timeout": task_queue.timeout,
            "last_processed_at": task_queue.last_processed_at,
            "redis_stats": redis_stats,
            "created_at": task_queue.created_at,
            "updated_at": task_queue.updated_at
        }
    
    async def add_task_to_queue(
        self, 
        queue_id: str, 
        task_data: Dict,
        priority: int = 0
    ) -> Optional[str]:
        """
        Add task to Redis queue.
        
        Args:
            queue_id: Queue ID
            task_data: Task data to add
            priority: Task priority (higher = more important)
            
        Returns:
            Message ID if successful, None if queue not found
        """
        task_queue = await self.get_task_queue(queue_id)
        if not task_queue or not task_queue.redis_stream_key:
            return None
        
        if task_queue.status != TaskQueueStatus.ACTIVE:
            logger.warning("Attempted to add task to inactive queue", 
                          queue_id=queue_id, status=task_queue.status)
            return None
        
        # Prepare message data
        message_data = {
            "queue_id": queue_id,
            "task_data": task_data,
            "priority": priority,
            "timestamp": datetime.utcnow().isoformat(),
            "retry_count": 0
        }
        
        try:
            # Add to Redis stream
            message_id = await self.redis_client.add_to_stream(
                task_queue.redis_stream_key,
                message_data,
                max_length=10000  # Keep last 10k messages
            )
            
            # Update last processed time
            task_queue.last_processed_at = datetime.utcnow()
            await self.session.commit()
            
            logger.debug("Added task to queue", 
                        queue_id=queue_id, message_id=message_id)
            
            return message_id
            
        except Exception as e:
            logger.error("Failed to add task to queue", 
                        queue_id=queue_id, error=str(e))
            raise
    
    async def get_next_tasks(
        self, 
        queue_id: str, 
        consumer_name: str,
        count: int = 1,
        block_time: Optional[int] = 1000
    ) -> List[Dict]:
        """
        Get next tasks from queue for processing.
        
        Args:
            queue_id: Queue ID
            consumer_name: Consumer identifier
            count: Maximum number of tasks to get
            block_time: Block time in milliseconds
            
        Returns:
            List of task messages
        """
        task_queue = await self.get_task_queue(queue_id)
        if not task_queue or not task_queue.redis_stream_key:
            return []
        
        if task_queue.status != TaskQueueStatus.ACTIVE:
            return []
        
        try:
            # Read from Redis stream
            messages = await self.redis_client.read_from_stream(
                task_queue.redis_stream_key,
                task_queue.consumer_group,
                consumer_name,
                count=count,
                block=block_time
            )
            
            # Format messages
            tasks = []
            for stream_key, message_id, data in messages:
                tasks.append({
                    "message_id": message_id,
                    "queue_id": data.get("queue_id"),
                    "task_data": data.get("task_data"),
                    "priority": data.get("priority", 0),
                    "timestamp": data.get("timestamp"),
                    "retry_count": data.get("retry_count", 0)
                })
            
            return tasks
            
        except Exception as e:
            logger.error("Failed to get next tasks", 
                        queue_id=queue_id, error=str(e))
            raise
    
    async def acknowledge_task(
        self, 
        queue_id: str, 
        message_id: str
    ) -> bool:
        """
        Acknowledge task completion.
        
        Args:
            queue_id: Queue ID
            message_id: Message ID to acknowledge
            
        Returns:
            True if acknowledged successfully
        """
        task_queue = await self.get_task_queue(queue_id)
        if not task_queue or not task_queue.redis_stream_key:
            return False
        
        try:
            result = await self.redis_client.acknowledge_message(
                task_queue.redis_stream_key,
                task_queue.consumer_group,
                message_id
            )
            
            # Update last processed time
            task_queue.last_processed_at = datetime.utcnow()
            await self.session.commit()
            
            return result
            
        except Exception as e:
            logger.error("Failed to acknowledge task", 
                        queue_id=queue_id, message_id=message_id, error=str(e))
            raise