import { useState, useEffect, useCallback, useRef } from 'react'
import { Task, TaskPriority, TaskStatus, QueueStatus } from '../types'
import { taskService } from '../services/TaskService'
import { useSSE } from '../hooks/useSSE'
import { 
  Play, 
  Pause, 
  Square, 
  MoreVertical, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  GripVertical,
  Filter,
  Search,
  RefreshCw
} from 'lucide-react'

interface QueueDashboardProps {
  projectId?: string
  className?: string
}

interface DragState {
  isDragging: boolean
  draggedTask: Task | null
  dragOverIndex: number | null
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200'
}

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-gray-500" />,
  queued: <Clock className="w-4 h-4 text-blue-500" />,
  running: <Play className="w-4 h-4 text-green-500" />,
  completed: <CheckCircle className="w-4 h-4 text-green-600" />,
  failed: <XCircle className="w-4 h-4 text-red-600" />,
  cancelled: <Square className="w-4 h-4 text-gray-600" />,
  timeout: <AlertCircle className="w-4 h-4 text-orange-600" />
}

export function QueueDashboard({ projectId, className = '' }: QueueDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedTask: null,
    dragOverIndex: null
  })

  const sessionId = useRef(`queue_${Date.now()}`).current
  const sse = useSSE(sessionId, {
    channel: `queue_${projectId || 'global'}`,
    onError: (error) => setError(error),
    onConnectionChange: (connected) => {
      if (!connected) {
        setError('Real-time connection lost')
      }
    }
  })

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const [tasksData, statusData] = await Promise.all([
        taskService.getTasks(projectId),
        taskService.getQueueStatus(projectId ? `project_${projectId}` : undefined)
      ])
      
      setTasks(tasksData)
      setQueueStatus(statusData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue data')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Set up real-time updates
  useEffect(() => {
    sse.on('task_created', (task) => {
      setTasks(prev => [...prev, task])
    })
    
    sse.on('task_updated', (task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    })
    
    sse.on('task_completed', (task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed', completed_at: new Date() } : t))
    })
    
    sse.on('task_failed', (task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', error_message: task.error } : t))
    })
    
    sse.on('queue_updated', (status) => {
      setQueueStatus(status)
    })

    return () => {
      // Cleanup listeners handled by SSE service
    }
  }, [sse])

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (searchTerm && !task.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !task.command.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    
    if (statusFilter !== 'all' && task.status !== statusFilter) {
      return false
    }
    
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
      return false
    }
    
    return true
  })

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDragState({
      isDragging: true,
      draggedTask: task,
      dragOverIndex: null
    })
    
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    setDragState(prev => ({
      ...prev,
      dragOverIndex: index
    }))
  }

  const handleDragLeave = () => {
    setDragState(prev => ({
      ...prev,
      dragOverIndex: null
    }))
  }

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    
    const { draggedTask } = dragState
    if (!draggedTask) return

    const currentIndex = tasks.findIndex(t => t.id === draggedTask.id)
    if (currentIndex === targetIndex) return

    // Optimistically update UI
    const newTasks = [...tasks]
    newTasks.splice(currentIndex, 1)
    newTasks.splice(targetIndex, 0, draggedTask)
    setTasks(newTasks)

    // Reset drag state
    setDragState({
      isDragging: false,
      draggedTask: null,
      dragOverIndex: null
    })

    try {
      // Update task priority based on position (higher index = higher priority)
      const newPriority: TaskPriority = targetIndex < tasks.length / 4 ? 'critical' :
                                        targetIndex < tasks.length / 2 ? 'high' :
                                        targetIndex < tasks.length * 3/4 ? 'medium' : 'low'

      await taskService.updateTask(draggedTask.id, { priority: newPriority })
    } catch (error) {
      // Revert on error
      setTasks(tasks)
      setError('Failed to reorder task')
    }
  }

  const handleDragEnd = () => {
    setDragState({
      isDragging: false,
      draggedTask: null,
      dragOverIndex: null
    })
  }

  // Queue control actions
  const handleStartQueue = async () => {
    if (!queueStatus) return
    
    try {
      await taskService.processQueue(queueStatus.id)
    } catch (error) {
      setError('Failed to start queue processing')
    }
  }

  const handlePauseQueue = async () => {
    // Implementation would depend on backend API
    setError('Pause functionality not yet implemented')
  }

  const handleClearCompleted = async () => {
    const completedTasks = tasks.filter(t => t.status === 'completed')
    
    try {
      await Promise.all(completedTasks.map(t => taskService.deleteTask(t.id)))
      setTasks(prev => prev.filter(t => t.status !== 'completed'))
    } catch (error) {
      setError('Failed to clear completed tasks')
    }
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
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
          Task Queue
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
            sse.isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {sse.isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
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

      {/* Queue Status */}
      {queueStatus && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Queue Status: {queueStatus.name}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartQueue}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
              <button
                onClick={handlePauseQueue}
                className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 flex items-center gap-1"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
              <button
                onClick={handleClearCompleted}
                className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Clear Completed
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{queueStatus.pending_tasks}</div>
              <div className="text-sm text-gray-500">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{queueStatus.running_tasks}</div>
              <div className="text-sm text-gray-500">Running</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{queueStatus.completed_tasks}</div>
              <div className="text-sm text-gray-500">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{queueStatus.failed_tasks}</div>
              <div className="text-sm text-gray-500">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{queueStatus.active_workers}</div>
              <div className="text-sm text-gray-500">Workers</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
              className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="all">All Priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Tasks ({filteredTasks.length})
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drag tasks to reorder by priority
          </p>
        </div>
        
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No tasks found
            </div>
          ) : (
            filteredTasks.map((task, index) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-move transition-colors ${
                  dragState.dragOverIndex === index ? 'bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-500' : ''
                } ${dragState.draggedTask?.id === task.id ? 'opacity-50' : ''}`}
              >
                <GripVertical className="w-4 h-4 text-gray-400" />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    {STATUS_ICONS[task.status]}
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {task.name}
                    </h4>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${PRIORITY_COLORS[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {task.command}
                  </p>
                  
                  {task.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                      {task.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>Created: {new Date(task.created_at).toLocaleString()}</span>
                    {task.started_at && (
                      <span>Started: {new Date(task.started_at).toLocaleString()}</span>
                    )}
                    {task.completed_at && task.started_at && (
                      <span>Duration: {formatDuration(
                        new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()
                      )}</span>
                    )}
                  </div>
                </div>
                
                <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}