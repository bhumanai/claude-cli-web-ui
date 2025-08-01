"""Task execution coordination service."""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.database import (
    Task,
    TaskExecutionLog,
    TaskStatus,
    ExecutionStatus
)
from app.services.command_executor import CommandExecutor
from app.services.task_service import TaskService
from app.services.task_queue_service import TaskQueueService
from app.services.redis_client import RedisClient

logger = get_logger(__name__)


class ExecutionService:
    """Service for coordinating task execution."""
    
    def __init__(
        self, 
        session: AsyncSession,
        task_service: TaskService,
        task_queue_service: TaskQueueService,
        redis_client: RedisClient,
        command_executor: CommandExecutor
    ):
        self.session = session
        self.task_service = task_service
        self.task_queue_service = task_queue_service
        self.redis_client = redis_client
        self.command_executor = command_executor
        self._running_executions: Dict[str, asyncio.Task] = {}
        self._consumer_tasks: Dict[str, asyncio.Task] = {}
    
    async def start_queue_consumer(
        self, 
        queue_id: str, 
        consumer_name: Optional[str] = None
    ) -> str:
        """
        Start a consumer for a task queue.
        
        Args:
            queue_id: Task queue ID
            consumer_name: Consumer name (auto-generated if None)
            
        Returns:
            Consumer ID
            
        Raises:
            ValueError: If queue not found or consumer already running
        """
        if consumer_name is None:
            consumer_name = f"consumer_{uuid.uuid4().hex[:8]}"
        
        consumer_id = f"{queue_id}:{consumer_name}"
        
        if consumer_id in self._consumer_tasks:
            raise ValueError(f"Consumer {consumer_id} is already running")
        
        # Verify queue exists
        queue = await self.task_queue_service.get_task_queue(queue_id)
        if not queue:
            raise ValueError(f"Task queue {queue_id} not found")
        
        # Start consumer task
        consumer_task = asyncio.create_task(
            self._queue_consumer_loop(queue_id, consumer_name)
        )
        
        self._consumer_tasks[consumer_id] = consumer_task
        
        logger.info("Started queue consumer", 
                   queue_id=queue_id, consumer_name=consumer_name)
        
        return consumer_id
    
    async def stop_queue_consumer(self, consumer_id: str) -> bool:
        """
        Stop a queue consumer.
        
        Args:
            consumer_id: Consumer ID
            
        Returns:
            True if consumer was stopped, False if not found
        """
        if consumer_id not in self._consumer_tasks:
            return False
        
        consumer_task = self._consumer_tasks[consumer_id]
        consumer_task.cancel()
        
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass
        
        del self._consumer_tasks[consumer_id]
        
        logger.info("Stopped queue consumer", consumer_id=consumer_id)
        
        return True
    
    async def execute_task(
        self, 
        task_id: str, 
        session_id: Optional[str] = None
    ) -> TaskExecutionLog:
        """
        Execute a single task.
        
        Args:
            task_id: Task ID to execute
            session_id: Session ID for command execution
            
        Returns:
            Task execution log
            
        Raises:
            ValueError: If task not found or not ready for execution
        """
        logger.info("Starting task execution", task_id=task_id)
        
        # Get task
        task = await self.task_service.get_task(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        # Check if task is ready for execution
        if task.status != TaskStatus.PENDING:
            raise ValueError(f"Task {task_id} is not pending (status: {task.status})")
        
        # Check dependencies
        dependencies_satisfied = await self.task_service.check_task_dependencies_satisfied(task_id)
        if not dependencies_satisfied:
            raise ValueError(f"Task {task_id} dependencies are not satisfied")
        
        # Create execution log
        execution_id = str(uuid.uuid4())
        execution_log = TaskExecutionLog(
            task_id=task_id,
            execution_id=execution_id,
            status=ExecutionStatus.STARTING,
            command=task.command,
            input_data=task.input_data,
            session_id=session_id,
            worker_id=f"worker_{uuid.uuid4().hex[:8]}"
        )
        
        self.session.add(execution_log)
        await self.session.commit()
        await self.session.refresh(execution_log)
        
        # Update task status to running
        await self.task_service.update_task_status(task_id, TaskStatus.RUNNING)
        
        try:
            # Execute the task
            execution_log = await self._execute_task_command(task, execution_log)
            
            # Update task based on execution result
            if execution_log.status == ExecutionStatus.COMPLETED:
                await self.task_service.update_task(
                    task_id=task_id,
                    status=TaskStatus.COMPLETED,
                    output_data=execution_log.output_data
                )
            else:
                # Handle failure
                await self._handle_task_failure(task, execution_log)
            
        except Exception as e:
            logger.error("Task execution failed", task_id=task_id, error=str(e))
            
            # Update execution log
            execution_log.status = ExecutionStatus.FAILED
            execution_log.error_message = str(e)
            execution_log.completed_at = datetime.utcnow()
            await self.session.commit()
            
            # Handle task failure
            await self._handle_task_failure(task, execution_log)
        
        logger.info("Task execution completed", 
                   task_id=task_id, status=execution_log.status)
        
        return execution_log
    
    async def _execute_task_command(
        self, 
        task: Task, 
        execution_log: TaskExecutionLog
    ) -> TaskExecutionLog:
        """
        Execute the actual task command.
        
        Args:
            task: Task to execute
            execution_log: Execution log to update
            
        Returns:
            Updated execution log
        """
        start_time = datetime.utcnow()
        execution_log.status = ExecutionStatus.RUNNING
        execution_log.started_at = start_time
        await self.session.commit()
        
        try:
            # Prepare command execution
            command_timeout = task.timeout or 300  # Default 5 minutes
            
            # Execute command
            logger.debug("Executing command", 
                        task_id=task.id, command=task.command)
            
            result = await self.command_executor.execute_command(
                command=task.command,
                session_id=execution_log.session_id,
                timeout=command_timeout
            )
            
            # Calculate execution time
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            # Update execution log with results
            execution_log.status = (
                ExecutionStatus.COMPLETED if result.exit_code == 0 
                else ExecutionStatus.FAILED
            )
            execution_log.exit_code = result.exit_code
            execution_log.duration_seconds = duration
            execution_log.completed_at = end_time
            
            # Store output data
            output_messages = [msg.dict() for msg in result.output]
            execution_log.output_data = {
                "command_id": result.command_id,
                "exit_code": result.exit_code,
                "output_messages": output_messages,
                "duration_seconds": duration
            }
            
            # Store stdout and stderr separately
            stdout_messages = [msg.content for msg in result.output if msg.type == "stdout"]
            stderr_messages = [msg.content for msg in result.output if msg.type == "stderr"]
            
            execution_log.stdout = "\n".join(stdout_messages) if stdout_messages else None
            execution_log.stderr = "\n".join(stderr_messages) if stderr_messages else None
            
            if result.error:
                execution_log.error_message = result.error
            
            await self.session.commit()
            
            logger.debug("Command execution completed",
                        task_id=task.id, 
                        exit_code=result.exit_code,
                        duration=duration)
            
        except asyncio.TimeoutError:
            execution_log.status = ExecutionStatus.TIMEOUT
            execution_log.error_message = f"Task timed out after {command_timeout} seconds"
            execution_log.completed_at = datetime.utcnow()
            await self.session.commit()
            
            logger.warning("Task execution timed out", 
                          task_id=task.id, timeout=command_timeout)
        
        except Exception as e:
            execution_log.status = ExecutionStatus.FAILED
            execution_log.error_message = str(e)
            execution_log.completed_at = datetime.utcnow()
            await self.session.commit()
            
            logger.error("Task execution error", 
                        task_id=task.id, error=str(e))
        
        return execution_log
    
    async def _handle_task_failure(
        self, 
        task: Task, 
        execution_log: TaskExecutionLog
    ) -> None:
        """
        Handle task execution failure with retry logic.
        
        Args:
            task: Failed task
            execution_log: Execution log with failure details
        """
        # Increment retry count
        updated_task = await self.task_service.increment_retry_count(task.id)
        
        if updated_task and updated_task.status == TaskStatus.RETRYING:
            logger.info("Task will be retried", 
                       task_id=task.id, 
                       retry_count=updated_task.retry_count,
                       max_retries=updated_task.max_retries)
            
            # Add task back to queue for retry
            await self._schedule_task_retry(updated_task)
        else:
            logger.error("Task failed permanently", 
                        task_id=task.id,
                        error=execution_log.error_message)
            
            # Update task with final failure status
            await self.task_service.update_task(
                task_id=task.id,
                status=TaskStatus.FAILED,
                error_message=execution_log.error_message
            )
    
    async def _schedule_task_retry(self, task: Task) -> None:
        """
        Schedule a task for retry.
        
        Args:
            task: Task to retry
        """
        try:
            # Get retry delay from task queue configuration
            queue = await self.task_queue_service.get_task_queue(task.task_queue_id)
            if not queue:
                logger.error("Cannot retry task - queue not found", task_id=task.id)
                return
            
            # Calculate retry delay (exponential backoff)
            retry_delay = queue.retry_delay * (2 ** (task.retry_count - 1))
            
            # Add task back to Redis queue with delay
            task_data = {
                "task_id": task.id,
                "retry_attempt": task.retry_count,
                "scheduled_for_retry": True,
                "retry_delay": retry_delay
            }
            
            message_id = await self.task_queue_service.add_task_to_queue(
                queue_id=task.task_queue_id,
                task_data=task_data,
                priority=int(task.priority.value) if hasattr(task.priority, 'value') else 1
            )
            
            logger.info("Scheduled task for retry", 
                       task_id=task.id, 
                       message_id=message_id,
                       retry_delay=retry_delay)
        
        except Exception as e:
            logger.error("Failed to schedule task retry", 
                        task_id=task.id, error=str(e))
    
    async def _queue_consumer_loop(
        self, 
        queue_id: str, 
        consumer_name: str
    ) -> None:
        """
        Main consumer loop for processing tasks from a queue.
        
        Args:
            queue_id: Task queue ID
            consumer_name: Consumer name
        """
        logger.info("Starting queue consumer loop", 
                   queue_id=queue_id, consumer_name=consumer_name)
        
        while True:
            try:
                # Get next tasks from queue
                tasks = await self.task_queue_service.get_next_tasks(
                    queue_id=queue_id,
                    consumer_name=consumer_name,
                    count=1,
                    block_time=5000  # 5 seconds
                )
                
                if not tasks:
                    continue
                
                # Process each task
                for task_message in tasks:
                    try:
                        await self._process_queue_task(
                            queue_id=queue_id,
                            task_message=task_message
                        )
                        
                        # Acknowledge task completion
                        await self.task_queue_service.acknowledge_task(
                            queue_id=queue_id,
                            message_id=task_message["message_id"]
                        )
                        
                    except Exception as e:
                        logger.error("Failed to process queue task",
                                   queue_id=queue_id,
                                   message_id=task_message.get("message_id"),
                                   error=str(e))
                        
                        # Don't acknowledge failed tasks so they can be retried
            
            except asyncio.CancelledError:
                logger.info("Queue consumer cancelled", 
                           queue_id=queue_id, consumer_name=consumer_name)
                break
            
            except Exception as e:
                logger.error("Error in queue consumer loop",
                           queue_id=queue_id, consumer_name=consumer_name, error=str(e))
                
                # Wait before retrying
                await asyncio.sleep(10)
        
        logger.info("Queue consumer loop ended", 
                   queue_id=queue_id, consumer_name=consumer_name)
    
    async def _process_queue_task(
        self, 
        queue_id: str, 
        task_message: Dict
    ) -> None:
        """
        Process a single task message from the queue.
        
        Args:
            queue_id: Task queue ID
            task_message: Task message from Redis
        """
        task_data = task_message.get("task_data", {})
        task_id = task_data.get("task_id")
        
        if not task_id:
            logger.error("No task_id in queue message", 
                        queue_id=queue_id, message=task_message)
            return
        
        logger.debug("Processing queue task", 
                    queue_id=queue_id, task_id=task_id)
        
        try:
            # Execute the task
            execution_log = await self.execute_task(
                task_id=task_id,
                session_id=task_data.get("session_id")
            )
            
            logger.info("Queue task completed", 
                       queue_id=queue_id, 
                       task_id=task_id,
                       status=execution_log.status)
        
        except Exception as e:
            logger.error("Queue task execution failed",
                        queue_id=queue_id, task_id=task_id, error=str(e))
            raise
    
    async def get_task_execution_logs(
        self, 
        task_id: str,
        limit: int = 10,
        offset: int = 0
    ) -> List[TaskExecutionLog]:
        """
        Get execution logs for a task.
        
        Args:
            task_id: Task ID
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            
        Returns:
            List of execution logs
        """
        from sqlalchemy import desc, select
        
        result = await self.session.execute(
            select(TaskExecutionLog)
            .where(TaskExecutionLog.task_id == task_id)
            .order_by(desc(TaskExecutionLog.created_at))
            .limit(limit)
            .offset(offset)
        )
        
        return list(result.scalars().all())
    
    async def cancel_task_execution(self, task_id: str) -> bool:
        """
        Cancel a running task execution.
        
        Args:
            task_id: Task ID
            
        Returns:
            True if cancellation was successful
        """
        # Update task status
        task = await self.task_service.update_task_status(
            task_id, 
            TaskStatus.CANCELLED
        )
        
        if not task:
            return False
        
        # Cancel any running execution
        if task_id in self._running_executions:
            execution_task = self._running_executions[task_id]
            execution_task.cancel()
            del self._running_executions[task_id]
        
        logger.info("Cancelled task execution", task_id=task_id)
        
        return True
    
    async def get_execution_stats(self) -> Dict:
        """
        Get execution service statistics.
        
        Returns:
            Execution statistics
        """
        return {
            "running_executions": len(self._running_executions),
            "active_consumers": len(self._consumer_tasks),
            "consumer_details": {
                consumer_id: {
                    "queue_id": consumer_id.split(":")[0],
                    "consumer_name": consumer_id.split(":")[1],
                    "is_running": not task.done()
                }
                for consumer_id, task in self._consumer_tasks.items()
            }
        }
    
    async def cleanup(self) -> None:
        """Clean up execution service resources."""
        logger.info("Cleaning up execution service")
        
        # Cancel all consumers
        for consumer_id in list(self._consumer_tasks.keys()):
            await self.stop_queue_consumer(consumer_id)
        
        # Cancel all running executions
        for task_id, execution_task in self._running_executions.items():
            execution_task.cancel()
            try:
                await execution_task
            except asyncio.CancelledError:
                pass
        
        self._running_executions.clear()
        
        logger.info("Execution service cleanup completed")