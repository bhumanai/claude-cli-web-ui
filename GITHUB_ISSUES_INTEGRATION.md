# GitHub Issues Integration Specification

## Overview

Comprehensive specification for using GitHub Issues as the primary task persistence layer for the Claude CLI Web UI, providing durable storage, audit trails, and collaboration features.

## Architecture Benefits

### Why GitHub Issues?
1. **Free Tier**: 60,000 API requests/hour
2. **Built-in Audit Trail**: Complete history of all changes
3. **Collaboration Features**: Comments, assignees, labels, milestones
4. **Search & Filtering**: Advanced query capabilities
5. **Webhooks**: Real-time notifications
6. **Backup & Recovery**: Built-in version control
7. **No Infrastructure**: Fully managed service

## Data Model Mapping

### Task Entity to GitHub Issue
```typescript
interface Task {
  id: string;                    // GitHub issue number (string)
  title: string;                 // GitHub issue title
  description: string;           // GitHub issue body (JSON metadata)
  status: TaskStatus;            // GitHub labels: status:pending, status:running, etc.
  priority: TaskPriority;        // GitHub labels: priority:high, priority:medium, etc.
  type: TaskType;               // GitHub labels: type:command, type:chain, etc.
  assignee: string | null;      // GitHub issue assignee
  project_id: string;           // GitHub labels: project:project-id
  created_at: string;           // GitHub issue created_at
  updated_at: string;           // GitHub issue updated_at
  metadata: TaskMetadata;       // JSON in issue body
}

interface TaskMetadata {
  command?: string;
  environment?: Record<string, string>;
  timeout?: number;
  retry_count?: number;
  execution_history?: ExecutionRecord[];
  terragon_execution_id?: string;
  parent_task_id?: string;
  child_task_ids?: string[];
}
```

### Label Schema
```typescript
enum TaskStatus {
  PENDING = "pending",
  QUEUED = "queued", 
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled"
}

enum TaskPriority {
  LOW = "low",
  MEDIUM = "medium", 
  HIGH = "high",
  URGENT = "urgent"
}

enum TaskType {
  COMMAND = "command",
  CHAIN = "chain",
  WORKFLOW = "workflow",
  TERRAGON = "terragon"
}

// GitHub Labels
const LABELS = {
  // Status Labels
  "status:pending": { color: "fbca04", description: "Task is pending execution" },
  "status:queued": { color: "0e8a16", description: "Task is queued for execution" },
  "status:running": { color: "1d76db", description: "Task is currently running" },
  "status:completed": { color: "28a745", description: "Task completed successfully" },
  "status:failed": { color: "d73a49", description: "Task failed to complete" },
  "status:cancelled": { color: "6f42c1", description: "Task was cancelled" },
  
  // Priority Labels  
  "priority:low": { color: "c2e0c6", description: "Low priority task" },
  "priority:medium": { color: "fbca04", description: "Medium priority task" },
  "priority:high": { color: "ff9500", description: "High priority task" },
  "priority:urgent": { color: "d73a49", description: "Urgent priority task" },
  
  // Type Labels
  "type:command": { color: "0052cc", description: "Single command execution" },
  "type:chain": { color: "5319e7", description: "Multi-step task chain" },
  "type:workflow": { color: "b60205", description: "Complex workflow" },
  "type:terragon": { color: "0e8a16", description: "Terragon API execution" }
};
```

## GitHub Repository Structure

### Repository Setup
```bash
# Create dedicated task repository
Repository: claude-tasks
Description: Task storage and management for Claude CLI Web UI
Settings:
  - Private repository
  - Issues enabled
  - Wiki disabled
  - Discussions disabled
  - Projects enabled (for kanban boards)
```

### Branch Protection
```json
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

### Issue Templates
```yaml
# .github/ISSUE_TEMPLATE/task.yml
name: Task Creation
description: Create a new task for execution
title: "[TASK] "
labels: ["status:pending", "priority:medium"]
body:
  - type: input
    id: task-title
    attributes:
      label: Task Title
      description: Brief description of the task
      placeholder: "Execute Claude command..."
    validations:
      required: true
      
  - type: dropdown
    id: priority
    attributes:
      label: Priority
      description: Task execution priority
      options:
        - low
        - medium
        - high
        - urgent
      default: 1
    validations:
      required: true
      
  - type: dropdown
    id: type
    attributes:
      label: Task Type
      options:
        - command
        - chain
        - workflow
        - terragon
      default: 0
    validations:
      required: true
      
  - type: textarea
    id: metadata
    attributes:
      label: Task Metadata
      description: JSON metadata for task execution
      placeholder: '{"command": "/help", "timeout": 300}'
    validations:
      required: true
