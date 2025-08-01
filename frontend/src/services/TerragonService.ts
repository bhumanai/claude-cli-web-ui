/**
 * Terragon Service
 * API integration for Terragon worker management and monitoring
 */

import { secureApiClient } from '../utils/security'

export interface TerragonWorker {
  id: string
  name: string
  type: 'cpu' | 'gpu' | 'memory' | 'io'
  status: 'idle' | 'running' | 'paused' | 'error'
  currentTask?: {
    id: string
    name: string
    progress: number
    startedAt: string
    estimatedCompletion?: string
  }
  resources: {
    cpu: number
    memory: number
    gpu?: number
    networkIn: number
    networkOut: number
    disk?: {
      read: number
      write: number
    }
  }
  metrics: {
    tasksCompleted: number
    totalRuntime: number
    errorCount: number
    efficiency: number
    costPerHour: number
    successRate: number
  }
  configuration: {
    maxCpu: number
    maxMemory: number
    priority: 'low' | 'normal' | 'high'
    autoScale: boolean
    region?: string
  }
  lastHeartbeat: string
  createdAt: string
  updatedAt: string
}

export interface TerragonTask {
  id: string
  name: string
  description: string
  type: string
  priority: 'low' | 'normal' | 'high' | 'critical'
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed'
  assignedWorker?: string
  progress: number
  result?: any
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  estimatedDuration?: number
  actualDuration?: number
}

export interface TerragonCluster {
  id: string
  name: string
  region: string
  workers: number
  activeWorkers: number
  totalCapacity: {
    cpu: number
    memory: number
    gpu?: number
  }
  currentLoad: {
    cpu: number
    memory: number
    gpu?: number
  }
  status: 'healthy' | 'degraded' | 'offline'
  healthChecks: {
    api: boolean
    workers: boolean
    network: boolean
    storage: boolean
  }
}

export interface WorkerControlAction {
  workerId: string
  action: 'start' | 'stop' | 'pause' | 'resume' | 'restart' | 'scale'
  parameters?: {
    instances?: number
    cpu?: number
    memory?: number
  }
}

class TerragonServiceClass {
  private baseUrl = '/api/terragon'

  // Worker Management
  async getWorkers(): Promise<TerragonWorker[]> {
    const response = await secureApiClient.request(`${this.baseUrl}/workers`)
    if (!response.ok) {
      throw new Error('Failed to fetch workers')
    }
    return response.json()
  }

  async getWorker(workerId: string): Promise<TerragonWorker> {
    const response = await secureApiClient.request(`${this.baseUrl}/workers/${workerId}`)
    if (!response.ok) {
      throw new Error('Failed to fetch worker')
    }
    return response.json()
  }

  async createWorker(config: Partial<TerragonWorker>): Promise<TerragonWorker> {
    const response = await secureApiClient.request(`${this.baseUrl}/workers`, {
      method: 'POST',
      body: JSON.stringify(config)
    })
    if (!response.ok) {
      throw new Error('Failed to create worker')
    }
    return response.json()
  }

  async controlWorker(action: WorkerControlAction): Promise<{ success: boolean; message: string }> {
    const response = await secureApiClient.request(`${this.baseUrl}/workers/control`, {
      method: 'POST',
      body: JSON.stringify(action)
    })
    if (!response.ok) {
      throw new Error('Failed to control worker')
    }
    return response.json()
  }

