/**
 * Type definitions for backend-vercel
 */

export type TaskStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'queued' 
  | 'timeout' 
  | 'blocked';

export interface Task {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  command?: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: Date;
  updated_at: Date;
  scheduled_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  timeout?: number;
  max_retries?: number;
  retry_count?: number;
  github_issue_number?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubConnection {
  id: string;
  repository: string;
  username: string;
  connected_at: string;
  project_id: string;
  status: 'active' | 'inactive';
}

// Additional types needed by other modules
export interface ApiResponse<T = any> {
  data: T | null;
  error: {
    message: string;
    code: string;
  } | null;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  created_at: string;
  user_id?: string; // For backwards compatibility
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface TaskCreateRequest {
  name: string;
  description?: string;
  command?: string;
  priority?: TaskPriority;
  project_id: string;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SSEMessage {
  type: string;
  data: any;
  id?: string;
  retry?: number;
  event?: string; // For SSE events
  timestamp?: Date; // For event timestamps
}

export interface QueueStatus {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  completed_tasks?: number; // Legacy field
  failed_tasks?: number; // Legacy field
}

export interface TerragoWorker {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  capabilities: string[];
}