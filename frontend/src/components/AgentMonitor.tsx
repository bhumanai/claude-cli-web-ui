import { useState, useEffect, useCallback } from 'react'
import { TerragoWorker } from '../types'
import { taskService } from '../services/TaskService'
import { useWorkerSSE } from '../hooks/useSSE'
import { 
  Activity, 
  Server, 
  Clock, 
  DollarSign, 
  Play, 
  Pause, 
  Square, 
  AlertTriangle,
  RefreshCw,
  Monitor,
  Cpu,
  HardDrive,
  Zap
} from 'lucide-react'

interface AgentMonitorProps {
  className?: string
}

interface WorkerMetrics {
  id: string
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  networkIn: number
  networkOut: number
  uptime: number
  lastSeen: Date
}

const STATUS_COLORS = {
  creating: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  running: 'bg-green-100 text-green-800 border-green-200',
  stopping: 'bg-orange-100 text-orange-800 border-orange-200',
  stopped: 'bg-gray-100 text-gray-800 border-gray-200',
  failed: 'bg-red-100 text-red-800 border-red-200'
}

const STATUS_ICONS = {
  creating: <Clock className="w-4 h-4" />,
  running: <Play className="w-4 h-4" />,
  stopping: <Pause className="w-4 h-4" />,
  stopped: <Square className="w-4 h-4" />,
  failed: <AlertTriangle className="w-4 h-4" />
}

