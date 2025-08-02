/**
 * Generic command execution endpoint - routes commands to appropriate handlers
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { cors, sendSuccess, sendError, validateBody } from '../../src/utils/api';
import { z } from 'zod';

// Import command handlers
const planHandler = require('./plan');

const executeRequestSchema = z.object({
  command: z.string().min(1, 'Command is required'),
  sessionId: z.string().optional(),
  session_id: z.string().optional(),
  project_id: z.string().optional(),
  profile: z.string().optional(),
  repoOwner: z.string().optional(),
  repoName: z.string().optional()
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 'METHOD_NOT_ALLOWED', 405);
  }

  try {
    // Validate request body
    const validation = validateBody(req, executeRequestSchema);
    if (!validation.success) {
      return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
    }

    const { command, sessionId, session_id, project_id, profile, repoOwner, repoName } = validation.data;
    const trimmedCommand = command.trim();

    // Route based on command prefix
    if (trimmedCommand.toLowerCase().startsWith('/plan')) {
      // Route to plan handler
      const planRequest = {
        ...req,
        body: {
          command: trimmedCommand,
          session_id: session_id || `session_${Date.now()}`,
          project_id: project_id || 'default-project',
          repoOwner: repoOwner,
          repoName: repoName
        }
      };
      
      return await planHandler.default(planRequest, res);
    }

    // Handle other common commands
    if (trimmedCommand.toLowerCase() === 'help') {
      return sendSuccess(res, {
        output: `Available commands:
  help - Show this help
  status - System status
  history - Command history
  /plan <task> - Create a new task and GitHub issue

Special commands:
  /plan Task: name | Description: description
  /plan <simple task description>
  
Examples:
  /plan Create user authentication system
  /plan Task: Add dark mode | Description: Implement dark/light theme toggle`,
        exitCode: 0,
        duration: 50
      });
    }

    if (trimmedCommand.toLowerCase() === 'status') {
      return sendSuccess(res, {
        output: `Claude CLI Status:
  Backend: Connected
  Session: ${session_id || 'active'}
  Profile: ${profile || 'general'}
  Time: ${new Date().toISOString()}`,
        exitCode: 0,
        duration: 25
      });
    }

    if (trimmedCommand.toLowerCase() === 'history') {
      return sendSuccess(res, {
        output: `Command History:
  No previous commands in this session
  Use /plan to create tasks and GitHub issues`,
        exitCode: 0,
        duration: 30
      });
    }

    // Handle unknown commands
    return sendSuccess(res, {
      output: `Unknown command: ${trimmedCommand}
      
Available commands:
  help - Show this help
  status - System status  
  history - Command history
  /plan <task> - Create a new task and GitHub issue
  
Try 'help' for more information.`,
      exitCode: 1,
      duration: 20
    });

  } catch (error) {
    console.error('Command execution error:', error);
    return sendError(
      res,
      error instanceof Error ? error.message : 'Command execution failed',
      'EXECUTION_ERROR',
      500
    );
  }
}