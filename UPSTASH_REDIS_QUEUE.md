# Upstash Redis Queue Management Specification

## Overview

Comprehensive design for real-time task queuing, caching, and session management using Upstash Redis as the primary queue management system for the Claude CLI Web UI serverless architecture.

## Architecture Benefits

### Why Upstash Redis?
1. **Serverless-Native**: Pay-per-request pricing model
2. **Global Distribution**: Multi-region deployment
3. **REST API**: HTTP-based access (no persistent connections)
4. **Auto-scaling**: Handles traffic spikes automatically
5. **Built-in Persistence**: Durable message queuing
6. **Cost-Effective**: $0.2 per 100k requests after free tier
7. **Zero Maintenance**: Fully managed service

## Queue Architecture Design

### Queue Structure
```
Redis Namespace: claude:queues:
├── task:priority:urgent     # Urgent priority queue (FIFO)
├── task:priority:high       # High priority queue (FIFO)  
├── task:priority:medium     # Medium priority queue (FIFO)
├── task:priority:low        # Low priority queue (FIFO)
├── processing:active        # Currently processing tasks (Hash)
├── processing:failed        # Failed task retry queue (Sorted Set)
├── processing:completed     # Completed tasks archive (TTL: 24h)
└── dlq:failed              # Dead letter queue for permanent failures
```

### Cache Structure
```
Redis Namespace: claude:cache:
├── tasks:{taskId}          # Task data cache (TTL: 1h)
├── users:{userId}          # User session data (TTL: 24h)
├── projects:{projectId}    # Project metadata (TTL: 6h)
├── results:{executionId}   # Execution results (TTL: 48h)
├── metrics:stats           # Real-time metrics (TTL: 5m)
└── config:settings         # Application settings (TTL: 1h)
```

### Pub/Sub Channels
```
Redis Channels:
├── events:tasks           # Task lifecycle events
├── events:users:{userId}  # User-specific notifications
├── events:projects        # Project-level events
├── events:system          # System-wide notifications
└── events:metrics         # Real-time metrics updates
```

## Redis Service Implementation