```

## API Implementation

### GitHub Service Class
```typescript
// services/GitHubService.ts
import { Octokit } from '@octokit/rest';

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      baseUrl: 'https://api.github.com'
    });
    this.owner = process.env.GITHUB_OWNER!;
    this.repo = process.env.GITHUB_REPO!;
  }

  async createTask(taskData: CreateTaskRequest): Promise<Task> {
    const labels = [
      `status:${taskData.status}`,
      `priority:${taskData.priority}`,
      `type:${taskData.type}`,
      ...(taskData.project_id ? [`project:${taskData.project_id}`] : [])
    ];

    const issueBody = {
      description: taskData.description,
      metadata: taskData.metadata,
      created_by: taskData.user_id,
      created_at: new Date().toISOString()
    };

    const issue = await this.octokit.rest.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: taskData.title,
      body: JSON.stringify(issueBody, null, 2),
      labels,
      assignee: taskData.assignee
    });

    return this.mapIssueToTask(issue.data);
  }

  async updateTask(taskId: string, updates: UpdateTaskRequest): Promise<Task> {
    const issueNumber = parseInt(taskId);
    
    // Get current issue to preserve existing data
    const currentIssue = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    const currentBody = JSON.parse(currentIssue.data.body || '{}');
    const updatedBody = {
      ...currentBody,
      ...updates.metadata,
      updated_at: new Date().toISOString()
    };

    // Update labels if status/priority changed
    const newLabels = currentIssue.data.labels
      .map(label => typeof label === 'string' ? label : label.name!)
      .filter(label => !label.startsWith('status:') && !label.startsWith('priority:'));

    if (updates.status) {
      newLabels.push(`status:${updates.status}`);
    }
    if (updates.priority) {
      newLabels.push(`priority:${updates.priority}`);
    }

    const updatedIssue = await this.octokit.rest.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      title: updates.title || currentIssue.data.title,
      body: JSON.stringify(updatedBody, null, 2),
      labels: newLabels,
      assignee: updates.assignee,
      state: updates.status === 'completed' ? 'closed' : 'open'
    });

    return this.mapIssueToTask(updatedIssue.data);
  }

  async getTask(taskId: string): Promise<Task | null> {
    try {
      const issue = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: parseInt(taskId)
      });

      return this.mapIssueToTask(issue.data);
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getTasks(filters: TaskFilters = {}): Promise<Task[]> {
    const params: any = {
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: filters.limit || 50,
      page: filters.page || 1
    };

    // Add label filters
    const labelFilters = [];
    if (filters.status) labelFilters.push(`status:${filters.status}`);
    if (filters.priority) labelFilters.push(`priority:${filters.priority}`);
    if (filters.type) labelFilters.push(`type:${filters.type}`);
    if (filters.project_id) labelFilters.push(`project:${filters.project_id}`);

    if (labelFilters.length > 0) {
      params.labels = labelFilters.join(',');
    }

    // Add assignee filter
    if (filters.assignee) {
      params.assignee = filters.assignee;
    }

    const response = await this.octokit.rest.issues.listForRepo(params);
    return response.data.map(issue => this.mapIssueToTask(issue));
  }

  async searchTasks(query: string): Promise<Task[]> {
    const searchQuery = `repo:${this.owner}/${this.repo} ${query} is:issue`;
    
    const response = await this.octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      sort: 'updated',
      order: 'desc'
    });

    return response.data.items.map(issue => this.mapIssueToTask(issue));
  }

  async addTaskComment(taskId: string, comment: string, user: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(taskId),
      body: `**${user}**: ${comment}\n\n*Posted via Claude CLI Web UI*`
    });
  }

  async getTaskComments(taskId: string): Promise<TaskComment[]> {
    const response = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(taskId)
    });

    return response.data.map(comment => ({
      id: comment.id.toString(),
      body: comment.body!,
      author: comment.user!.login,
      created_at: comment.created_at,
      updated_at: comment.updated_at
    }));
  }

  private mapIssueToTask(issue: any): Task {
    const labels = issue.labels.map(label => 
      typeof label === 'string' ? label : label.name
    );

    const status = labels.find(label => label.startsWith('status:'))?.split(':')[1] || 'pending';
    const priority = labels.find(label => label.startsWith('priority:'))?.split(':')[1] || 'medium';
    const type = labels.find(label => label.startsWith('type:'))?.split(':')[1] || 'command';
    const project_id = labels.find(label => label.startsWith('project:'))?.split(':')[1];

    let metadata = {};
    try {
      const bodyData = JSON.parse(issue.body || '{}');
      metadata = bodyData.metadata || {};
    } catch {
      // If body is not JSON, treat as plain text description
      metadata = { description: issue.body };
    }

    return {
      id: issue.number.toString(),
      title: issue.title,
      description: issue.body || '',
      status: status as TaskStatus,
      priority: priority as TaskPriority,
      type: type as TaskType,
      assignee: issue.assignee?.login || null,
      project_id: project_id || null,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      metadata
    };
  }
}
```

### Webhook Handler
```typescript
// api/webhooks/github.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  
  // Verify webhook signature
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex')}`;
    
  if (signature !== expectedSignature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);
  
  // Handle different webhook events
  switch (payload.action) {
    case 'opened':
      await handleTaskCreated(payload.issue);
      break;
    case 'edited':
      await handleTaskUpdated(payload.issue);
      break;
    case 'closed':
      await handleTaskCompleted(payload.issue);
      break;
    case 'labeled':
    case 'unlabeled':
      await handleTaskLabelChanged(payload.issue);
      break;
    case 'assigned':
    case 'unassigned':
      await handleTaskAssignmentChanged(payload.issue);
      break;
  }

  return NextResponse.json({ success: true });
}

