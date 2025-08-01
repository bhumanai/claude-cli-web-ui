/**
 * Worker callback endpoint - Handle callbacks from Terragon workers
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { 
  cors, 
  sendSuccess, 
  sendError, 
  allowMethods, 
  asyncHandler,
  validateBody,
  sanitizeInput
} from '../../src/utils/api';
import { TerragoService } from '../../src/lib/terragon';
import { RedisService } from '../../src/lib/redis';
import { GitHubService } from '../../src/lib/github';

const CallbackSchema = z.object({
  worker_id: z.string().min(1),
  task_id: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  output: z.any().optional(),
  error: z.string().optional(),
  cost: z.number().min(0),
  logs: z.array(z.string()).optional(),
});

let terragoService: TerragoService | null = null;
let redisService: RedisService | null = null;
let githubService: GitHubService | null = null;

// Initialize services
try {
  terragoService = new TerragoService();
  redisService = new RedisService();
  githubService = new GitHubService();
} catch (error) {
  console.warn('Service initialization failed:', error);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (!cors(req, res)) return;
  
  // Only allow POST method
  if (!allowMethods(req, res, ['POST'])) return;

  // Validate request body
  const validation = validateBody(req, CallbackSchema);
  if (!validation.success) {
    return sendError(res, validation.error, 'VALIDATION_ERROR', 400);
  }

  const callbackData = validation.data;

  try {
    console.log(`Received worker callback:`, callbackData);

    // Sanitize output data
    const sanitizedOutput = callbackData.output ? sanitizeInput(callbackData.output) : undefined;

    // Update task in Redis
    if (redisService) {
      try {
        const task = await redisService.getTask(callbackData.task_id);
        if (task) {
          // Update task status and results
          task.status = callbackData.status === 'completed' ? 'completed' : 'failed';
          task.completed_at = new Date();
          task.output_data = sanitizedOutput;
          task.error_message = callbackData.error;
          
          await redisService.updateTask(task);

          // Complete task in queue
          const queueId = `project_${task.project_id}`;
          await redisService.completeTask(
            queueId,
            callbackData.task_id,
            callbackData.status === 'completed',
            sanitizedOutput,
            callbackData.error
          );

          console.log(`Task ${callbackData.task_id} marked as ${task.status}`);
        }
      } catch (error) {
        console.warn('Failed to update task in Redis:', error);
      }
    }

    // Update GitHub issue
    if (githubService && redisService) {
      try {
        const task = await redisService.getTask(callbackData.task_id);
        if (task && task.github_issue_number) {
          await githubService.updateTaskIssue(task.github_issue_number, task);
          
          // Add completion comment with results
          const commentBody = callbackData.status === 'completed'
            ? `✅ **Task completed successfully**\n\n**Cost:** $${callbackData.cost.toFixed(4)}\n\n**Output:**\n\`\`\`json\n${JSON.stringify(sanitizedOutput, null, 2)}\n\`\`\``
            : `❌ **Task failed**\n\n**Cost:** $${callbackData.cost.toFixed(4)}\n\n**Error:**\n\`\`\`\n${callbackData.error || 'Unknown error'}\n\`\`\``;
          
          await githubService.addIssueComment(task.github_issue_number, commentBody);
          
          // Close issue if completed
          if (callbackData.status === 'completed') {
            await githubService.closeIssue(task.github_issue_number, 'Task completed successfully');
          }

          console.log(`Updated GitHub issue #${task.github_issue_number}`);
        }
      } catch (error) {
        console.warn('Failed to update GitHub issue:', error);
      }
    }

    // Send real-time update via SSE
    if (redisService) {
      try {
        await redisService.publishSSE('tasks', {
          id: `task_complete_${Date.now()}`,
          event: 'task_completed',
          data: {
            task_id: callbackData.task_id,
            worker_id: callbackData.worker_id,
            status: callbackData.status,
            cost: callbackData.cost,
            output: sanitizedOutput,
            error: callbackData.error,
          },
          timestamp: new Date(),
        });

        // Also send to worker-specific channel
        await redisService.publishSSE('workers', {
          id: `worker_complete_${Date.now()}`,
          event: 'worker_completed',
          data: {
            worker_id: callbackData.worker_id,
            task_id: callbackData.task_id,
            status: callbackData.status,
            cost: callbackData.cost,
          },
          timestamp: new Date(),
        });
      } catch (error) {
        console.warn('Failed to publish SSE message:', error);
      }
    }

    // Handle the callback in Terragon service (cleanup, etc.)
    if (terragoService) {
      try {
        await terragoService.handleWorkerCallback({
          worker_id: callbackData.worker_id,
          task_id: callbackData.task_id,
          status: callbackData.status,
          output: sanitizedOutput,
          error: callbackData.error,
          cost: callbackData.cost,
        });
      } catch (error) {
        console.warn('Failed to handle Terragon callback:', error);
      }
    }

    sendSuccess(res, {
      message: 'Callback processed successfully',
      task_id: callbackData.task_id,
      worker_id: callbackData.worker_id,
      status: callbackData.status,
      cost: callbackData.cost,
    });
  } catch (error) {
    console.error('Worker callback error:', error);
    sendError(res, 'Failed to process callback', 'CALLBACK_ERROR', 500);
  }
}

export default asyncHandler(handler);