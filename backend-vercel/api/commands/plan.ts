/**
 * Plan command handler - intercepts /plan commands and creates tasks instead of executing
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { connections } from '../github';

interface PlanCommandRequest {
  command: string;
  session_id: string;
  project_id?: string;
}

// Parse /plan command to extract task details
function parsePlanCommand(command: string): { name: string; description: string } {
  const commandWithoutPrefix = command.replace(/^\/plan\s+/i, '').trim();
  
  // Try to parse "Task: name | Description: description" format
  const taskMatch = commandWithoutPrefix.match(/Task:\s*([^|]+)(?:\|\s*Description:\s*(.+))?/i);
  if (taskMatch) {
    return {
      name: taskMatch[1].trim(),
      description: taskMatch[2]?.trim() || ''
    };
  }
  
  // Otherwise, treat the whole command as the task name
  return {
    name: commandWithoutPrefix || 'New Task',
    description: ''
  };
}

// CORS helper
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { command, session_id, project_id } = req.body as PlanCommandRequest;
    
    // Validate command starts with /plan
    if (!command || !command.trim().toLowerCase().startsWith('/plan')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid plan command' 
      });
    }

    // Parse task details from command
    const { name, description } = parsePlanCommand(command);
    
    // Determine project ID
    let projectId = project_id;
    if (!projectId) {
      // Try to find a project from active GitHub connections
      const activeConnection = Array.from(connections.values()).find(
        conn => conn.status === 'active'
      );
      projectId = activeConnection?.project_id;
    }
    
    if (!projectId) {
      return res.status(400).json({ 
        success: false, 
        error: 'No project ID found. Please ensure a project is connected.' 
      });
    }

    // Dynamic import to avoid deployment issues
    
    // Create task object directly
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      project_id: projectId,
      name: name,
      description: description,
      command: command,
      status: 'pending' as const,
      priority: 'medium' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {} as Record<string, any>,
      github_issue_number: undefined as number | undefined
    };

    // Create GitHub issue with @terragon-labs mention
    try {
      // Debug environment check
      console.log('Environment debug:', {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN ? `${process.env.GITHUB_TOKEN.substring(0, 8)}...` : 'NOT SET',
        GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER || 'NOT SET',
        GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME || 'NOT SET',
        reqBodyRepoOwner: req.body.repoOwner,
        reqBodyRepoName: req.body.repoName,
        projectId: projectId
      });

      // Dynamic import to avoid deployment issues
      const { GitHubServiceWithConnections } = await import('../../src/lib/github-with-connections');
      
      // Check for GitHub token in header or body
      const githubToken = req.headers['x-github-token'] as string || req.body.githubToken;
      if (githubToken) {
        process.env.GITHUB_TOKEN = githubToken;
      }
      
      const githubService = new GitHubServiceWithConnections(projectId, req.body.repoOwner, req.body.repoName);
      const issueNumber = await githubService.createTaskIssue(task as any);
      
      // Update task with GitHub issue number
      task.github_issue_number = issueNumber;
      
      console.log(`Created GitHub issue #${issueNumber} for task ${task.id}`);
    } catch (githubError) {
      // Log error but don't fail task creation
      console.error('Failed to create GitHub issue:', githubError);
      console.error('GitHub error details:', githubError instanceof Error ? githubError.message : githubError);
      // Add error to metadata so user knows GitHub sync failed
      task.metadata = {
        ...task.metadata,
        github_error: 'Failed to create GitHub issue. Check GitHub connection settings.'
      };
    }

    // Return success response with task info
    return res.status(200).json({ 
      success: true,
      output: `✅ Task created successfully!\n\n` +
              `📋 Task: ${task.name}\n` +
              `🆔 ID: ${task.id}\n` +
              `📊 Status: ${task.status}\n` +
              `🎯 Priority: ${task.priority}\n` +
              (task.github_issue_number ? `🔗 GitHub Issue: #${task.github_issue_number}\n` : '') +
              (task.metadata?.github_error ? `⚠️ GitHub sync failed: ${task.metadata.github_error}\n` : '') +
              `\n💡 The task has been created and ` +
              (task.github_issue_number ? `GitHub issue #${task.github_issue_number} has been opened with @terragon-labs mention.` : `is ready for execution.`) +
              `\n\nNext steps:\n` +
              `- Use /smart-task to execute the task\n` +
              `- View task details in the Tasks panel\n` +
              `- Monitor progress in the terminal`,
      command: command,
      task: task,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Plan command error:', error);
    return res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process plan command',
      output: `❌ Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}