async function handleTaskCreated(issue: any) {
  // Notify real-time listeners
  await publishEvent('task:created', {
    taskId: issue.number.toString(),
    title: issue.title,
    status: 'pending'
  });
}

async function handleTaskUpdated(issue: any) {
  await publishEvent('task:updated', {
    taskId: issue.number.toString(),
    title: issue.title,
    updatedAt: issue.updated_at
  });
}

async function publishEvent(event: string, data: any) {
  // Publish to Redis for real-time updates
  const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL);
  await redis.publish('github:events', JSON.stringify({ event, data }));
}
```

## API Endpoints

### Task Management Endpoints
```typescript
// api/tasks/index.ts - List tasks
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filters = {
    status: searchParams.get('status'),
    priority: searchParams.get('priority'),
    type: searchParams.get('type'),
    project_id: searchParams.get('project_id'),
    assignee: searchParams.get('assignee'),
    limit: parseInt(searchParams.get('limit') || '50'),
    page: parseInt(searchParams.get('page') || '1')
  };

  const github = new GitHubService();
  const tasks = await github.getTasks(filters);
  
  return NextResponse.json({ tasks });
}

// api/tasks/index.ts - Create task
export async function POST(request: NextRequest) {
  const taskData = await request.json();
  
  const github = new GitHubService();
  const task = await github.createTask(taskData);
  
  return NextResponse.json({ task }, { status: 201 });
}

// api/tasks/[id].ts - Get specific task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const github = new GitHubService();
  const task = await github.getTask(params.id);
  
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  
  return NextResponse.json({ task });
}

// api/tasks/[id].ts - Update task
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const updates = await request.json();
  
  const github = new GitHubService();
  const task = await github.updateTask(params.id, updates);
  
  return NextResponse.json({ task });
}

// api/tasks/search.ts - Search tasks
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  
  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }
  
  const github = new GitHubService();
  const tasks = await github.searchTasks(query);
  
  return NextResponse.json({ tasks });
}
```

## Advanced Features

### Task Relationships
```typescript
// Support for parent-child task relationships
interface TaskRelationship {
  parent_task_id?: string;
  child_task_ids?: string[];
  dependency_task_ids?: string[];
  blocks_task_ids?: string[];
}

async function createChildTask(parentId: string, childData: CreateTaskRequest): Promise<Task> {
  // Update parent task with child reference
  const parent = await github.getTask(parentId);
  const childIds = parent.metadata.child_task_ids || [];
  
  // Create child task
  const child = await github.createTask({
    ...childData,
    metadata: {
      ...childData.metadata,
      parent_task_id: parentId
    }
  });
  
  // Update parent with child reference
  await github.updateTask(parentId, {
    metadata: {
      ...parent.metadata,
      child_task_ids: [...childIds, child.id]
    }
  });
  
  return child;
}
```

### Task Templates
```typescript
// Predefined task templates for common operations
const TASK_TEMPLATES = {
  'claude-help': {
    title: 'Claude Help Command',
    type: 'command',
    priority: 'low',
    metadata: {
      command: '/help',
      timeout: 30
    }
  },
  'project-init': {
    title: 'Initialize New Project',
    type: 'chain',
    priority: 'medium',
    metadata: {
      commands: ['/init-project', '/smart-task', '/test-task'],
      timeout: 600
    }
  },
  'security-audit': {
    title: 'Security Audit Chain',
    type: 'workflow',
    priority: 'high',
    metadata: {
      workflow: 'security-audit',
      phases: ['scan', 'analyze', 'report'],
      timeout: 1800
    }
  }
};

