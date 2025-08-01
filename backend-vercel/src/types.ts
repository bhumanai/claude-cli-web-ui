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