  async deleteWorker(workerId: string): Promise<void> {
    const response = await secureApiClient.request(`${this.baseUrl}/workers/${workerId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error('Failed to delete worker')
    }
  }

  // Task Management
  async getTasks(filters?: {
    status?: string
    workerId?: string
    priority?: string
    limit?: number
  }): Promise<TerragonTask[]> {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString())
        }
      })
    }
    
    const response = await secureApiClient.request(
      `${this.baseUrl}/tasks${params.toString() ? `?${params}` : ''}`
    )
    if (!response.ok) {
      throw new Error('Failed to fetch tasks')
    }
    return response.json()
  }

  async createTask(task: Partial<TerragonTask>): Promise<TerragonTask> {
    const response = await secureApiClient.request(`${this.baseUrl}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task)
    })
    if (!response.ok) {
      throw new Error('Failed to create task')
    }
    return response.json()
  }

  async assignTask(taskId: string, workerId: string): Promise<void> {
    const response = await secureApiClient.request(`${this.baseUrl}/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ workerId })
    })
    if (!response.ok) {
      throw new Error('Failed to assign task')
    }
  }

  // Cluster Management
  async getClusters(): Promise<TerragonCluster[]> {
    const response = await secureApiClient.request(`${this.baseUrl}/clusters`)
    if (!response.ok) {
      throw new Error('Failed to fetch clusters')
    }
    return response.json()
  }

  async getClusterHealth(clusterId: string): Promise<TerragonCluster> {
    const response = await secureApiClient.request(`${this.baseUrl}/clusters/${clusterId}/health`)
    if (!response.ok) {
      throw new Error('Failed to fetch cluster health')
    }
    return response.json()
  }

  // Metrics and Analytics
  async getMetrics(timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{
    workers: {
      total: number
      active: number
      idle: number
      error: number
    }
    tasks: {
      completed: number
      failed: number
      pending: number
      avgDuration: number
    }
    resources: {
      cpuUtilization: number
      memoryUtilization: number
      networkThroughput: number
    }
    cost: {
      current: number
      projected: number
      trend: number
    }
  }> {
    const response = await secureApiClient.request(`${this.baseUrl}/metrics?range=${timeRange}`)
    if (!response.ok) {
      throw new Error('Failed to fetch metrics')
    }
    return response.json()
  }

  async getWorkerMetrics(workerId: string, timeRange: '1h' | '24h' | '7d' = '24h'): Promise<{
    timeline: Array<{
      timestamp: string
      cpu: number
      memory: number
      tasks: number
    }>
    summary: {
      avgCpu: number
      avgMemory: number
      peakCpu: number
      peakMemory: number
      totalTasks: number
      successRate: number
    }
  }> {
    const response = await secureApiClient.request(
      `${this.baseUrl}/workers/${workerId}/metrics?range=${timeRange}`
    )
    if (!response.ok) {
      throw new Error('Failed to fetch worker metrics')
    }
    return response.json()
  }

  // Cost Management
  async getCostEstimate(config: {
    workers: number
    type: 'cpu' | 'gpu' | 'memory'
    duration: number // hours
    region?: string
  }): Promise<{
    hourlyRate: number
    totalCost: number
    breakdown: {
      compute: number
      network: number
      storage: number
    }
  }> {
    const response = await secureApiClient.request(`${this.baseUrl}/cost/estimate`, {
      method: 'POST',
      body: JSON.stringify(config)
    })
    if (!response.ok) {
      throw new Error('Failed to get cost estimate')
    }
    return response.json()
  }

  // Auto-scaling
  async configureAutoScaling(config: {
    clusterId: string
    enabled: boolean
    minWorkers: number
    maxWorkers: number
    targetCpuUtilization: number
    scaleUpThreshold: number
    scaleDownThreshold: number
  }): Promise<void> {
    const response = await secureApiClient.request(`${this.baseUrl}/autoscaling`, {
      method: 'POST',
      body: JSON.stringify(config)
    })
    if (!response.ok) {
      throw new Error('Failed to configure auto-scaling')
    }
  }

  // Logs and Debugging
  async getWorkerLogs(workerId: string, options?: {
    lines?: number
    since?: string
    level?: 'debug' | 'info' | 'warn' | 'error'
  }): Promise<string[]> {
    const params = new URLSearchParams()
    if (options) {
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString())
        }
      })
    }
    
    const response = await secureApiClient.request(
      `${this.baseUrl}/workers/${workerId}/logs${params.toString() ? `?${params}` : ''}`
    )
    if (!response.ok) {
      throw new Error('Failed to fetch worker logs')
    }
    return response.json()
  }

  // Health Checks
  async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: {
      api: boolean
      database: boolean
      workers: boolean
      queues: boolean
    }
    timestamp: string
  }> {
    const response = await secureApiClient.request(`${this.baseUrl}/health`)
    if (!response.ok) {
      throw new Error('Failed to perform health check')
    }
    return response.json()
  }
}

// Export singleton instance
export const TerragonService = new TerragonServiceClass()