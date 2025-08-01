/**
 * Terragon API integration for worker deployment and management
 */

import { TerragoWorker, Task } from '../types';

const TERRAGON_API_KEY = process.env.TERRAGON_API_KEY;
const TERRAGON_BASE_URL = process.env.TERRAGON_BASE_URL || 'https://api.terragon.ai';
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || 'https://your-vercel-app.vercel.app';

interface TerragoWorkerConfig {
  name: string;
  image: string;
  resources: {
    cpu: string;
    memory: string;
    gpu?: string;
  };
  environment: Record<string, string>;
  command?: string[];
  timeout?: number;
}

interface TerragoCreateResponse {
  id: string;
  status: 'creating' | 'running' | 'failed';
  created_at: string;
  endpoints?: {
    api?: string;
    callback?: string;
  };
}

interface TerragoStatusResponse {
  id: string;
  name: string;
  status: 'creating' | 'running' | 'stopping' | 'stopped' | 'failed';
  created_at: string;
  started_at?: string;
  stopped_at?: string;
  cost: {
    current: number;
    estimated_total: number;
  };
  logs?: string[];
}

export class TerragoService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    if (!TERRAGON_API_KEY) {
      throw new Error('TERRAGON_API_KEY environment variable is required');
    }

    this.apiKey = TERRAGON_API_KEY;
    this.baseUrl = TERRAGON_BASE_URL;
  }

  /**
   * Create worker for task execution
   */
  async createWorker(task: Task): Promise<TerragoWorker> {
    const config: TerragoWorkerConfig = {
      name: `claude-cli-task-${task.id}`,
      image: 'claude-cli-worker:latest', // Custom image with Claude CLI
      resources: this.getResourcesForTask(task),
      environment: {
        TASK_ID: task.id,
        TASK_COMMAND: task.command,
        CALLBACK_URL: `${CALLBACK_BASE_URL}/api/workers/callback`,
        ...this.getEnvironmentForTask(task),
      },
      command: ['sh', '-c', task.command],
      timeout: task.timeout || 3600, // 1 hour default
    };

    try {
      const response = await fetch(`${this.baseUrl}/workers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Terragon API error: ${response.status} ${error}`);
      }

      const result: TerragoCreateResponse = await response.json();

      const worker: TerragoWorker = {
        id: result.id,
        name: config.name,
        status: result.status,
        created_at: new Date(result.created_at),
        task_id: task.id,
        callback_url: `${CALLBACK_BASE_URL}/api/workers/callback`,
        cost_estimate: 0, // Will be updated when we get status
      };

      console.log(`Created Terragon worker ${result.id} for task ${task.id}`);
      return worker;
    } catch (error) {
      console.error('Error creating Terragon worker:', error);
      throw new Error(`Failed to create worker: ${error}`);
    }
  }

  /**
   * Get worker status
   */
  async getWorkerStatus(workerId: string): Promise<TerragoWorker | null> {
    try {
      const response = await fetch(`${this.baseUrl}/workers/${workerId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const error = await response.text();
        throw new Error(`Terragon API error: ${response.status} ${error}`);
      }

      const status: TerragoStatusResponse = await response.json();

      return {
        id: status.id,
        name: status.name,
        status: status.status,
        created_at: new Date(status.created_at),
        task_id: '', // Would need to extract from name or store separately
        cost_estimate: status.cost.estimated_total,
      };
    } catch (error) {
      console.error('Error getting worker status:', error);
      return null;
    }
  }

  /**
   * Stop worker
   */
  async stopWorker(workerId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/workers/${workerId}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Terragon API error: ${response.status} ${error}`);
      }

      console.log(`Stopped Terragon worker ${workerId}`);
    } catch (error) {
      console.error('Error stopping worker:', error);
      throw new Error(`Failed to stop worker: ${error}`);
    }
  }

  /**
   * Delete worker (cleanup)
   */
  async deleteWorker(workerId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/workers/${workerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`Terragon API error: ${response.status} ${error}`);
      }

      console.log(`Deleted Terragon worker ${workerId}`);
    } catch (error) {
      console.error('Error deleting worker:', error);
      throw new Error(`Failed to delete worker: ${error}`);
    }
  }

  /**
   * List all workers
   */
  async listWorkers(): Promise<TerragoWorker[]> {
    try {
      const response = await fetch(`${this.baseUrl}/workers`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Terragon API error: ${response.status} ${error}`);
      }

      const workers: TerragoStatusResponse[] = await response.json();

      return workers.map(worker => ({
        id: worker.id,
        name: worker.name,
        status: worker.status,
        created_at: new Date(worker.created_at),
        task_id: this.extractTaskIdFromName(worker.name),
        cost_estimate: worker.cost.estimated_total,
      }));
    } catch (error) {
      console.error('Error listing workers:', error);
      throw new Error('Failed to list workers');
    }
  }

  /**
   * Get worker logs
   */
  async getWorkerLogs(workerId: string): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/workers/${workerId}/logs`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Terragon API error: ${response.status} ${error}`);
      }

      const result = await response.json();
      return result.logs || [];
    } catch (error) {
      console.error('Error getting worker logs:', error);
      return [];
    }
  }

  /**
   * Handle callback from worker
   */
  async handleWorkerCallback(payload: {
    worker_id: string;
    task_id: string;
    status: 'completed' | 'failed';
    output?: any;
    error?: string;
    cost: number;
  }): Promise<void> {
    console.log(`Received callback from worker ${payload.worker_id}:`, payload);

    // This would integrate with your task management system
    // For now, we'll just log the result
    
    if (payload.status === 'completed') {
      console.log(`Task ${payload.task_id} completed successfully`);
      if (payload.output) {
        console.log('Output:', payload.output);
      }
    } else {
      console.log(`Task ${payload.task_id} failed`);
      if (payload.error) {
        console.log('Error:', payload.error);
      }
    }

    console.log(`Worker cost: $${payload.cost}`);

    // Clean up the worker
    try {
      await this.deleteWorker(payload.worker_id);
    } catch (error) {
      console.error('Error cleaning up worker:', error);
    }
  }

  /**
   * Get cost estimate for task
   */
  async estimateTaskCost(task: Task): Promise<number> {
    const resources = this.getResourcesForTask(task);
    const duration = task.timeout || 3600; // seconds
    
    // Rough cost calculation (would use actual Terragon pricing)
    const baseCostPerHour = 0.10; // $0.10 per hour for basic resources
    const hours = duration / 3600;
    
    let multiplier = 1;
    if (resources.gpu) multiplier *= 10;
    if (resources.cpu === '2') multiplier *= 2;
    if (resources.memory === '4Gi') multiplier *= 2;
    
    return baseCostPerHour * hours * multiplier;
  }

  /**
   * Get resource requirements based on task
   */
  private getResourcesForTask(task: Task): { cpu: string; memory: string; gpu?: string } {
    // Analyze task command to determine resource needs
    const command = task.command.toLowerCase();
    
    let resources = {
      cpu: '1',
      memory: '2Gi',
    };

    // High-resource commands
    if (command.includes('ml') || command.includes('train') || command.includes('model')) {
      resources = {
        cpu: '4',
        memory: '8Gi',
        gpu: 'nvidia-t4',
      };
    } else if (command.includes('build') || command.includes('compile')) {
      resources = {
        cpu: '2',
        memory: '4Gi',
      };
    } else if (command.includes('test') || command.includes('analyze')) {
      resources = {
        cpu: '2',
        memory: '2Gi',
      };
    }

    return resources;
  }

  /**
   * Get environment variables for task
   */
  private getEnvironmentForTask(task: Task): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      TASK_PROJECT_ID: task.project_id,
      TASK_PRIORITY: task.priority,
    };

    // Add task metadata as environment variables
    if (task.metadata) {
      for (const [key, value] of Object.entries(task.metadata)) {
        env[`TASK_${key.toUpperCase()}`] = String(value);
      }
    }

    // Add input data as JSON
    if (task.input_data) {
      env['TASK_INPUT'] = JSON.stringify(task.input_data);
    }

    return env;
  }

  /**
   * Extract task ID from worker name
   */
  private extractTaskIdFromName(name: string): string {
    const match = name.match(/claude-cli-task-(.+)/);
    return match ? match[1] : '';
  }
}