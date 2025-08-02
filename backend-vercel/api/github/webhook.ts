import { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { RedisService } from '../../src/lib/redis';

// Initialize Redis service
let redisService: RedisService | null = null;
try {
  redisService = new RedisService();
} catch (error) {
  console.warn('Redis service initialization failed:', error);
}

// In-memory store for tasks (as fallback)
const tasksStore = new Map<string, any>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.headers['x-github-event'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const body = req.body;

    console.log(`GitHub webhook received: ${event}`);

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const hmac = createHmac('sha256', webhookSecret);
      const digest = 'sha256=' + hmac.update(JSON.stringify(body)).digest('hex');
      
      if (signature !== digest) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Handle issue comment events (this is where Terragon will respond)
    if (event === 'issue_comment' && body.action === 'created') {
      const issue = body.issue;
      const comment = body.comment;
      const repository = body.repository;

      console.log(`New comment on issue #${issue.number} by ${comment.user.login}`);

      // Check if comment is from Terragon
      if (comment.user.login === 'terragon-labs' || comment.body.includes('@terragon-labs')) {
        console.log('Processing Terragon response...');

        // Extract task ID from issue body or labels
        let taskId: string | null = null;
        const taskIdMatch = issue.body.match(/\*\*Task ID:\*\* ([a-zA-Z0-9_-]+)/);
        if (taskIdMatch) {
          taskId = taskIdMatch[1];
        }

        if (taskId) {
          // Parse Terragon's response
          const isCompleted = comment.body.toLowerCase().includes('completed') || 
                            comment.body.includes('✅') ||
                            comment.body.toLowerCase().includes('done');
          
          const isFailed = comment.body.toLowerCase().includes('failed') || 
                          comment.body.includes('❌') ||
                          comment.body.toLowerCase().includes('error');

          // Extract any output or results from the comment
          const codeBlockMatch = comment.body.match(/```(?:json)?\n([\s\S]*?)\n```/);
          const output = codeBlockMatch ? codeBlockMatch[1] : null;

          // Update task status based on Terragon's response
          const updatedTask = {
            id: taskId,
            status: isCompleted ? 'completed' : isFailed ? 'failed' : 'running',
            completed_at: isCompleted || isFailed ? new Date().toISOString() : undefined,
            output_data: output ? JSON.parse(output) : undefined,
            error_message: isFailed ? comment.body : undefined,
            metadata: {
              terragon_response: comment.body,
              terragon_comment_id: comment.id,
              terragon_responded_at: comment.created_at
            }
          };

          // Update task in storage
          if (redisService) {
            try {
              const existingTask = await redisService.getTask(taskId);
              if (existingTask) {
                const mergedTask = { ...existingTask, ...updatedTask };
                await redisService.updateTask(mergedTask);
                console.log(`Updated task ${taskId} status to ${updatedTask.status}`);
              }
            } catch (error) {
              console.error('Failed to update task in Redis:', error);
              // Fallback to in-memory store
              tasksStore.set(taskId, updatedTask);
            }
          } else {
            // Fallback to in-memory store
            tasksStore.set(taskId, updatedTask);
          }

          // Send real-time update via SSE
          if (redisService) {
            try {
              await redisService.publishSSE('tasks', {
                id: `terragon_update_${Date.now()}`,
                type: 'task_update',
                event: 'task_update',
                data: {
                  task_id: taskId,
                  status: updatedTask.status,
                  source: 'terragon',
                  github_issue_number: issue.number,
                  comment_url: comment.html_url,
                  output: output
                },
                timestamp: new Date()
              });

              console.log(`Published SSE update for task ${taskId}`);
            } catch (error) {
              console.warn('Failed to publish SSE:', error);
            }
          }

          return res.status(200).json({
            message: 'Terragon response processed',
            task_id: taskId,
            status: updatedTask.status
          });
        }
      }
    }

    // Handle issue closed events
    if (event === 'issues' && body.action === 'closed') {
      const issue = body.issue;
      
      // Extract task ID
      let taskId: string | null = null;
      const taskIdMatch = issue.body.match(/\*\*Task ID:\*\* ([a-zA-Z0-9_-]+)/);
      if (taskIdMatch) {
        taskId = taskIdMatch[1];
        
        // Mark task as completed
        if (redisService) {
          try {
            const task = await redisService.getTask(taskId);
            if (task) {
              task.status = 'completed';
              task.completed_at = new Date();
              await redisService.updateTask(task);
              console.log(`Task ${taskId} marked as completed (issue closed)`);
            }
          } catch (error) {
            console.error('Failed to update task:', error);
          }
        }
      }
    }

    return res.status(200).json({ message: 'Webhook processed' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}