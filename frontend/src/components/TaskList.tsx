import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Circle, CheckCircle, Clock, AlertCircle, ChevronRight, TestTube } from 'lucide-react'
import { Task, TaskCreateRequest, Project } from '../types'
import { taskService } from '../services/TaskService'
import { LoadingSkeleton } from './LoadingSkeleton'

interface TaskListProps {
  project: Project | null
  onTaskUpdate?: () => void
  onTaskSelect?: (task: Task) => void
}

const statusIcons = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle,
  failed: AlertCircle,
  queued: ChevronRight
}

const statusColors = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  queued: 'text-yellow-500'
}

const priorityColors = {
  low: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  medium: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
  high: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
}

export const TaskList: React.FC<TaskListProps> = ({ project, onTaskUpdate, onTaskSelect }) => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTask, setNewTask] = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [testingTasks, setTestingTasks] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (project) {
      loadTasks()
    } else {
      setTasks([])
    }
  }, [project])

  const loadTasks = async () => {
    if (!project) return

    try {
      setLoading(true)
      const taskList = await taskService.getTasks(project.id)
      setTasks(taskList)
    } catch (err) {
      setError('Failed to load tasks')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project || !newTask.name) return

    try {
      setLoading(true)
      const taskRequest: TaskCreateRequest = {
        project_id: project.id,
        name: newTask.name,
        description: newTask.description,
        command: `/plan ${newTask.name}`, // Default command for new tasks
        priority: 'medium'
      }
      const created = await taskService.createTask(taskRequest)
      setTasks([...tasks, created])
      setNewTask({ name: '', description: '' })
      setShowCreateForm(false)
      if (onTaskUpdate) onTaskUpdate()
      
      // Immediately open the task detail view
      if (onTaskSelect) {
        onTaskSelect(created)
      }
    } catch (err) {
      setError('Failed to create task')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async (taskId: string, status: Task['status']) => {
    try {
      const updated = await taskService.updateTaskStatus(taskId, status)
      setTasks(tasks.map(t => t.id === taskId ? updated : t))
      if (onTaskUpdate) onTaskUpdate()
    } catch (err) {
      setError('Failed to update task status')
      console.error(err)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await taskService.deleteTask(taskId)
      setTasks(tasks.filter(t => t.id !== taskId))
      if (onTaskUpdate) onTaskUpdate()
    } catch (err) {
      setError('Failed to delete task')
      console.error(err)
    }
  }

  const handleTestTask = async (task: Task) => {
    try {
      // Mark this task as being tested
      setTestingTasks(prev => new Set([...prev, task.id]))
      
      // Send the task context to the agent test endpoint
      const response = await fetch('/api/commands/agent-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_name: task.name,
          task_description: task.description,
          task_status: task.status,
          task_id: task.id,
          context: `Task: ${task.name}\nDescription: ${task.description}\nStatus: ${task.status}\nCreated: ${task.created_at}`
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to start agent test')
      }
      
      const result = await response.json()
      console.log('Agent test started:', result)
      
      // Show success message
      setError(`✅ Agent test started for "${task.name}" - Session: ${result.session_id}`)
      
      // Remove from testing set after a delay (test is now running in background)
      setTimeout(() => {
        setTestingTasks(prev => {
          const newSet = new Set(prev)
          newSet.delete(task.id)
          return newSet
        })
      }, 3000)
      
    } catch (err) {
      setError(`❌ Failed to start agent test for "${task.name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
      console.error(err)
      
      // Remove from testing set on error
      setTestingTasks(prev => {
        const newSet = new Set(prev)
        newSet.delete(task.id)
        return newSet
      })
    }
  }

  const filteredTasks = statusFilter === 'all' 
    ? tasks 
    : tasks.filter(t => t.status === statusFilter)

  const nextStatus = (currentStatus: Task['status']): Task['status'] => {
    const statusFlow: Record<Task['status'], Task['status']> = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'completed',
      failed: 'pending',
      queued: 'in_progress',
      blocked: 'pending'
    }
    return statusFlow[currentStatus] || 'pending'
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <p>Select a project to view tasks</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tasks</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1 text-sm rounded-full transition-colors ${
            statusFilter === 'all'
              ? 'bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          All ({tasks.length})
        </button>
        {(['pending', 'in_progress', 'completed', 'failed', 'queued', 'blocked'] as const).map(status => {
          const count = tasks.filter(t => t.status === status).length
          if (count === 0) return null
          
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                statusFilter === status
                  ? 'bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {(status || 'unknown').replace('_', ' ')} ({count})
            </button>
          )
        })}
      </div>

      {/* Create Task Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateTask} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Task name"
            value={newTask.name}
            onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 mb-2"
            autoFocus
          />
          <textarea
            placeholder="Description (optional)"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 mb-3 resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !newTask.name}
              className="px-4 py-2 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Task
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false)
                setNewTask({ name: '', description: '' })
              }}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Task List */}
      <div className="space-y-2">
        {loading && !tasks.length ? (
          <LoadingSkeleton count={3} />
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {statusFilter === 'all' ? 'No tasks yet' : `No ${(statusFilter || 'unknown').replace('_', ' ')} tasks`}
          </div>
        ) : (
          filteredTasks.map((task) => {
            const safeStatus = task.status || 'pending'
            const StatusIcon = statusIcons[safeStatus] || statusIcons.pending
            const statusColor = statusColors[safeStatus] || statusColors.pending
            
            return (
              <div
                key={task.id}
                className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onTaskSelect && onTaskSelect(task)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUpdateStatus(task.id, nextStatus(safeStatus))
                      }}
                      className={`mt-0.5 ${statusColor} hover:opacity-70 transition-opacity`}
                      title={`Mark as ${nextStatus(safeStatus).replace('_', ' ')}`}
                    >
                      <StatusIcon className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">{task.name}</h3>
                      {task.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {task.priority && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
                            {task.priority}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Created {new Date(task.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTestTask(task)
                      }}
                      disabled={testingTasks.has(task.id)}
                      className={`transition-colors ${
                        testingTasks.has(task.id)
                          ? 'text-blue-500 animate-pulse cursor-not-allowed'
                          : 'text-gray-400 hover:text-blue-500'
                      }`}
                      title={
                        testingTasks.has(task.id)
                          ? 'Testing in progress...'
                          : 'Test this task with agent'
                      }
                    >
                      <TestTube className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTask(task.id)
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {error && (
        <div className={`p-3 rounded-md border ${
          error.startsWith('✅') 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          <p className={`text-sm ${
            error.startsWith('✅')
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}>{error}</p>
        </div>
      )}
    </div>
  )
}