### Core Queue Service
```typescript
// services/RedisQueueService.ts
import { Redis } from '@upstash/redis';

export class RedisQueueService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    });
  }

  // Queue Management
  async enqueueTask(task: Task): Promise<void> {
    const queueKey = `claude:queues:task:priority:${task.priority}`;
    const taskData = JSON.stringify({
      id: task.id,
      title: task.title,
      type: task.type,
      metadata: task.metadata,
      created_at: new Date().toISOString(),
      retry_count: 0
    });

    // Add to priority queue
    await this.redis.lpush(queueKey, taskData);
    
    // Set processing timeout
    const timeoutKey = `claude:timeouts:${task.id}`;
    await this.redis.setex(timeoutKey, task.metadata.timeout || 300, task.id);
    
    // Publish event
    await this.publishEvent('tasks', {
      type: 'task:queued',
      taskId: task.id,
      priority: task.priority,
      timestamp: Date.now()
    });
    
    // Update metrics
    await this.incrementMetric('tasks_queued');
  }

  async dequeueTask(priorities: TaskPriority[] = ['urgent', 'high', 'medium', 'low']): Promise<QueuedTask | null> {
    // Check queues in priority order
    for (const priority of priorities) {
      const queueKey = `claude:queues:task:priority:${priority}`;
      const taskData = await this.redis.brpop(queueKey, 1);
      
      if (taskData) {
        const task = JSON.parse(taskData[1]);
        
        // Move to active processing
        await this.markTaskProcessing(task);
        
        return task;
      }
    }
    
    return null;
  }

  async markTaskProcessing(task: QueuedTask): Promise<void> {
    const processingKey = 'claude:queues:processing:active';
    const processingData = {
      ...task,
      processing_started: new Date().toISOString(),
      worker_id: this.generateWorkerId()
    };
    
    await this.redis.hset(processingKey, task.id, JSON.stringify(processingData));
    
    await this.publishEvent('tasks', {
      type: 'task:processing',
      taskId: task.id,
      workerId: processingData.worker_id,
      timestamp: Date.now()
    });
  }

  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    const processingKey = 'claude:queues:processing:active';
    const completedKey = 'claude:queues:processing:completed';
    
    // Move from active to completed
    const taskData = await this.redis.hget(processingKey, taskId);
    if (taskData) {
      const task = JSON.parse(taskData);
      const completedData = {
        ...task,
        result,
        completed_at: new Date().toISOString(),
        duration: Date.now() - new Date(task.processing_started).getTime()
      };
      
      await this.redis.hset(completedKey, taskId, JSON.stringify(completedData));
      await this.redis.hdel(processingKey, taskId);
      
      // Set TTL for completed tasks (24 hours)
      await this.redis.expire(completedKey, 86400);
      
      // Cache result
      await this.cacheTaskResult(taskId, result);
      
      // Publish completion event
      await this.publishEvent('tasks', {
        type: 'task:completed',
        taskId,
        result,
        duration: completedData.duration,
        timestamp: Date.now()
      });
      
      await this.incrementMetric('tasks_completed');
    }
  }

  async failTask(taskId: string, error: TaskError, retry: boolean = true): Promise<void> {
    const processingKey = 'claude:queues:processing:active';
    const failedKey = 'claude:queues:processing:failed';
    const dlqKey = 'claude:queues:dlq:failed';
    
    const taskData = await this.redis.hget(processingKey, taskId);
    if (!taskData) return;
    
    const task = JSON.parse(taskData);
    task.retry_count = (task.retry_count || 0) + 1;
    task.last_error = error;
    task.failed_at = new Date().toISOString();
    
    // Remove from active processing
    await this.redis.hdel(processingKey, taskId);
    
    if (retry && task.retry_count < 3) {
      // Add to retry queue with exponential backoff
      const retryDelay = Math.pow(2, task.retry_count) * 60; // 2m, 4m, 8m
      const retryTime = Date.now() + (retryDelay * 1000);
      
      await this.redis.zadd(failedKey, retryTime, JSON.stringify(task));
      
      await this.publishEvent('tasks', {
        type: 'task:retry_scheduled',
        taskId,
        retryCount: task.retry_count,
        retryTime,
        timestamp: Date.now()
      });
    } else {
      // Move to dead letter queue
      await this.redis.lpush(dlqKey, JSON.stringify(task));
      
      await this.publishEvent('tasks', {
        type: 'task:failed_permanently',
        taskId,
        error,
        retryCount: task.retry_count,
        timestamp: Date.now()
      });
      
      await this.incrementMetric('tasks_failed');
    }
  }

  // Retry mechanism
  async processRetries(): Promise<void> {
    const failedKey = 'claude:queues:processing:failed';
    const currentTime = Date.now();
    
    // Get tasks ready for retry
    const readyTasks = await this.redis.zrangebyscore(
      failedKey, 
      0, 
      currentTime,
      { withScores: true }
    );
    
    for (let i = 0; i < readyTasks.length; i += 2) {
      const taskData = readyTasks[i];
      const score = readyTasks[i + 1];
      
      const task = JSON.parse(taskData);
      
      // Re-queue the task
      await this.enqueueTask(task);
      
      // Remove from retry queue
      await this.redis.zrem(failedKey, taskData);
    }
  }

  // Dead Letter Queue Management
  async getDeadLetterTasks(limit: number = 50): Promise<QueuedTask[]> {
    const dlqKey = 'claude:queues:dlq:failed';
    const tasks = await this.redis.lrange(dlqKey, 0, limit - 1);
    return tasks.map(task => JSON.parse(task));
  }

  async requeueDeadLetterTask(taskId: string): Promise<boolean> {
    const dlqKey = 'claude:queues:dlq:failed';
    const tasks = await this.redis.lrange(dlqKey, 0, -1);
    
    for (let i = 0; i < tasks.length; i++) {
      const task = JSON.parse(tasks[i]);
      if (task.id === taskId) {
        // Reset retry count and re-queue
        task.retry_count = 0;
        delete task.last_error;
        delete task.failed_at;
        
        await this.enqueueTask(task);
        await this.redis.lrem(dlqKey, 1, tasks[i]);
        
        return true;
      }
    }
    
    return false;
  }

  private generateWorkerId(): string {
    return `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### Caching Service
