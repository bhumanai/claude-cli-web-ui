/**
 * Core types for Claude CLI Vercel backend
 */

export interface User {
  user_id: string;
  username: string;
  is_active: boolean;
  permissions: string[];
  last_login?: Date;
  created_at: Date;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Task {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  command: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: Date;
  updated_at: Date;
  scheduled_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  timeout?: number;
  max_retries?: number;
  retry_count?: number;
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  error_message?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  parent_task_id?: string;
  worker_id?: string;
  github_issue_number?: number;
}

export type TaskStatus = 
  | 'pending' 
  | 'queued' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'timeout';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Project {
  id: string;
  name: string;
  description?: string;
  github_repo?: string;
  created_at: Date;
  updated_at: Date;
  status: 'active' | 'archived';
  metadata?: Record<string, any>;
}

export interface TaskQueue {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  max_concurrent_tasks: number;
  created_at: Date;
  updated_at: Date;
  status: 'active' | 'paused' | 'disabled';
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  created_at: string;
  updated_at: string;
  assignees: string[];
}

export interface TerragoWorker {
  id: string;
  name: string;
  status: 'creating' | 'running' | 'stopping' | 'stopped' | 'failed';
  created_at: Date;
  task_id: string;
  callback_url?: string;
  cost_estimate: number;
}

export interface SSEMessage {
  id: string;
  event: string;
  data: Record<string, any>;
  timestamp: Date;
}

export interface QueueStatus {
  id: string;
  name: string;
  pending_tasks: number;
  running_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  active_workers: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  window: number;
}

export interface ApiResponse<T = any> {
  data: T | null;
  error: {
    message: string;
    code: string;
    details?: Record<string, any>;
  } | null;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
    rate_limit?: RateLimitInfo;
  };
}

export interface CommandExecution {
  id: string;
  session_id: string;
  command: string;
  status: 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  started_at: Date;
  completed_at?: Date;
  exit_code?: number;
}

export interface Session {
  id: string;
  user_id: string;
  created_at: Date;
  last_activity: Date;
  status: 'active' | 'inactive' | 'expired';
  metadata?: Record<string, any>;
}

// Request/Response schemas
export interface LoginRequest {
  username: string;
  password: string;
}

export interface TaskCreateRequest {
  project_id: string;
  name: string;
  command: string;
  description?: string;
  priority?: TaskPriority;
  scheduled_at?: string;
  timeout?: number;
  max_retries?: number;
  input_data?: Record<string, any>;
  tags?: string[];
  metadata?: Record<string, any>;
  parent_task_id?: string;
}

export interface TaskUpdateRequest {
  name?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  scheduled_at?: string;
  timeout?: number;
  max_retries?: number;
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  error_message?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProjectCreateRequest {
  name: string;
  description?: string;
  github_repo?: string;
  metadata?: Record<string, any>;
}

export interface QueueCreateRequest {
  name: string;
  description?: string;
  project_id: string;
  max_concurrent_tasks?: number;
}