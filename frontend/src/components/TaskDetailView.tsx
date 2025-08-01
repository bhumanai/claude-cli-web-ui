import React, { useState, useEffect } from 'react'
import { ArrowLeft, Calendar, Clock, AlertCircle, Info, TestTube } from 'lucide-react'
import { Task } from '../types'
import { Terminal } from './Terminal'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWebSocketFallback } from '../hooks/useWebSocketFallback'
import { generateSessionId } from '../utils/helpers'
import { getApiUrl } from '@/config/backend'

interface TaskDetailViewProps {
  task: Task
  onBack: () => void
  onStatusUpdate: (taskId: string, status: string) => Promise<void>
}

export const TaskDetailView: React.FC<TaskDetailViewProps> = ({ task, onBack, onStatusUpdate }) => {
  const [taskContent, setTaskContent] = useState<string>('')
  const [updating, setUpdating] = useState(false)
  const [testing, setTesting] = useState(false)
  const sessionId = generateSessionId()
  
  // Try WebSocket first, fallback to HTTP if not available
  const wsHook = useWebSocket(sessionId)
  const fallbackHook = useWebSocketFallback(sessionId)
  
  // Use fallback if WebSocket fails
  const activeHook = wsHook.isConnected ? wsHook : fallbackHook
  const {
    isConnected,
    commandHistory,
    sendCommand,
    clearHistory
  } = activeHook
  
  const showConnectionWarning = 'showConnectionWarning' in fallbackHook ? fallbackHook.showConnectionWarning : false

  useEffect(() => {
    // Load task.md content if available
    const loadTaskContent = async () => {
      try {
        // Get API URL from environment variables with fallback
        const apiUrl = getApiUrl()
        const response = await fetch(`${apiUrl}/api/tasks/${task.id}/content`)
        if (response.ok) {
          const data = await response.json()
          setTaskContent(data.content || 'No task content available.')
        } else {
          setTaskContent(task.description || 'No task description available.')
        }
      } catch (error) {
        console.error('Failed to load task content:', error)
        setTaskContent(task.description || 'Error loading task content.')
      }
    }
    
    loadTaskContent()
  }, [task])

  const [showPlanPrompt, setShowPlanPrompt] = useState(false)
  const [planningInProgress, setPlanningInProgress] = useState(false)
  const [autoPlanExecuted, setAutoPlanExecuted] = useState(false)

  useEffect(() => {
    // Show plan prompt for pending tasks
    const shouldShowPlanPrompt = task.status === 'pending'
    
    console.log('Auto-plan check:', {
      taskStatus: task.status,
      shouldShowPlanPrompt,
      autoPlanExecuted,
      isConnected
    })

    setShowPlanPrompt(shouldShowPlanPrompt)
    
    // Auto-execute /plan for pending tasks when connected
    if (shouldShowPlanPrompt && !autoPlanExecuted && isConnected) {
      console.log('Triggering auto-plan in 500ms...')
      // Small delay to ensure terminal is ready
      setTimeout(() => {
        executeAutoPlan()
      }, 500)
    }
  }, [task, isConnected, autoPlanExecuted])

  const executeAutoPlan = async () => {
    if (autoPlanExecuted || planningInProgress) return
    
    setAutoPlanExecuted(true)
    setPlanningInProgress(true)
    
    const planCommand = `/plan Task: ${task.name} | Description: ${task.description || 'No description provided'}`
    
    try {
      await sendCommand(planCommand)
    } catch (error) {
      console.error('Failed to execute auto-plan:', error)
    } finally {
      // Don't set planningInProgress to false here - let it be controlled by command completion
    }
  }

  // Monitor command history to detect when planning completes
  useEffect(() => {
    if (planningInProgress && commandHistory.length > 0) {
      const lastCommand = commandHistory[commandHistory.length - 1]
      if (lastCommand.command.startsWith('/plan') && (lastCommand.status === 'completed' || lastCommand.status === 'error')) {
        setPlanningInProgress(false)
      }
    }
  }, [commandHistory, planningInProgress])

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true)
    try {
      await onStatusUpdate(task.id, newStatus)
    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setUpdating(false)
    }
  }

  const handleTestTask = async () => {
    setTesting(true)
    try {
      // Get API URL from environment variables with fallback
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/commands/agent-test`, {
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
      
      // Send a message to the terminal about the test
      await sendCommand(`# Agent test started for task: ${task.name}`)
      await sendCommand(`# Test session: ${result.session_id}`)
      
    } catch (error) {
      console.error('Failed to start agent test:', error) 
      await sendCommand(`# ❌ Failed to start agent test: ${error}`)
    } finally {
      setTesting(false)
    }
  }

  const priorityColors = {
    low: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    medium: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
    high: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
  }

  const statusColors = {
    pending: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20',
    in_progress: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    completed: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    blocked: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tasks
        </button>
        
        <button
          onClick={handleTestTask}
          disabled={testing}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            testing
              ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 cursor-not-allowed'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title={testing ? 'Testing in progress...' : 'Test this task with agent'}
        >
          <TestTube className={`w-4 h-4 ${testing ? 'animate-pulse' : ''}`} />
          {testing ? 'Testing...' : 'Test Task'}
        </button>
      </div>

      {/* Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
        {/* Left Panel - Task Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-full flex flex-col overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1">
            {/* Task Title */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {task.name}
            </h2>

            {/* Task Metadata */}
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={updating}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    statusColors[task.status as keyof typeof statusColors]
                  } border border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500`}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Priority:</span>
                <span className={`px-3 py-1 rounded-md text-sm font-medium ${
                  priorityColors[(task.priority || 'medium') as keyof typeof priorityColors]
                }`}>
                  {(task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)}
                </span>
              </div>

              {task.created_at && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Calendar className="w-4 h-4" />
                  <span>Created: {new Date(task.created_at).toLocaleDateString()}</span>
                </div>
              )}

              {task.updated_at && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>Updated: {new Date(task.updated_at).toLocaleDateString()}</span>
                </div>
              )}

              {task.path && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-mono text-xs">{task.path}</span>
                </div>
              )}
            </div>

            {/* Planning Progress for New Tasks */}
            {showPlanPrompt && (
              <div className="border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4 mb-6">
                {planningInProgress ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-violet-600 border-t-transparent"></div>
                      <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100">
                        Planning Task in Progress...
                      </h3>
                    </div>
                    <p className="text-sm text-violet-700 dark:text-violet-300">
                      Claude is analyzing your task and creating a detailed execution plan. You can watch the progress in the terminal on the right.
                    </p>
                    <div className="bg-gray-900 dark:bg-black rounded-md p-3 font-mono text-sm text-gray-100 overflow-x-auto">
                      <code>
                        /plan Task: {task.name} | Description: {task.description || 'No description provided'}
                      </code>
                    </div>
                  </div>
                ) : autoPlanExecuted ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full h-5 w-5 bg-green-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100">
                        Task Planning Complete!
                      </h3>
                    </div>
                    <p className="text-sm text-violet-700 dark:text-violet-300">
                      Your task has been analyzed and planned. Check the terminal output for the detailed execution plan.
                    </p>
                    <p className="text-xs text-violet-600 dark:text-violet-400">
                      Next: Use <code className="bg-violet-100 dark:bg-violet-800 px-1 rounded">/smart-task</code> to execute the plan
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100">
                      Ready to Plan This Task?
                    </h3>
                    <p className="text-sm text-violet-700 dark:text-violet-300 mb-3">
                      Planning will start automatically when the terminal connects, or you can run this command manually:
                    </p>
                    <div className="bg-gray-900 dark:bg-black rounded-md p-3 font-mono text-sm text-gray-100 overflow-x-auto">
                      <code>
                        /plan Task: {task.name} | Description: {task.description || 'No description provided'}
                      </code>
                    </div>
                    <button
                      onClick={executeAutoPlan}
                      disabled={!isConnected}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Start Planning Now
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Task Description */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Task Details
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
                  {taskContent}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Terminal */}
        <div className="overflow-hidden">
          <div className="bg-gray-900 rounded-lg border border-gray-700 h-full flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100">Task Terminal</h3>
              {showConnectionWarning && (
                <div className="mt-2 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-300">
                      <p className="font-semibold mb-1">Running in Simple Server Mode</p>
                      <p className="mb-2">WebSocket and Claude CLI features are not available. Commands will be executed via HTTP.</p>
                      <p className="text-xs">For full features, run: <code className="px-1 py-0.5 bg-yellow-900/50 rounded">python main.py</code></p>
                    </div>
                  </div>
                </div>
              )}
              {showPlanPrompt && (
                <div className="mt-2 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                  {planningInProgress ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent"></div>
                      <p className="text-sm text-blue-300">
                        <strong>Planning in progress...</strong> Claude is analyzing your task and creating an execution plan.
                      </p>
                    </div>
                  ) : autoPlanExecuted ? (
                    <p className="text-sm text-blue-300">
                      ✅ <strong>Planning complete!</strong> Check the output above for your detailed execution plan.
                    </p>
                  ) : (
                    <p className="text-sm text-blue-300">
                      💡 <strong>Ready to plan this task?</strong> Try running <code className="px-1 py-0.5 bg-blue-900/50 rounded">/plan</code> to start the planning process.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <Terminal
                commandHistory={commandHistory}
                onExecuteCommand={sendCommand}
                onClearHistory={clearHistory}
                isConnected={isConnected}
                className="h-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}