export function AgentMonitor({ className = '' }: AgentMonitorProps) {
  const [workers, setWorkers] = useState<TerragoWorker[]>([])
  const [metrics, setMetrics] = useState<Map<string, WorkerMetrics>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null)
  const [totalCost, setTotalCost] = useState(0)

  const sessionId = `monitor_${Date.now()}`
  const workerSSE = useWorkerSSE(sessionId, (workerUpdate) => {
    setWorkers(prev => {
      const updated = prev.map(w => w.id === workerUpdate.id ? { ...w, ...workerUpdate } : w)
      
      // Add new workers
      if (!prev.find(w => w.id === workerUpdate.id)) {
        updated.push(workerUpdate)
      }
      
      return updated
    })
  })

  // Load workers data
  const loadWorkers = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const workersData = await taskService.getWorkers()
      setWorkers(workersData)
      
      // Calculate total cost
      const cost = workersData.reduce((sum, worker) => sum + (worker.cost_estimate || 0), 0)
      setTotalCost(cost)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workers')
    } finally {
      setLoading(false)
    }
  }, [])

  // Simulate metrics updates (in real implementation, this would come from SSE or polling)
  useEffect(() => {
    const updateMetrics = () => {
      const newMetrics = new Map<string, WorkerMetrics>()
      
      workers.forEach(worker => {
        if (worker.status === 'running') {
          newMetrics.set(worker.id, {
            id: worker.id,
            cpuUsage: Math.random() * 100,
            memoryUsage: Math.random() * 100,
            diskUsage: Math.random() * 100,
            networkIn: Math.random() * 1000,
            networkOut: Math.random() * 1000,
            uptime: Date.now() - new Date(worker.created_at).getTime(),
            lastSeen: new Date()
          })
        }
      })
      
      setMetrics(newMetrics)
    }

    const interval = setInterval(updateMetrics, 5000) // Update every 5 seconds
    updateMetrics() // Initial update

    return () => clearInterval(interval)
  }, [workers])

  // Load data on mount
  useEffect(() => {
    loadWorkers()
  }, [loadWorkers])

  // Worker control actions
  const handleStartWorker = async (workerId: string) => {
    try {
      // Implementation would depend on backend API
      console.log('Starting worker:', workerId)
    } catch (error) {
      setError('Failed to start worker')
    }
  }

  const handleStopWorker = async (workerId: string) => {
    try {
      await taskService.terminateWorker(workerId)
      setWorkers(prev => prev.map(w => 
        w.id === workerId ? { ...w, status: 'stopping' } : w
      ))
    } catch (error) {
      setError('Failed to stop worker')
    }
  }

  const handleRestartWorker = async (workerId: string) => {
    try {
      await handleStopWorker(workerId)
      setTimeout(() => handleStartWorker(workerId), 2000)
    } catch (error) {
      setError('Failed to restart worker')
    }
  }

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const selectedWorkerData = selectedWorker ? workers.find(w => w.id === selectedWorker) : null
  const selectedWorkerMetrics = selectedWorker ? metrics.get(selectedWorker) : null

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Agent Monitor
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadWorkers}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
            workerSSE.isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {workerSSE.isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <Server className="w-8 h-8 text-blue-600" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {workers.length}
              </div>
              <div className="text-sm text-gray-500">Total Workers</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {workers.filter(w => w.status === 'running').length}
              </div>
              <div className="text-sm text-gray-500">Active</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {workers.filter(w => w.status === 'failed').length}
              </div>
              <div className="text-sm text-gray-500">Failed</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-yellow-600" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                ${totalCost.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500">Total Cost</div>
            </div>
          </div>
        </div>
      </div>

      {/* Worker List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worker List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Workers
            </h3>
          </div>
          
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {workers.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No workers found
              </div>
            ) : (
              workers.map(worker => {
                const workerMetrics = metrics.get(worker.id)
                
                return (
                  <div
                    key={worker.id}
                    onClick={() => setSelectedWorker(worker.id)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedWorker === worker.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {STATUS_ICONS[worker.status]}
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {worker.name}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {worker.id}
                          </p>
                        </div>
                      </div>
                      
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[worker.status]}`}>
                        {worker.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>Task: {worker.task_id}</span>
                      <span>${worker.cost_estimate.toFixed(4)}/hr</span>
                    </div>
                    
                    {workerMetrics && (
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="font-medium">{workerMetrics.cpuUsage.toFixed(1)}%</div>
                          <div className="text-gray-500">CPU</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{workerMetrics.memoryUsage.toFixed(1)}%</div>
                          <div className="text-gray-500">Memory</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{formatUptime(workerMetrics.uptime)}</div>
                          <div className="text-gray-500">Uptime</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Worker Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Worker Details
            </h3>
          </div>
          
          {selectedWorkerData ? (
            <div className="p-4 space-y-4">
              {/* Worker Info */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                      {selectedWorkerData.name}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedWorkerData.id}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartWorker(selectedWorkerData.id)}
                      disabled={selectedWorkerData.status === 'running'}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      Start
                    </button>
                    <button
                      onClick={() => handleStopWorker(selectedWorkerData.id)}
                      disabled={selectedWorkerData.status !== 'running'}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 flex items-center gap-1"
                    >
                      <Square className="w-3 h-3" />
                      Stop
                    </button>
                    <button
                      onClick={() => handleRestartWorker(selectedWorkerData.id)}
                      className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Restart
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <span className={`ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[selectedWorkerData.status]}`}>
                      {selectedWorkerData.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Cost:</span>
                    <span className="ml-2 font-medium">${selectedWorkerData.cost_estimate.toFixed(4)}/hr</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Created:</span>
                    <span className="ml-2">{new Date(selectedWorkerData.created_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Task:</span>
                    <span className="ml-2 font-mono text-xs">{selectedWorkerData.task_id}</span>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              {selectedWorkerMetrics && (
                <div>
                  <h5 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Performance Metrics
                  </h5>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-blue-600" />
                        <div className="flex-1">
                          <div className="flex justify-between text-sm">
                            <span>CPU Usage</span>
                            <span>{selectedWorkerMetrics.cpuUsage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${selectedWorkerMetrics.cpuUsage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-green-600" />
                        <div className="flex-1">
                          <div className="flex justify-between text-sm">
                            <span>Memory</span>
                            <span>{selectedWorkerMetrics.memoryUsage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div 
                              className="bg-green-600 h-2 rounded-full transition-all"
                              style={{ width: `${selectedWorkerMetrics.memoryUsage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-purple-600" />
                        <div className="flex-1">
                          <div className="flex justify-between text-sm">
                            <span>Disk</span>
                            <span>{selectedWorkerMetrics.diskUsage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div 
                              className="bg-purple-600 h-2 rounded-full transition-all"
                              style={{ width: `${selectedWorkerMetrics.diskUsage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-orange-600" />
                        <div>
                          <div className="text-sm text-gray-500">Network In</div>
                          <div className="font-medium">{formatBytes(selectedWorkerMetrics.networkIn)}/s</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-red-600" />
                        <div>
                          <div className="text-sm text-gray-500">Network Out</div>
                          <div className="font-medium">{formatBytes(selectedWorkerMetrics.networkOut)}/s</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-600" />
                        <div>
                          <div className="text-sm text-gray-500">Uptime</div>
                          <div className="font-medium">{formatUptime(selectedWorkerMetrics.uptime)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-500">
                    Last updated: {selectedWorkerMetrics.lastSeen.toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Select a worker to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}