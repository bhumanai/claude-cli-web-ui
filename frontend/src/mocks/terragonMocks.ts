/**
 * Mock data for Terragon development
 */

import type { TerragonWorker, TerragonTask, TerragonCluster } from '../services/TerragonService'

// Mock workers
export const mockWorkers: TerragonWorker[] = [
  {
    id: 'worker-1',
    name: 'CPU Worker Alpha',
    type: 'cpu',
    status: 'running',
    currentTask: {
      id: 'task-101',
      name: 'Processing user authentication logs',
      progress: 67,
      startedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      estimatedCompletion: new Date(Date.now() + 8 * 60 * 1000).toISOString()
    },
    resources: {
      cpu: 72,
      memory: 45,
      networkIn: 125,
      networkOut: 89,
      disk: {
        read: 450,
        write: 220
      }
    },
    metrics: {
      tasksCompleted: 156,
      totalRuntime: 25200000, // 7 hours in ms
      errorCount: 3,
      efficiency: 94,
      costPerHour: 0.85,
      successRate: 98.1
    },
    configuration: {
      maxCpu: 90,
      maxMemory: 80,
      priority: 'normal',
      autoScale: true,
      region: 'us-east-1'
    },
    lastHeartbeat: new Date(Date.now() - 30 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 1000).toISOString()
  },
  {
    id: 'worker-2',
    name: 'GPU Worker Beta',
    type: 'gpu',
    status: 'running',
    currentTask: {
      id: 'task-102',
      name: 'Training recommendation model',
      progress: 34,
      startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      estimatedCompletion: new Date(Date.now() + 90 * 60 * 1000).toISOString()
    },
    resources: {
      cpu: 45,
      memory: 78,
      gpu: 89,
      networkIn: 350,
      networkOut: 125
    },
    metrics: {
      tasksCompleted: 42,
      totalRuntime: 18000000, // 5 hours
      errorCount: 1,
      efficiency: 87,
      costPerHour: 3.25,
      successRate: 97.6
    },
    configuration: {
      maxCpu: 80,
      maxMemory: 90,
      priority: 'high',
      autoScale: false,
      region: 'us-west-2'
    },
    lastHeartbeat: new Date(Date.now() - 15 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 1000).toISOString()
  },
  {
    id: 'worker-3',
    name: 'Memory Worker Gamma',
    type: 'memory',
    status: 'idle',
    resources: {
      cpu: 12,
      memory: 22,
      networkIn: 10,
      networkOut: 5
    },
    metrics: {
      tasksCompleted: 89,
      totalRuntime: 14400000, // 4 hours
      errorCount: 0,
      efficiency: 96,
      costPerHour: 1.15,
      successRate: 100
    },
    configuration: {
      maxCpu: 70,
      maxMemory: 95,
      priority: 'low',
      autoScale: true,
      region: 'eu-west-1'
    },
    lastHeartbeat: new Date(Date.now() - 45 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 45 * 1000).toISOString()
  },
  {
    id: 'worker-4',
    name: 'IO Worker Delta',
    type: 'io',
    status: 'paused',
    resources: {
      cpu: 5,
      memory: 15,
      networkIn: 0,
      networkOut: 0
    },
    metrics: {
      tasksCompleted: 234,
      totalRuntime: 32400000, // 9 hours
      errorCount: 7,
      efficiency: 91,
      costPerHour: 0.65,
      successRate: 97.0
    },
    configuration: {
      maxCpu: 60,
      maxMemory: 60,
      priority: 'normal',
      autoScale: true,
      region: 'ap-southeast-1'
    },
    lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
  },
  {
    id: 'worker-5',
    name: 'CPU Worker Epsilon',
    type: 'cpu',
    status: 'error',
    resources: {
      cpu: 0,
      memory: 0,
      networkIn: 0,
      networkOut: 0
    },
    metrics: {
      tasksCompleted: 67,
      totalRuntime: 10800000, // 3 hours
      errorCount: 15,
      efficiency: 72,
      costPerHour: 0.85,
      successRate: 81.7
    },
    configuration: {
      maxCpu: 85,
      maxMemory: 75,
      priority: 'normal',
      autoScale: false,
      region: 'us-east-2'
    },
    lastHeartbeat: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  }
]

