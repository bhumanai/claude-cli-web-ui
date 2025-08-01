import React, { useState, useEffect, useRef } from 'react'
import {
  FileText,
  Search,
  Filter,
  AlertTriangle,
  Info,
  XCircle,
  AlertCircle,
  Download,
  Clock,
  Zap,
  Activity
} from 'lucide-react'
import { cn } from '../utils/cn'

interface LogEntry {
  id: string
  timestamp: Date
  level: 'error' | 'warn' | 'info' | 'debug'
  source: string
  message: string
  metadata?: Record<string, any>
}

interface LogAnalyzerProps {
  onExecuteCommand: (command: string) => void
  className?: string
}

export const LogAnalyzer: React.FC<LogAnalyzerProps> = ({
  onExecuteCommand,
  className
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      timestamp: new Date(Date.now() - 5000),
      level: 'info',
      source: 'api-gateway',
      message: 'Request received: GET /api/users',
      metadata: { ip: '192.168.1.100', duration: '45ms' }
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 10000),
      level: 'error',
      source: 'auth-service',
      message: 'Failed to authenticate user: Invalid token',
      metadata: { userId: 'user-123', errorCode: 'AUTH_001' }
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 15000),
      level: 'warn',
      source: 'database',
      message: 'Slow query detected: SELECT * FROM orders took 2.3s',
      metadata: { query: 'SELECT * FROM orders WHERE status = "pending"' }
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 20000),
      level: 'debug',
      source: 'worker',
      message: 'Job processed successfully',
      metadata: { jobId: 'job-456', processingTime: '123ms' }
    },
    {
      id: '5',
      timestamp: new Date(Date.now() - 25000),
      level: 'error',
      source: 'payment-service',
      message: 'Payment processing failed: Gateway timeout',
      metadata: { orderId: 'order-789', amount: '$99.99' }
    }
  ])

  const [filter, setFilter] = useState({
    level: 'all' as 'all' | LogEntry['level'],
    source: '',
    search: ''
  })

  const [autoScroll, setAutoScroll] = useState(true)
  const [streaming, setStreaming] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Simulate log streaming
  useEffect(() => {
    if (!streaming) return

    const sources = ['api-gateway', 'auth-service', 'database', 'worker', 'payment-service', 'cache', 'queue']
    const levels: LogEntry['level'][] = ['info', 'debug', 'warn', 'error']
    const messages = {
      info: [
        'Request processed successfully',
        'Health check passed',
        'Cache hit for key',
        'Connection established'
      ],
      debug: [
        'Entering function processOrder',
        'Query executed in',
        'Cache miss, fetching from database',
        'Worker started'
      ],
      warn: [
        'High memory usage detected',
        'Slow response time',
        'Rate limit approaching',
        'Deprecated API usage'
      ],
      error: [
        'Connection timeout',
        'Failed to process request',
        'Database connection lost',
        'Service unavailable'
      ]
    }

    const interval = setInterval(() => {
      const level = levels[Math.floor(Math.random() * levels.length)]
      const source = sources[Math.floor(Math.random() * sources.length)]
      const messageList = messages[level]
      const message = messageList[Math.floor(Math.random() * messageList.length)]

      const newLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date(),
        level,
        source,
        message: `${message} ${Math.random() > 0.5 ? `(${Math.floor(Math.random() * 1000)}ms)` : ''}`,
        metadata: {
          requestId: `req-${Math.random().toString(36).substr(2, 9)}`,
          duration: `${Math.floor(Math.random() * 500)}ms`
        }
      }

      setLogs(prev => [...prev.slice(-100), newLog]) // Keep last 100 logs
    }, 2000)

    return () => clearInterval(interval)
  }, [streaming])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (filter.level !== 'all' && log.level !== filter.level) return false
    if (filter.source && !log.source.toLowerCase().includes(filter.source.toLowerCase())) return false
    if (filter.search && !log.message.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  // Calculate stats
  const stats = {
    total: logs.length,
    errors: logs.filter(l => l.level === 'error').length,
    warnings: logs.filter(l => l.level === 'warn').length,
    info: logs.filter(l => l.level === 'info').length
  }

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'info':
        return <Info className="w-4 h-4 text-blue-500" />
      case 'debug':
        return <AlertCircle className="w-4 h-4 text-gray-500" />
    }
  }

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
      case 'info':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
      case 'debug':
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20'
    }
  }

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col h-[600px]",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Log Analyzer
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStreaming(!streaming)}
              className={cn(
                "px-3 py-1 text-sm rounded-lg transition-colors flex items-center gap-2",
                streaming
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              )}
            >
              <Activity className="w-3 h-3" />
              {streaming ? 'Streaming' : 'Paused'}
            </button>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={cn(
                "px-3 py-1 text-sm rounded-lg transition-colors",
                autoScroll
                  ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              )}
            >
              Auto-scroll {autoScroll ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => onExecuteCommand('logs export --format=json')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Export logs"
            >
              <Download className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {/* Level filter */}
          <select
            value={filter.level}
            onChange={(e) => setFilter({ ...filter, level: e.target.value as any })}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg",
              "bg-gray-100 dark:bg-gray-700",
              "text-gray-600 dark:text-gray-400",
              "border-0 focus:ring-2 focus:ring-violet-500"
            )}
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>

          {/* Source filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filter by source..."
              value={filter.source}
              onChange={(e) => setFilter({ ...filter, source: e.target.value })}
              className={cn(
                "pl-10 pr-3 py-1.5 text-sm rounded-lg",
                "bg-gray-100 dark:bg-gray-700",
                "text-gray-600 dark:text-gray-400",
                "placeholder-gray-500 dark:placeholder-gray-500",
                "border-0 focus:ring-2 focus:ring-violet-500"
              )}
            />
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
              className={cn(
                "w-full pl-10 pr-3 py-1.5 text-sm rounded-lg",
                "bg-gray-100 dark:bg-gray-700",
                "text-gray-600 dark:text-gray-400",
                "placeholder-gray-500 dark:placeholder-gray-500",
                "border-0 focus:ring-2 focus:ring-violet-500"
              )}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-400">
              Total: <span className="font-medium">{stats.total}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-gray-600 dark:text-gray-400">
              Errors: <span className="font-medium text-red-600 dark:text-red-400">{stats.errors}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-gray-600 dark:text-gray-400">
              Warnings: <span className="font-medium text-yellow-600 dark:text-yellow-400">{stats.warnings}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm"
      >
        {filteredLogs.map((log) => (
          <div
            key={log.id}
            className={cn(
              "p-3 rounded-lg border transition-all hover:shadow-sm",
              log.level === 'error' && "border-red-200 dark:border-red-800",
              log.level === 'warn' && "border-yellow-200 dark:border-yellow-800",
              log.level === 'info' && "border-blue-200 dark:border-blue-800",
              log.level === 'debug' && "border-gray-200 dark:border-gray-700"
            )}
          >
            <div className="flex items-start gap-3">
              {getLevelIcon(log.level)}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded",
                    getLevelColor(log.level)
                  )}>
                    {log.source}
                  </span>
                </div>
                <div className="text-gray-900 dark:text-gray-100">
                  {log.message}
                </div>
                {log.metadata && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {Object.entries(log.metadata).map(([key, value]) => (
                      <span key={key} className="mr-4">
                        {key}: <span className="text-gray-700 dark:text-gray-300">{value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Showing {filteredLogs.length} of {logs.length} entries
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onExecuteCommand('logs tail -f')}
              className="text-violet-600 dark:text-violet-400 hover:underline"
            >
              Open in Terminal
            </button>
            <button
              onClick={() => onExecuteCommand('logs analyze --pattern=error')}
              className="text-violet-600 dark:text-violet-400 hover:underline"
            >
              Analyze Patterns
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}