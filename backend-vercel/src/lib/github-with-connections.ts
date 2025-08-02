/**
 * GitHub Issues integration that uses project-specific connections
 */

import { Octokit } from '@octokit/rest';
import { Task, GitHubIssue, TaskStatus } from '../types';

// Import connections from the github API endpoint
import { connections } from '../../api/github';

export class GitHubServiceWithConnections {
  private projectId: string;
  private repoOwner?: string;
  private repoName?: string;

  constructor(projectId: string, repoOwner?: string, repoName?: string) {
    this.projectId = projectId;
    this.repoOwner = repoOwner;
    this.repoName = repoName;
  }

  /**
   * Get GitHub client for the project
   */
  private getOctokit(): { octokit: Octokit; owner: string; repo: string } | null {
    // Find active connection for this project
    const connection = Array.from(connections.values()).find(
      conn => conn.project_id === this.projectId && conn.status === 'active'
    );

    if (!connection || !connection.token || !connection.repository) {
      // Fallback to environment variables and constructor parameters
      const token = process.env.GITHUB_TOKEN;
      const owner = this.repoOwner || process.env.GITHUB_REPO_OWNER;
      const repo = this.repoName || process.env.GITHUB_REPO_NAME;

      // Debug logging
      console.log(`GitHub auth debug:`, {
        hasToken: !!token,
        tokenPrefix: token ? token.substring(0, 8) + '...' : 'none',
        owner: owner || 'none',
        repo: repo || 'none',
        projectId: this.projectId,
        repoOwnerParam: this.repoOwner,
        repoNameParam: this.repoName,
        connectionsCount: connections.size
      });

      if (!token || !owner || !repo) {
        console.warn(`No GitHub connection found for project ${this.projectId}. Missing: ${!token ? 'token ' : ''}${!owner ? 'owner ' : ''}${!repo ? 'repo' : ''}`);
        return null;
      }

      return {
        octokit: new Octokit({ auth: token }),
        owner,
        repo
      };
    }

    const [owner, repo] = connection.repository.split('/');
    return {
      octokit: new Octokit({ auth: connection.token }),
      owner,
      repo
    };
  }

  /**
   * Create GitHub issue for task
   */
  async createTaskIssue(task: Task): Promise<number> {
    const client = this.getOctokit();
    if (!client) {
      throw new Error('No GitHub connection available');
    }

    const { octokit, owner, repo } = client;
    const title = `[Task] ${task.name}`;
    const body = this.formatTaskBody(task);
    const labels = this.getTaskLabels(task);

    try {
      const response = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });

      console.log(`Created issue #${response.data.number} in ${owner}/${repo}`);
      return response.data.number;
    } catch (error) {
      console.error(`Error creating GitHub issue in ${owner}/${repo}:`, error);
      throw new Error('Failed to create GitHub issue');
    }
  }

  /**
   * Update GitHub issue with task changes
   */
  async updateTaskIssue(issueNumber: number, task: Task): Promise<void> {
    const client = this.getOctokit();
    if (!client) {
      throw new Error('No GitHub connection available');
    }

    const { octokit, owner, repo } = client;
    const title = `[Task] ${task.name}`;
    const body = this.formatTaskBody(task);
    const labels = this.getTaskLabels(task);
    const state = this.getIssueState(task.status);

    try {
      await octokit.rest.issues.update({
        owner,
        repo,
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
   * List GitHub issues as tasks
   */
  async listTaskIssues(options: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    per_page?: number;
    page?: number;
  }): Promise<{ issues: GitHubIssue[]; total_count: number }> {
    const client = this.getOctokit();
    if (!client) {
      return { issues: [], total_count: 0 };
    }

    const { octokit, owner, repo } = client;

    try {
      const response = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: options.state || 'all',
        labels: options.labels?.join(','),
        per_page: options.per_page || 30,
        page: options.page || 1,
        sort: 'created',
        direction: 'desc',
      });

      return {
        issues: response.data as GitHubIssue[],
        total_count: response.data.length,
      };
    } catch (error) {
      console.error('Error listing GitHub issues:', error);
      throw new Error('Failed to list GitHub issues');
    }
  }

  /**
   * Get a single GitHub issue
   */
  async getTaskIssue(issueNumber: number): Promise<GitHubIssue> {
    const client = this.getOctokit();
    if (!client) {
      throw new Error('No GitHub connection available');
    }

    const { octokit, owner, repo } = client;

    try {
      const response = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      return response.data as GitHubIssue;
    } catch (error) {
      console.error('Error getting GitHub issue:', error);
      throw new Error('Failed to get GitHub issue');
    }
  }

  /**
   * Parse GitHub issue into task data
   */
  parseTaskFromIssue(issue: GitHubIssue): Partial<Task> | null {
    // Skip non-task issues
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
      `## Task Execution Request`,
      '',
      `**Task ID:** ${task.id}`,
      `**Project ID:** ${task.project_id}`,
      `**Priority:** ${task.priority}`,
      `**Status:** ${task.status}`,
      '',
      `## Description`,
      task.description || 'No description provided',
      '',
      `## Command`,
      '```',
      task.command || 'No command specified',
      '```',
      '',
      `## Execution`,
      `**To activate Terragon:**`,
      `1. Add a comment to this issue mentioning @terragon-labs`,
      `2. Example: "@terragon-labs please execute this task"`,
      `3. Terragon will respond with 👀 emoji and begin work`,
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
  private parseTaskStatus(state: string, labels: any[]): TaskStatus {
    if (state === 'closed') {
      // Check labels for specific closed status
      for (const label of labels) {
        if (label.name === 'status:completed') return 'completed';
        if (label.name === 'status:failed') return 'failed';
        if (label.name === 'status:cancelled') return 'cancelled';
      }
      return 'completed'; // Default closed status
    }

    // Check labels for specific open status
    for (const label of labels) {
      if (label.name === 'status:running') return 'running';
      if (label.name === 'status:queued') return 'queued';
      if (label.name === 'status:timeout') return 'timeout';
    }

    return 'pending'; // Default open status
  }

  /**
   * Parse task priority from GitHub labels
   */
  private parseTaskPriority(labels: any[]): 'low' | 'medium' | 'high' | 'critical' {
    for (const label of labels) {
      if (label.name === 'priority:critical') return 'critical';
      if (label.name === 'priority:high') return 'high';
      if (label.name === 'priority:low') return 'low';
    }
    return 'medium'; // Default priority
  }
}