// Mock tasks
export const mockTasks: TerragonTask[] = [
  {
    id: 'task-101',
    name: 'Processing user authentication logs',
    description: 'Analyze and process authentication logs for security insights',
    type: 'data-processing',
    priority: 'high',
    status: 'running',
    assignedWorker: 'worker-1',
    progress: 67,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    startedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    estimatedDuration: 1800000 // 30 minutes
  },
  {
    id: 'task-102',
    name: 'Training recommendation model',
    description: 'Train ML model for product recommendations',
    type: 'machine-learning',
    priority: 'critical',
    status: 'running',
    assignedWorker: 'worker-2',
    progress: 34,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    estimatedDuration: 7200000 // 2 hours
  },
  {
    id: 'task-103',
    name: 'Generate monthly reports',
    description: 'Compile and generate monthly analytics reports',
    type: 'reporting',
    priority: 'normal',
    status: 'pending',
    progress: 0,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    estimatedDuration: 3600000 // 1 hour
  },
  {
    id: 'task-104',
    name: 'Database backup',
    description: 'Perform scheduled database backup',
    type: 'maintenance',
    priority: 'high',
    status: 'pending',
    progress: 0,
    createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    estimatedDuration: 2400000 // 40 minutes
  },
  {
    id: 'task-105',
    name: 'Image optimization batch',
    description: 'Optimize uploaded images for web delivery',
    type: 'media-processing',
    priority: 'low',
    status: 'completed',
    progress: 100,
    result: {
      processed: 1247,
      optimized: 1235,
      failed: 12,
      totalSizeSaved: '2.4GB'
    },
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    startedAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    estimatedDuration: 7200000,
    actualDuration: 9000000
  }
]

// Mock clusters
export const mockClusters: TerragonCluster[] = [
  {
    id: 'cluster-1',
    name: 'US East Production',
    region: 'us-east-1',
    workers: 12,
    activeWorkers: 10,
    totalCapacity: {
      cpu: 960,
      memory: 3840,
      gpu: 8
    },
    currentLoad: {
      cpu: 687,
      memory: 2304,
      gpu: 6
    },
    status: 'healthy',
    healthChecks: {
      api: true,
      workers: true,
      network: true,
      storage: true
    }
  },
  {
    id: 'cluster-2',
    name: 'EU West Production',
    region: 'eu-west-1',
    workers: 8,
    activeWorkers: 7,
    totalCapacity: {
      cpu: 640,
      memory: 2560,
      gpu: 4
    },
    currentLoad: {
      cpu: 412,
      memory: 1843,
      gpu: 2
    },
    status: 'healthy',
    healthChecks: {
      api: true,
      workers: true,
      network: true,
      storage: true
    }
  },
  {
    id: 'cluster-3',
    name: 'Asia Pacific Dev',
    region: 'ap-southeast-1',
    workers: 4,
    activeWorkers: 2,
    totalCapacity: {
      cpu: 320,
      memory: 1280
    },
    currentLoad: {
      cpu: 89,
      memory: 356
    },
    status: 'degraded',
    healthChecks: {
      api: true,
      workers: false,
      network: true,
      storage: true
    }
  }
]

// Mock metrics data
export const mockMetrics = {
  workers: {
    total: 24,
    active: 19,
    idle: 3,
    error: 2
  },
  tasks: {
    completed: 3847,
    failed: 92,
    pending: 156,
    avgDuration: 2340000 // 39 minutes
  },
  resources: {
    cpuUtilization: 71.5,
    memoryUtilization: 62.3,
    networkThroughput: 1250 // MB/s
  },
  cost: {
    current: 48.75,
    projected: 1170.00,
    trend: 5.2 // % increase
  }
}

// Mock worker metrics timeline
export const mockWorkerMetrics = {
  timeline: Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.now() - (24 - i) * 60 * 60 * 1000).toISOString(),
    cpu: Math.random() * 40 + 40,
    memory: Math.random() * 30 + 50,
    tasks: Math.floor(Math.random() * 10 + 5)
  })),
  summary: {
    avgCpu: 65.3,
    avgMemory: 58.7,
    peakCpu: 92.1,
    peakMemory: 87.4,
    totalTasks: 156,
    successRate: 98.1
  }
}

// Mock cost estimate
export const mockCostEstimate = {
  hourlyRate: 2.45,
  totalCost: 58.80,
  breakdown: {
    compute: 45.60,
    network: 8.20,
    storage: 5.00
  }
}