async function createTaskFromTemplate(templateId: string, overrides: Partial<CreateTaskRequest>): Promise<Task> {
  const template = TASK_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }
  
  const taskData = {
    ...template,
    ...overrides,
    metadata: {
      ...template.metadata,
      ...overrides.metadata,
      template_id: templateId
    }
  };
  
  return await github.createTask(taskData);
}
```

### Bulk Operations
```typescript
// Bulk task operations
async function bulkUpdateTasks(taskIds: string[], updates: Partial<UpdateTaskRequest>): Promise<Task[]> {
  const results = await Promise.all(
    taskIds.map(id => github.updateTask(id, updates))
  );
  
  return results;
}

async function bulkDeleteTasks(taskIds: string[]): Promise<void> {
  await Promise.all(
    taskIds.map(id => github.updateTask(id, { status: 'cancelled' }))
  );
}
```

## Performance Optimization

### Caching Strategy
```typescript
// Cache frequently accessed tasks
const CACHE_TTL = 300; // 5 minutes

async function getCachedTask(taskId: string): Promise<Task | null> {
  const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL);
  const cached = await redis.get(`task:${taskId}`);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const task = await github.getTask(taskId);
  if (task) {
    await redis.setex(`task:${taskId}`, CACHE_TTL, JSON.stringify(task));
  }
  
  return task;
}

async function invalidateTaskCache(taskId: string): Promise<void> {
  const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL);
  await redis.del(`task:${taskId}`);
}
```

### Batch API Requests
```typescript
// Batch multiple GitHub API requests
async function batchGetTasks(taskIds: string[]): Promise<Task[]> {
  const batches = [];
  const batchSize = 10;
  
  for (let i = 0; i < taskIds.length; i += batchSize) {
    const batch = taskIds.slice(i, i + batchSize);
    batches.push(
      Promise.all(batch.map(id => github.getTask(id)))
    );
  }
  
  const results = await Promise.all(batches);
  return results.flat().filter(task => task !== null);
}
```

## Error Handling & Resilience

### Retry Logic
```typescript
async function retryableGitHubOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  backoffMs: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, backoffMs * Math.pow(2, attempt - 1))
      );
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### Rate Limit Handling
```typescript
async function handleRateLimit(error: any): Promise<void> {
  if (error.status === 403 && error.response?.headers['x-ratelimit-remaining'] === '0') {
    const resetTime = parseInt(error.response.headers['x-ratelimit-reset']) * 1000;
    const waitTime = resetTime - Date.now();
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}
```

## Security Considerations

### Access Control
```typescript
// Ensure users can only access their own tasks
async function validateTaskAccess(taskId: string, userId: string): Promise<boolean> {
  const task = await github.getTask(taskId);
  
  if (!task) {
    return false;
  }
  
  // Check if user created the task or is assigned to it
  const metadata = JSON.parse(task.description);
  return metadata.created_by === userId || task.assignee === userId;
}
```

### Data Sanitization
```typescript
function sanitizeTaskData(data: any): any {
  // Remove sensitive fields
  const sanitized = { ...data };
  delete sanitized.github_token;
  delete sanitized.api_keys;
  delete sanitized.secrets;
  
  // Validate required fields
  if (!sanitized.title || sanitized.title.length > 256) {
    throw new Error('Invalid task title');
  }
  
  return sanitized;
}
```

## Monitoring & Analytics

### Task Metrics
```typescript
interface TaskMetrics {
  total_tasks: number;
  tasks_by_status: Record<TaskStatus, number>;
  tasks_by_priority: Record<TaskPriority, number>;
  avg_completion_time: number;
  success_rate: number;
}

async function getTaskMetrics(timeRange: string = '24h'): Promise<TaskMetrics> {
  const since = new Date(Date.now() - parseTimeRange(timeRange));
  
  // Use GitHub API to get task statistics
  const tasks = await github.getTasks({
    since: since.toISOString(),
    limit: 1000
  });
  
  return {
    total_tasks: tasks.length,
    tasks_by_status: groupBy(tasks, 'status'),
    tasks_by_priority: groupBy(tasks, 'priority'),
    avg_completion_time: calculateAvgCompletionTime(tasks),
    success_rate: calculateSuccessRate(tasks)
  };
}
```

This GitHub Issues integration provides a robust, scalable, and cost-effective task persistence layer with built-in collaboration features and audit trails.