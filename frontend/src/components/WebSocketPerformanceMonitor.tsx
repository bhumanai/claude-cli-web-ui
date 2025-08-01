import React, { useState, useEffect, useCallback } from 'react'
import { WebSocketService } from '@/services/WebSocketService'

interface PerformanceMonitorProps {
  webSocketService: WebSocketService | null
  className?: string
}

interface DiagnosticData {
  connection: {
    status: string
    quality: string
    latency: number
    uptime: number
    reconnects: number
  }
  performance: {
    messagesPerSecond: number
    bytesPerSecond: number
    queueProcessingTime: number
    memoryUsage: number
  }
  queues: {
    outgoing: Record<string, number>
    scheduledUpdates: number
  }
  recommendations: string[]
}

const WebSocketPerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  webSocketService,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticData | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(2000)

  const updateDiagnostics = useCallback(() => {
    if (!webSocketService) {
      setDiagnostics(null)
      return
    }

    try {
      const report = webSocketService.getDiagnosticReport()
      setDiagnostics(report)
    } catch (error) {
      console.error('Failed to get diagnostic report:', error)
    }
  }, [webSocketService])

  const resetMetrics = useCallback(() => {
    if (webSocketService) {
      webSocketService.resetMetrics()
      updateDiagnostics()
    }
  }, [webSocketService, updateDiagnostics])

  const forceHealthCheck = useCallback(() => {
    if (webSocketService) {
      webSocketService.forceHealthCheck()
      setTimeout(updateDiagnostics, 1000) // Update after ping completes
    }
  }, [webSocketService, updateDiagnostics])

  const emergencyCleanup = useCallback(() => {
    if (webSocketService) {
      webSocketService.emergencyCleanup()
      updateDiagnostics()
    }
  }, [webSocketService, updateDiagnostics])

  useEffect(() => {
    if (!autoRefresh || !webSocketService) return

    const interval = setInterval(updateDiagnostics, refreshInterval)
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, updateDiagnostics, webSocketService])

  useEffect(() => {
    updateDiagnostics()
  }, [updateDiagnostics])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-500'
      case 'disconnected': return 'text-red-500'
      default: return 'text-yellow-500'
    }
  }

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-500'
      case 'good': return 'text-blue-500'
      case 'poor': return 'text-yellow-500'
      case 'critical': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  if (!webSocketService) {
    return (
      <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">
          WebSocket service not available
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${diagnostics?.connection.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="font-medium text-gray-900 dark:text-gray-100">
              WebSocket Performance
            </span>
          </div>
          {diagnostics && (
            <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
              <span className={getQualityColor(diagnostics.connection.quality)}>
                {diagnostics.connection.quality}
              </span>
              <span>{Math.round(diagnostics.connection.latency)}ms</span>
              <span>{Math.round(diagnostics.performance.messagesPerSecond)}/s</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setAutoRefresh(!autoRefresh)
            }}
            className={`px-2 py-1 text-xs rounded ${
              autoRefresh 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {autoRefresh ? 'Auto' : 'Manual'}
          </button>
          <svg 
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && diagnostics && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-6">
          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={updateDiagnostics}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
            >
              Refresh
            </button>
            <button
              onClick={forceHealthCheck}
              className="px-3 py-1 text-sm bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded hover:bg-green-200 dark:hover:bg-green-800"
            >
              Health Check
            </button>
            <button
              onClick={resetMetrics}
              className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800"
            >
              Reset Metrics
            </button>
            <button
              onClick={emergencyCleanup}
              className="px-3 py-1 text-sm bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
            >
              Emergency Cleanup
            </button>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
          </div>

          {/* Connection Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Status</div>
              <div className={`font-semibold ${getStatusColor(diagnostics.connection.status)}`}>
                {diagnostics.connection.status}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Quality</div>
              <div className={`font-semibold ${getQualityColor(diagnostics.connection.quality)}`}>
                {diagnostics.connection.quality}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Latency</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {Math.round(diagnostics.connection.latency)}ms
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Uptime</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {formatDuration(diagnostics.connection.uptime)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Reconnects</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {diagnostics.connection.reconnects}
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Messages/sec</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {Math.round(diagnostics.performance.messagesPerSecond * 10) / 10}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Bandwidth</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {formatBytes(diagnostics.performance.bytesPerSecond)}/s
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Queue Time</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {Math.round(diagnostics.performance.queueProcessingTime * 100) / 100}ms
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Memory</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {formatBytes(diagnostics.performance.memoryUsage)}
              </div>
            </div>
          </div>

          {/* Queue Status */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Message Queues</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(diagnostics.queues.outgoing).map(([priority, count]) => (
                <div key={priority} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-sm text-gray-600 dark:text-gray-400 capitalize">{priority}</div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{count}</div>
                </div>
              ))}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">UI Updates</div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {diagnostics.queues.scheduledUpdates}
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {diagnostics.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Recommendations</h4>
              <div className="space-y-2">
                {diagnostics.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start space-x-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                    <svg className="w-4 h-4 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">{rec}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default WebSocketPerformanceMonitor