```typescript
// services/RedisCacheService.ts
export class RedisCacheService {
  private redis: Redis;
  private readonly DEFAULT_TTL = 3600; // 1 hour
  
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    });
  }

  // Task Caching
  async cacheTask(task: Task): Promise<void> {
    const key = `claude:cache:tasks:${task.id}`;
    await this.redis.setex(key, this.DEFAULT_TTL, JSON.stringify(task));
  }

  async getCachedTask(taskId: string): Promise<Task | null> {
    const key = `claude:cache:tasks:${taskId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async invalidateTask(taskId: string): Promise<void> {
    const key = `claude:cache:tasks:${taskId}`;
    await this.redis.del(key);
  }

  // User Session Caching
  async cacheUserSession(userId: string, sessionData: UserSession): Promise<void> {
    const key = `claude:cache:users:${userId}`;
    await this.redis.setex(key, 86400, JSON.stringify(sessionData)); // 24 hours
  }

  async getCachedUserSession(userId: string): Promise<UserSession | null> {
    const key = `claude:cache:users:${userId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Result Caching
  async cacheTaskResult(taskId: string, result: TaskResult): Promise<void> {
    const key = `claude:cache:results:${taskId}`;
    await this.redis.setex(key, 172800, JSON.stringify(result)); // 48 hours
  }

  async getCachedResult(taskId: string): Promise<TaskResult | null> {
    const key = `claude:cache:results:${taskId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Metrics Caching
  async cacheMetrics(metrics: SystemMetrics): Promise<void> {
    const key = 'claude:cache:metrics:stats';
    await this.redis.setex(key, 300, JSON.stringify(metrics)); // 5 minutes
  }

  async getCachedMetrics(): Promise<SystemMetrics | null> {
    const key = 'claude:cache:metrics:stats';
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Bulk Operations
  async mget(keys: string[]): Promise<(string | null)[]> {
    const fullKeys = keys.map(key => `claude:cache:${key}`);
    return await this.redis.mget(...fullKeys);
  }

  async mset(keyValues: Record<string, any>, ttl: number = this.DEFAULT_TTL): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    Object.entries(keyValues).forEach(([key, value]) => {
      const fullKey = `claude:cache:${key}`;
      pipeline.setex(fullKey, ttl, JSON.stringify(value));
    });
    
    await pipeline.exec();
  }

  // Cache Statistics
  async getCacheStats(): Promise<CacheStats> {
    const info = await this.redis.info();
    const stats = this.parseRedisInfo(info);
    
    return {
      hits: stats.keyspace_hits || 0,
      misses: stats.keyspace_misses || 0,
      hitRate: stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses) || 0,
      memory: stats.used_memory_human || '0B',
      connections: stats.connected_clients || 0,
      operations: stats.total_commands_processed || 0
    };
  }

  private parseRedisInfo(info: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':') && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }
    
    return result;
  }
}
```

### Pub/Sub Service
```typescript
// services/RedisPubSubService.ts
export class RedisPubSubService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    });
  }

  async publishEvent(channel: string, event: any): Promise<void> {
    const channelKey = `claude:events:${channel}`;
    const eventData = {
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now(),
      channel
    };
    
    await this.redis.publish(channelKey, JSON.stringify(eventData));
  }

  async publishUserEvent(userId: string, event: any): Promise<void> {
    await this.publishEvent(`users:${userId}`, event);
  }

  async publishSystemEvent(event: any): Promise<void> {
    await this.publishEvent('system', event);
  }

  // Server-Sent Events integration
  async subscribeToUserEvents(userId: string, onMessage: (event: any) => void): Promise<() => void> {
    const channelKey = `claude:events:users:${userId}`;
    
    // Use Redis Streams for reliable message delivery
    const streamKey = `${channelKey}:stream`;
    const consumerGroup = `consumer:${userId}`;
    const consumerName = `consumer:${Date.now()}`;
    
    try {
      // Create consumer group if it doesn't exist
      await this.redis.xgroup('CREATE', streamKey, consumerGroup, '$', 'MKSTREAM');
    } catch {
      // Consumer group already exists
    }
    
    // Start consuming messages
    const consume = async () => {
      try {
        const messages = await this.redis.xreadgroup(
          'GROUP',
          consumerGroup,
          consumerName,
          'COUNT',
          10,
          'BLOCK',
          1000,
          'STREAMS',
          streamKey,
          '>'
        );
        
        if (messages && messages.length > 0) {
          for (const [stream, entries] of messages) {
            for (const [id, fields] of entries) {
              const event = this.parseStreamEntry(fields);
              onMessage(event);
              
              // Acknowledge message
              await this.redis.xack(streamKey, consumerGroup, id);
            }
          }
        }
      } catch (error) {
        console.error('Error consuming messages:', error);
      }
      
      // Continue consuming
      setImmediate(consume);
    };
    
    consume();
    
    // Return cleanup function
    return () => {
      // Consumer cleanup would happen here
    };
  }

  private parseStreamEntry(fields: string[]): any {
    const event: any = {};
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
      
      try {
        event[key] = JSON.parse(value);
      } catch {
        event[key] = value;
      }
    }
    return event;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## Queue Monitoring & Metrics

