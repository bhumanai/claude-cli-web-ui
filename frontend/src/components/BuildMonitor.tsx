import React, { useState, useEffect } from 'react'
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  GitCommit,
  Clock,
  BarChart,
  Terminal,
  Package
} from 'lucide-react'
import { cn } from '../utils/cn'

interface BuildStatus {
  id: string
  name: string
  status: 'running' | 'success' | 'failed' | 'pending'
  branch: string
  commit: string
  author: string
  duration?: number
  startTime: Date
  logs?: string[]
  progress?: number
}

interface BuildMonitorProps {
  onExecuteCommand: (command: string) => void
  className?: string
}

export const BuildMonitor: React.FC<BuildMonitorProps> = ({
  onExecuteCommand,
  className
}) => {
  const [builds, setBuilds] = useState<BuildStatus[]>([
    {
      id: '1',
      name: 'Frontend Build',
      status: 'success',
      branch: 'main',
      commit: 'a2f3b8c',
      author: 'John Doe',
      duration: 245,
      startTime: new Date(Date.now() - 3600000),
      progress: 100
    },
    {
      id: '2',
      name: 'Backend Tests',
      status: 'running',
      branch: 'feature/auth',
      commit: 'd4e5f6a',
      author: 'Jane Smith',
      startTime: new Date(Date.now() - 120000),
      progress: 65,
      logs: [
        'Running unit tests...',
        'Passed: 45/68 tests',
        'Testing authentication module...'
      ]
    },
    {
      id: '3',
      name: 'E2E Tests',
      status: 'failed',
      branch: 'develop',
      commit: 'b1c2d3e',
      author: 'Bob Wilson',
      duration: 180,
      startTime: new Date(Date.now() - 7200000),
      progress: 100,
      logs: [
        'Error: Timeout waiting for element',
        'Failed at: test/e2e/login.spec.ts:45'
      ]
    }
  ])

  const [selectedBuild, setSelectedBuild] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Simulate build progress
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setBuilds(prevBuilds => 
        (prevBuilds || []).map(build => {
          if (build.status === 'running' && build.progress !== undefined) {
            const newProgress = Math.min(build.progress + 5, 95)
            return {
              ...build,
              progress: newProgress,
              duration: Math.floor((Date.now() - build.startTime.getTime()) / 1000)
            }
          }
          return build
        })
      )
    }, 2000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const getStatusIcon = (status: BuildStatus['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'pending':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
    }
  }

  const getStatusColor = (status: BuildStatus['status']) => {
    switch (status) {
      case 'running':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
      case 'success':
        return 'border-green-500 bg-green-50 dark:bg-green-900/20'
      case 'failed':
        return 'border-red-500 bg-red-50 dark:bg-red-900/20'
      case 'pending':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date)
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5" />
            Build Monitor
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "px-3 py-1 text-sm rounded-lg transition-colors",
                autoRefresh
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              )}
            >
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
            <button
              onClick={() => onExecuteCommand('npm run build')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Trigger new build"
            >
              <Play className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Build List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {builds.map((build) => (
          <div
            key={build.id}
            className={cn(
              "p-4 cursor-pointer transition-all",
              "hover:bg-gray-50 dark:hover:bg-gray-900/50",
              selectedBuild === build.id && "bg-gray-50 dark:bg-gray-900/50"
            )}
            onClick={() => setSelectedBuild(build.id === selectedBuild ? null : build.id)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                {getStatusIcon(build.status)}
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {build.name}
                  </h4>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <GitCommit className="w-3 h-3" />
                      {build.commit}
                    </span>
                    <span>{build.branch}</span>
                    <span>{build.author}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(build.duration)}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {formatTime(build.startTime)}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {build.status === 'running' && build.progress !== undefined && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Progress</span>
                  <span>{build.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${build.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Logs (when expanded) */}
            {selectedBuild === build.id && build.logs && (
              <div className={cn(
                "mt-4 p-3 rounded-lg border",
                getStatusColor(build.status)
              )}>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Build Logs
                  </h5>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onExecuteCommand(`npm run logs:${build.name.toLowerCase().replace(' ', '-')}`)
                    }}
                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    View Full Logs
                  </button>
                </div>
                <div className="font-mono text-xs space-y-1">
                  {build.logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "text-gray-600 dark:text-gray-400",
                        log.includes('Error') && "text-red-600 dark:text-red-400",
                        log.includes('Passed') && "text-green-600 dark:text-green-400"
                      )}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Success: {builds.filter(b => b.status === 'success').length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Failed: {builds.filter(b => b.status === 'failed').length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Running: {builds.filter(b => b.status === 'running').length}
              </span>
            </div>
          </div>
          <button
            onClick={() => onExecuteCommand('npm run build:stats')}
            className="flex items-center gap-2 text-violet-600 dark:text-violet-400 hover:underline"
          >
            <BarChart className="w-4 h-4" />
            View Statistics
          </button>
        </div>
      </div>
    </div>
  )
}