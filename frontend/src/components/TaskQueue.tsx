import React, { useState, useEffect } from 'react'
import { PlayCircle, RefreshCw, Loader, Package } from 'lucide-react'
import { Task } from '../types'
import { taskService } from '../services/TaskService'

interface TaskQueueProps {
  onQueueUpdate?: () => void
}

export const TaskQueue: React.FC<TaskQueueProps> = ({ onQueueUpdate }) => {
  const [queueStatus, setQueueStatus] = useState<{
    status: string
    queued_tasks: number
    processing: boolean
  }>({ status: 'idle', queued_tasks: 0, processing: false })
  const [queuedTasks, setQueuedTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    // Disable queue status loading for now - queue API not implemented
    // loadQueueStatus()
    // const interval = setInterval(loadQueueStatus, 5000)
    // return () => clearInterval(interval)
  }, [])

  const loadQueueStatus = async () => {
    // Queue API not implemented yet - show static status
    setQueueStatus({ status: 'idle', queued_tasks: 0, processing: false })
    setQueuedTasks([])
  }

  const handleProcessQueue = async () => {
    // Queue processing not implemented yet
    setError('Queue processing not available yet')
    setTimeout(() => setError(null), 3000)
  }

  const getStatusColor = () => {
    if (queueStatus.processing) return 'text-blue-600 dark:text-blue-400'
    if (queueStatus.queued_tasks > 0) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-gray-600 dark:text-gray-400'
  }

  const getStatusText = () => {
    if (queueStatus.processing) return 'Processing'
    if (queueStatus.queued_tasks > 0) return 'Ready'
    return 'Idle'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className={`w-5 h-5 ${getStatusColor()}`} />
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Task Queue</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {queueStatus.queued_tasks} task{queueStatus.queued_tasks !== 1 ? 's' : ''} • {getStatusText()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {queueStatus.processing && (
              <Loader className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleProcessQueue()
              }}
              disabled={loading || queueStatus.processing || queueStatus.queued_tasks === 0}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Process queue"
            >
              <PlayCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                loadQueueStatus()
              }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {isExpanded && queueStatus.queued_tasks > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="max-h-48 overflow-y-auto">
            {queuedTasks.map((task, index) => (
              <div
                key={task.id}
                className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      #{index + 1}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {task.name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {task.priority || 'normal'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 pb-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}