### Metrics Collection
```typescript
// services/RedisMetricsService.ts
export class RedisMetricsService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    });
  }

  async incrementMetric(metric: string, value: number = 1): Promise<void> {
    const key = `claude:metrics:${metric}`;
    await this.redis.incrby(key, value);
    
    // Set expiry for daily metrics
    await this.redis.expire(key, 86400);
  }

  async setGaugeMetric(metric: string, value: number): Promise<void> {
    const key = `claude:metrics:gauge:${metric}`;
    await this.redis.set(key, value);
    await this.redis.expire(key, 3600);
  }

  async getQueueMetrics(): Promise<QueueMetrics> {
    const pipeline = this.redis.pipeline();
    
    // Queue lengths
    pipeline.llen('claude:queues:task:priority:urgent');
    pipeline.llen('claude:queues:task:priority:high');
    pipeline.llen('claude:queues:task:priority:medium');
    pipeline.llen('claude:queues:task:priority:low');
    
    // Processing counts
    pipeline.hlen('claude:queues:processing:active');
    pipeline.zcard('claude:queues:processing:failed');
    pipeline.llen('claude:queues:dlq:failed');
    
    // Metrics counters
    pipeline.get('claude:metrics:tasks_queued');
    pipeline.get('claude:metrics:tasks_completed');
    pipeline.get('claude:metrics:tasks_failed');
    
    const results = await pipeline.exec();
    
    return {
      queues: {
        urgent: results[0][1] as number,
        high: results[1][1] as number,
        medium: results[2][1] as number,
        low: results[3][1] as number
      },
      processing: {
        active: results[4][1] as number,
        failed: results[5][1] as number,
        dead_letter: results[6][1] as number
      },
      counters: {
        queued: parseInt(results[7][1] as string) || 0,
        completed: parseInt(results[8][1] as string) || 0,
        failed: parseInt(results[9][1] as string) || 0
      }
    };
  }

  async calculateThroughputMetrics(): Promise<ThroughputMetrics> {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Get completed tasks from the last hour and day
    const completedKey = 'claude:queues:processing:completed';
    const allCompleted = await this.redis.hgetall(completedKey);
    
    let hourlyCompleted = 0;
    let dailyCompleted = 0;
    let totalProcessingTime = 0;
    let count = 0;
    
    Object.values(allCompleted).forEach(taskData => {
      const task = JSON.parse(taskData);
      const completedAt = new Date(task.completed_at).getTime();
      
      if (completedAt > oneHourAgo) {
        hourlyCompleted++;
      }
      if (completedAt > oneDayAgo) {
        dailyCompleted++;
        totalProcessingTime += task.duration || 0;
        count++;
      }
    });
    
    return {
      tasks_per_hour: hourlyCompleted,
      tasks_per_day: dailyCompleted,
      avg_processing_time: count > 0 ? totalProcessingTime / count : 0,
      throughput_trend: await this.calculateThroughputTrend()
    };
  }

  private async calculateThroughputTrend(): Promise<number[]> {
    // Calculate hourly throughput for the last 24 hours
    const hours = [];
    const now = Date.now();
    
    for (let i = 23; i >= 0; i--) {
      const hourStart = now - (i * 60 * 60 * 1000);
      const hourEnd = hourStart + (60 * 60 * 1000);
      
      // Count completed tasks in this hour
      let count = 0;
      const completedKey = 'claude:queues:processing:completed';
      const allCompleted = await this.redis.hgetall(completedKey);
      
      Object.values(allCompleted).forEach(taskData => {
        const task = JSON.parse(taskData);
        const completedAt = new Date(task.completed_at).getTime();
        
        if (completedAt >= hourStart && completedAt < hourEnd) {
          count++;
        }
      });
      
      hours.push(count);
    }
    
    return hours;
  }
}
```

## API Integration

### Queue API Endpoints
```typescript
// api/queue/status.ts
export async function GET() {
  const queueService = new RedisQueueService();
  const metricsService = new RedisMetricsService();
  
  const [queueMetrics, throughputMetrics] = await Promise.all([
    metricsService.getQueueMetrics(),
    metricsService.calculateThroughputMetrics()
  ]);
  
  return NextResponse.json({
    queue_metrics: queueMetrics,
    throughput_metrics: throughputMetrics,
    timestamp: Date.now()
  });
}

// api/queue/retry.ts
export async function POST(request: NextRequest) {
  const { task_id } = await request.json();
  const queueService = new RedisQueueService();
  
  const success = await queueService.requeueDeadLetterTask(task_id);
  
  return NextResponse.json({ 
    success,
    message: success ? 'Task requeued successfully' : 'Task not found in dead letter queue'
  });
}

// api/queue/dead-letter.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  
  const queueService = new RedisQueueService();
  const tasks = await queueService.getDeadLetterTasks(limit);
  
  return NextResponse.json({ tasks });
}
```

