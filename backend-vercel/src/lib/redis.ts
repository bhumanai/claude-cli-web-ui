/**
 * Upstash Redis integration for queue management and caching
 */

import { Redis } from '@upstash/redis';
import { Task, QueueStatus, SSEMessage } from '../types';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export class RedisService {
  private redis: Redis;

  constructor() {
    if (!REDIS_URL || !REDIS_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required');
    }

    this.redis = new Redis({
      url: REDIS_URL,
      token: REDIS_TOKEN,
    });
  }

  /**
   * Add task to queue
   */
  async enqueueTask(queueId: string, task: Task): Promise<void> {
    const queueKey = `queue:${queueId}`;
    const taskKey = `task:${task.id}`;
    
    // Store task data
    await this.redis.hset(taskKey, {
      id: task.id,
      project_id: task.project_id,
      name: task.name,
      command: task.command,
      status: task.status,
      priority: task.priority,
      created_at: task.created_at.toISOString(),
      updated_at: task.updated_at.toISOString(),
      ...(task.description && { description: task.description }),
      ...(task.scheduled_at && { scheduled_at: task.scheduled_at.toISOString() }),
      ...(task.timeout && { timeout: task.timeout.toString() }),
      ...(task.max_retries && { max_retries: task.max_retries.toString() }),
      ...(task.input_data && { input_data: JSON.stringify(task.input_data) }),
      ...(task.tags && { tags: JSON.stringify(task.tags) }),
      ...(task.metadata && { metadata: JSON.stringify(task.metadata) }),
      ...(task.parent_task_id && { parent_task_id: task.parent_task_id }),
    });

    // Add to priority queue (using sorted set with priority as score)
    const priorityScore = this.getPriorityScore(task.priority);
    await this.redis.zadd(`${queueKey}:pending`, {
      score: priorityScore,
      member: task.id,
    });

    // Update queue statistics
    await this.redis.hincrby(`${queueKey}:stats`, 'pending_tasks', 1);
    await this.redis.hincrby(`${queueKey}:stats`, 'total_tasks', 1);

    // Set expiration for task data (30 days)
    await this.redis.expire(taskKey, 30 * 24 * 60 * 60);

    console.log(`Task ${task.id} enqueued to ${queueId} with priority ${task.priority}`);
  }

  /**
   * Dequeue next task from queue
   */
  async dequeueTask(queueId: string): Promise<Task | null> {
    const queueKey = `queue:${queueId}`;
    
    // Get highest priority task (lowest score in sorted set)
    const result = await this.redis.zpopmin(`${queueKey}:pending`, 1);
    if (!result || result.length === 0) {
      return null;
    }

    const taskId = result[0];
    const task = await this.getTask(taskId as string);
    
    if (task) {
      // Move to running queue
      await this.redis.sadd(`${queueKey}:running`, taskId);
      
      // Update statistics
      await this.redis.hincrby(`${queueKey}:stats`, 'pending_tasks', -1);
      await this.redis.hincrby(`${queueKey}:stats`, 'running_tasks', 1);

      // Update task status
      task.status = 'running';
      task.started_at = new Date();
      await this.updateTask(task);

      console.log(`Task ${taskId} dequeued from ${queueId}`);
    }

    return task;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    const taskKey = `task:${taskId}`;
    const taskData = await this.redis.hgetall(taskKey);
    
    if (!taskData || Object.keys(taskData).length === 0) {
      return null;
    }

    // Parse task data
    const task: Task = {
      id: taskData.id as string,
      project_id: taskData.project_id as string,
      name: taskData.name as string,
      command: taskData.command as string,
      status: taskData.status as Task['status'],
      priority: taskData.priority as Task['priority'],
      created_at: new Date(taskData.created_at as string),
      updated_at: new Date(taskData.updated_at as string),
      description: taskData.description as string || undefined,
      scheduled_at: taskData.scheduled_at ? new Date(taskData.scheduled_at as string) : undefined,
      started_at: taskData.started_at ? new Date(taskData.started_at as string) : undefined,
      completed_at: taskData.completed_at ? new Date(taskData.completed_at as string) : undefined,
      timeout: taskData.timeout ? parseInt(taskData.timeout as string) : undefined,
      max_retries: taskData.max_retries ? parseInt(taskData.max_retries as string) : undefined,
      retry_count: taskData.retry_count ? parseInt(taskData.retry_count as string) : undefined,
      input_data: taskData.input_data ? JSON.parse(taskData.input_data as string) : undefined,
      output_data: taskData.output_data ? JSON.parse(taskData.output_data as string) : undefined,
      error_message: taskData.error_message as string || undefined,
      tags: taskData.tags ? JSON.parse(taskData.tags as string) : undefined,
      metadata: taskData.metadata ? JSON.parse(taskData.metadata as string) : undefined,
      parent_task_id: taskData.parent_task_id as string || undefined,
      worker_id: taskData.worker_id as string || undefined,
      github_issue_number: taskData.github_issue_number ? parseInt(taskData.github_issue_number as string) : undefined,
    };

    return task;
  }

  /**
   * Update task
   */
  async updateTask(task: Task): Promise<void> {
    const taskKey = `task:${task.id}`;
    
    await this.redis.hset(taskKey, {
      status: task.status,
      updated_at: new Date().toISOString(),
      ...(task.started_at && { started_at: task.started_at.toISOString() }),
      ...(task.completed_at && { completed_at: task.completed_at.toISOString() }),
      ...(task.retry_count !== undefined && { retry_count: task.retry_count.toString() }),
      ...(task.output_data && { output_data: JSON.stringify(task.output_data) }),
      ...(task.error_message && { error_message: task.error_message }),
      ...(task.worker_id && { worker_id: task.worker_id }),
      ...(task.github_issue_number && { github_issue_number: task.github_issue_number.toString() }),
    });

    console.log(`Task ${task.id} updated with status ${task.status}`);
  }

  /**
   * Complete task (move from running to completed)
   */
  async completeTask(queueId: string, taskId: string, success: boolean, output?: any, error?: string): Promise<void> {
    const queueKey = `queue:${queueId}`;
    const task = await this.getTask(taskId);
    
    if (task) {
      // Remove from running queue
      await this.redis.srem(`${queueKey}:running`, taskId);
      
      // Update task
      task.status = success ? 'completed' : 'failed';
      task.completed_at = new Date();
      if (output) task.output_data = output;
      if (error) task.error_message = error;
      
      await this.updateTask(task);
      
      // Update statistics
      await this.redis.hincrby(`${queueKey}:stats`, 'running_tasks', -1);
      if (success) {
        await this.redis.hincrby(`${queueKey}:stats`, 'completed_tasks', 1);
      } else {
        await this.redis.hincrby(`${queueKey}:stats`, 'failed_tasks', 1);
      }

      console.log(`Task ${taskId} completed with status ${task.status}`);
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus(queueId: string): Promise<QueueStatus> {
    const queueKey = `queue:${queueId}`;
    const stats = await this.redis.hgetall(`${queueKey}:stats`);
    
    return {
      id: queueId,
      name: queueId, // In production, fetch from queue metadata
      pending_tasks: parseInt(stats.pending_tasks as string || '0'),
      running_tasks: parseInt(stats.running_tasks as string || '0'),
      completed_tasks: parseInt(stats.completed_tasks as string || '0'),
      failed_tasks: parseInt(stats.failed_tasks as string || '0'),
      active_workers: 0, // Would be tracked separately
    };
  }

  /**
   * List tasks in queue
   */
  async listQueueTasks(queueId: string, status: 'pending' | 'running' | 'all' = 'all'): Promise<Task[]> {
    const queueKey = `queue:${queueId}`;
    let taskIds: string[] = [];

    if (status === 'pending') {
      // Get from sorted set (returns [member, score, member, score, ...])
      const result = await this.redis.zrange(`${queueKey}:pending`, 0, -1);
      taskIds = result.filter((_, index) => index % 2 === 0) as string[];
    } else if (status === 'running') {
      taskIds = await this.redis.smembers(`${queueKey}:running`) as string[];
    } else {
      // Get all tasks for this queue (this is expensive, use with pagination)
      const pendingResult = await this.redis.zrange(`${queueKey}:pending`, 0, -1);
      const pendingIds = pendingResult.filter((_, index) => index % 2 === 0) as string[];
      const runningIds = await this.redis.smembers(`${queueKey}:running`) as string[];
      taskIds = [...pendingIds, ...runningIds];
    }

    // Fetch task details
    const tasks: Task[] = [];
    for (const taskId of taskIds) {
      const task = await this.getTask(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Cache data with expiration
   */
  async cache(key: string, data: any, ttlSeconds: number = 300): Promise<void> {
    const cacheKey = `cache:${key}`;
    await this.redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));
  }

  /**
   * Get cached data
   */
  async getCached<T>(key: string): Promise<T | null> {
    const cacheKey = `cache:${key}`;
    const data = await this.redis.get(cacheKey);
    return data ? JSON.parse(data as string) : null;
  }

  /**
   * Publish SSE message to subscribers
   */
  async publishSSE(channel: string, message: SSEMessage): Promise<void> {
    const channelKey = `sse:${channel}`;
    await this.redis.lpush(channelKey, JSON.stringify({
      ...message,
      timestamp: message.timestamp.toISOString(),
    }));
    
    // Keep only recent messages (last 100)
    await this.redis.ltrim(channelKey, 0, 99);
    
    // Set expiration (1 hour)
    await this.redis.expire(channelKey, 60 * 60);
  }

  /**
   * Get SSE messages from channel
   */
  async getSSEMessages(channel: string, since?: Date): Promise<SSEMessage[]> {
    const channelKey = `sse:${channel}`;
    const messages = await this.redis.lrange(channelKey, 0, -1);
    
    let parsedMessages = messages.map(msg => {
      const parsed = JSON.parse(msg as string);
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    }) as SSEMessage[];

    // Filter by timestamp if provided
    if (since) {
      parsedMessages = parsedMessages.filter(msg => msg.timestamp > since);
    }

    return parsedMessages.reverse(); // Most recent first
  }

  /**
   * Clear all data for a queue (cleanup)
   */
  async clearQueue(queueId: string): Promise<void> {
    const queueKey = `queue:${queueId}`;
    
    // Get all task IDs
    const pendingResult = await this.redis.zrange(`${queueKey}:pending`, 0, -1);
    const pendingIds = pendingResult.filter((_, index) => index % 2 === 0) as string[];
    const runningIds = await this.redis.smembers(`${queueKey}:running`) as string[];
    
    // Delete task data
    for (const taskId of [...pendingIds, ...runningIds]) {
      await this.redis.del(`task:${taskId}`);
    }
    
    // Delete queue data
    await this.redis.del(`${queueKey}:pending`);
    await this.redis.del(`${queueKey}:running`);
    await this.redis.del(`${queueKey}:stats`);

    console.log(`Queue ${queueId} cleared`);
  }

  /**
   * Get priority score for sorting
   */
  private getPriorityScore(priority: 'low' | 'medium' | 'high' | 'critical'): number {
    const scores = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };
    return scores[priority];
  }
}