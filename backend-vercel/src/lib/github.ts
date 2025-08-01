/**
 * GitHub Issues integration for task persistence
 */

import { Octokit } from '@octokit/rest';
import { Task, GitHubIssue, TaskStatus } from '../types';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'claude-cli';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'tasks';

export class GitHubService {
  private octokit: Octokit;

  constructor() {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    this.octokit = new Octokit({
      auth: GITHUB_TOKEN,
    });
  }

  /**
   * Create GitHub issue for task
   */
  async createTaskIssue(task: Task): Promise<number> {
    const title = `[Task] ${task.name}`;
    const body = this.formatTaskBody(task);
    const labels = this.getTaskLabels(task);

    try {
      const response = await this.octokit.rest.issues.create({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        title,
        body,
        labels,
      });

      return response.data.number;
    } catch (error) {
      console.error('Error creating GitHub issue:', error);
      throw new Error('Failed to create GitHub issue');
    }
  }

  /**
   * Update GitHub issue with task changes
   */
  async updateTaskIssue(issueNumber: number, task: Task): Promise<void> {
    const title = `[Task] ${task.name}`;
    const body = this.formatTaskBody(task);
    const labels = this.getTaskLabels(task);
    const state = this.getIssueState(task.status);

    try {
      await this.octokit.rest.issues.update({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: issueNumber,
        title,
        body,
        labels,
        state,
      });
    } catch (error) {
      console.error('Error updating GitHub issue:', error);
      throw new Error('Failed to update GitHub issue');
    }
  }

  /**
   * Get GitHub issue by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue | null> {
    try {
      const response = await this.octokit.rest.issues.get({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: issueNumber,
      });

      const issue = response.data;
      return {
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state as 'open' | 'closed',
        labels: issue.labels.map(label => 
          typeof label === 'string' ? label : label.name || ''
        ),
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        assignees: issue.assignees?.map(assignee => assignee.login) || [],
      };
    } catch (error) {
      console.error('Error fetching GitHub issue:', error);
      return null;
    }
  }

  /**
   * List issues with filtering
   */
  async listTaskIssues(filters: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    assignee?: string;
    since?: string;
    per_page?: number;
    page?: number;
  } = {}): Promise<{ issues: GitHubIssue[]; total_count: number }> {
    try {
      const response = await this.octokit.rest.issues.listForRepo({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        state: filters.state || 'all',
        labels: filters.labels?.join(','),
        assignee: filters.assignee,
        since: filters.since,
        per_page: filters.per_page || 30,
        page: filters.page || 1,
      });

      // Filter out pull requests (GitHub API includes them in issues)
      const issues = response.data
        .filter(issue => !issue.pull_request)
        .map(issue => ({
          number: issue.number,
          title: issue.title,
          body: issue.body || '',
          state: issue.state as 'open' | 'closed',
          labels: issue.labels.map(label => 
            typeof label === 'string' ? label : label.name || ''
          ),
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          assignees: issue.assignees?.map(assignee => assignee.login) || [],
        }));

      return {
        issues,
        total_count: issues.length, // GitHub doesn't provide total count directly
      };
    } catch (error) {
      console.error('Error listing GitHub issues:', error);
      throw new Error('Failed to list GitHub issues');
    }
  }

  /**
   * Add comment to issue (for task logs/updates)
   */
  async addIssueComment(issueNumber: number, body: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: issueNumber,
        body,
      });
    } catch (error) {
      console.error('Error adding issue comment:', error);
      throw new Error('Failed to add issue comment');
    }
  }

  /**
   * Close issue when task is completed/cancelled
   */
  async closeIssue(issueNumber: number, reason?: string): Promise<void> {
    const body = reason ? `Task closed: ${reason}` : 'Task completed';
    
    try {
      await this.addIssueComment(issueNumber, body);
      await this.octokit.rest.issues.update({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: issueNumber,
        state: 'closed',
      });
    } catch (error) {
      console.error('Error closing issue:', error);
      throw new Error('Failed to close issue');
    }
  }

  /**
   * Parse task from GitHub issue
   */
  parseTaskFromIssue(issue: GitHubIssue): Partial<Task> | null {
    if (!issue.title.startsWith('[Task]')) {
      return null;
    }

    const name = issue.title.replace('[Task] ', '');
    const status = this.parseTaskStatus(issue.state, issue.labels);
    const priority = this.parseTaskPriority(issue.labels);

    // Parse body for task details
    const bodyLines = issue.body.split('\n');
    let command = '';
    let description = '';
    let projectId = '';

    for (const line of bodyLines) {
      if (line.startsWith('**Command:** `')) {
        command = line.replace('**Command:** `', '').replace('`', '');
      } else if (line.startsWith('**Description:** ')) {
        description = line.replace('**Description:** ', '');
      } else if (line.startsWith('**Project ID:** ')) {
        projectId = line.replace('**Project ID:** ', '');
      }
    }

    return {
      name,
      command,
      description,
      project_id: projectId,
      status,
      priority,
      github_issue_number: issue.number,
      created_at: new Date(issue.created_at),
      updated_at: new Date(issue.updated_at),
    };
  }

  /**
   * Format task as GitHub issue body
   */
  private formatTaskBody(task: Task): string {
    const sections = [
      `@terragon-labs please execute this task:`,
      '',
      `**Task ID:** ${task.id}`,
      `**Project ID:** ${task.project_id}`,
      `**Command:** \`${task.command}\``,
      `**Status:** ${task.status}`,
      `**Priority:** ${task.priority}`,
      '',
      `**Description:** ${task.description || 'No description provided'}`,
      '',
    ];

    if (task.tags && task.tags.length > 0) {
      sections.push(`**Tags:** ${task.tags.join(', ')}`);
      sections.push('');
    }

    if (task.scheduled_at) {
      sections.push(`**Scheduled:** ${task.scheduled_at.toISOString()}`);
    }

    if (task.timeout) {
      sections.push(`**Timeout:** ${task.timeout}s`);
    }

    if (task.max_retries) {
      sections.push(`**Max Retries:** ${task.max_retries}`);
    }

    sections.push('');
    sections.push('---');
    sections.push('*This issue is automatically managed by Claude CLI Web UI*');

    return sections.join('\n');
  }

  /**
   * Get GitHub labels for task
   */
  private getTaskLabels(task: Task): string[] {
    const labels = ['task'];

    // Add status label
    labels.push(`status:${task.status}`);

    // Add priority label
    labels.push(`priority:${task.priority}`);

    // Add custom tags
    if (task.tags) {
      labels.push(...task.tags.map(tag => `tag:${tag}`));
    }

    return labels;
  }

  /**
   * Convert task status to GitHub issue state
   */
  private getIssueState(status: TaskStatus): 'open' | 'closed' {
    return ['completed', 'failed', 'cancelled'].includes(status) ? 'closed' : 'open';
  }

  /**
   * Parse task status from GitHub issue
   */
  private parseTaskStatus(state: 'open' | 'closed', labels: string[]): TaskStatus {
    const statusLabel = labels.find(label => label.startsWith('status:'));
    if (statusLabel) {
      const status = statusLabel.replace('status:', '') as TaskStatus;
      return status;
    }

    return state === 'closed' ? 'completed' : 'pending';
  }

  /**
   * Parse task priority from GitHub labels
   */
  private parseTaskPriority(labels: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const priorityLabel = labels.find(label => label.startsWith('priority:'));
    if (priorityLabel) {
      const priority = priorityLabel.replace('priority:', '') as 'low' | 'medium' | 'high' | 'critical';
      return priority;
    }

    return 'medium';
  }
}