## Performance Optimization

### Connection Pooling
```typescript
// services/RedisConnectionPool.ts
class RedisConnectionPool {
  private static instance: RedisConnectionPool;
  private connections: Redis[] = [];
  private readonly MAX_CONNECTIONS = 10;
  
  static getInstance(): RedisConnectionPool {
    if (!RedisConnectionPool.instance) {
      RedisConnectionPool.instance = new RedisConnectionPool();
    }
    return RedisConnectionPool.instance;
  }
  
  getConnection(): Redis {
    if (this.connections.length < this.MAX_CONNECTIONS) {
      const connection = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!
      });
      this.connections.push(connection);
      return connection;
    }
    
    // Round-robin connection selection
    const index = Math.floor(Math.random() * this.connections.length);
    return this.connections[index];
  }
}
```

### Pipeline Operations
```typescript
async function batchEnqueueTasks(tasks: Task[]): Promise<void> {
  const redis = new Redis(/* config */);
  const pipeline = redis.pipeline();
  
  tasks.forEach(task => {
    const queueKey = `claude:queues:task:priority:${task.priority}`;
    pipeline.lpush(queueKey, JSON.stringify(task));
  });
  
  await pipeline.exec();
}
```

## Cost Optimization Strategies

### Request Batching
```typescript
// Batch multiple Redis operations to reduce request count
async function batchOperations(operations: RedisOperation[]): Promise<any[]> {
  const redis = new Redis(/* config */);
  const pipeline = redis.pipeline();
  
  operations.forEach(op => {
    pipeline[op.command](...op.args);
  });
  
  return await pipeline.exec();
}
```

### Smart Caching
```typescript
// Implement intelligent cache warming and invalidation
async function warmCache(frequentlyAccessedKeys: string[]): Promise<void> {
  const redis = new Redis(/* config */);
  const pipeline = redis.pipeline();
  
  frequentlyAccessedKeys.forEach(key => {
    pipeline.get(key);
  });
  
  const results = await pipeline.exec();
  
  // Pre-populate cache with fresh data if stale
  for (let i = 0; i < results.length; i++) {
    if (!results[i][1]) {
      // Cache miss - fetch fresh data
      const freshData = await fetchFreshData(frequentlyAccessedKeys[i]);
      await redis.setex(frequentlyAccessedKeys[i], 3600, JSON.stringify(freshData));
    }
  }
}
```

## Error Handling & Resilience

### Circuit Breaker Pattern
```typescript
class RedisCircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 30000; // 30 seconds
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is OPEN');
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private isOpen(): boolean {
    if (this.failures >= this.FAILURE_THRESHOLD) {
      return Date.now() - this.lastFailureTime < this.RECOVERY_TIMEOUT;
    }
    return false;
  }
  
  private onSuccess(): void {
    this.failures = 0;
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }
}
```

## Monitoring Dashboard

### Real-time Queue Dashboard
```typescript
// components/QueueDashboard.tsx
export function QueueDashboard() {
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  
  useEffect(() => {
    const eventSource = new EventSource('/api/sse/queue-metrics');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMetrics(data);
    };
    
    return () => eventSource.close();
  }, []);
  
  return (
    <div className="queue-dashboard">
      <div className="queue-lengths">
        <h3>Queue Lengths</h3>
        <div className="queue-stats">
          <div className="queue-stat urgent">
            Urgent: {metrics?.queues.urgent || 0}
          </div>
          <div className="queue-stat high">
            High: {metrics?.queues.high || 0}
          </div>
          <div className="queue-stat medium">
            Medium: {metrics?.queues.medium || 0}
          </div>
          <div className="queue-stat low">
            Low: {metrics?.queues.low || 0}
          </div>
        </div>
      </div>
      
      <div className="processing-stats">
        <h3>Processing</h3>
        <div className="processing-counts">
          <div>Active: {metrics?.processing.active || 0}</div>
          <div>Failed: {metrics?.processing.failed || 0}</div>
          <div>Dead Letter: {metrics?.processing.dead_letter || 0}</div>
        </div>
      </div>
    </div>
  );
}
```

This Upstash Redis queue management system provides a robust, scalable, and cost-effective foundation for real-time task processing with comprehensive monitoring and resilience features.