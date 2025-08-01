import React, { useState, useEffect } from 'react'
import { Wifi, WifiOff, Activity, AlertTriangle, RefreshCw, Clock } from 'lucide-react'
import { cn } from '../utils/cn'

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error' | 'reconnecting'

interface ConnectionStatusProps {
  isConnected: boolean
  connectionError?: string | null
  lastConnectionAttempt?: Date | null
  onRetry?: () => void
  className?: string
  showDetails?: boolean
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  connectionError,
  lastConnectionAttempt,
  onRetry,
  className,
  showDetails = false,
  position = 'top-right'
}) => {
  const [expanded, setExpanded] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [retryCount, setRetryCount] = useState(0)

  // Determine connection state
  useEffect(() => {
    if (isConnected) {
      setConnectionState('connected')
      setRetryCount(0)
    } else if (connectionError) {
      setConnectionState('error')
    } else if (lastConnectionAttempt) {
      const timeSinceAttempt = Date.now() - lastConnectionAttempt.getTime()
      if (timeSinceAttempt < 5000) { // Within 5 seconds of attempt
        setConnectionState('connecting')
      } else {
        setConnectionState('disconnected')
      }
    } else {
      setConnectionState('disconnected')
    }
  }, [isConnected, connectionError, lastConnectionAttempt])

  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-500" />
      case 'connecting':
      case 'reconnecting':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      case 'disconnected':
      default:
        return <WifiOff className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'reconnecting':
        return `Reconnecting... (${retryCount})`
      case 'error':
        return 'Connection Error'
      case 'disconnected':
      default:
        return 'Disconnected'
    }
  }

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'text-green-600 dark:text-green-400'
      case 'connecting':
      case 'reconnecting':
        return 'text-blue-600 dark:text-blue-400'
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'disconnected':
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4'
      case 'top-right':
        return 'top-4 right-4'
      case 'bottom-left':
        return 'bottom-4 left-4'
      case 'bottom-right':
        return 'bottom-4 right-4'
      default:
        return 'top-4 right-4'
    }
  }

  const handleRetry = () => {
    if (onRetry) {
      setRetryCount(prev => prev + 1)
      setConnectionState('reconnecting')
      onRetry()
    }
  }

  return (
    <div className={cn(
      'fixed z-40 transition-all duration-200',
      getPositionClasses(),
      className
    )}>
      {/* Compact Status Indicator */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm border cursor-pointer transition-all',
          'bg-white/80 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700',
          'hover:bg-white dark:hover:bg-gray-800',
          expanded && 'rounded-b-none'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {getStatusIcon()}
        <span className={cn('text-sm font-medium', getStatusColor())}>
          {getStatusText()}
        </span>
        
        {/* Connection quality indicator */}
        {isConnected && (
          <div className="flex gap-1">
            <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse" />
            <div className="w-1 h-2 bg-green-400 rounded-full animate-pulse delay-75" />
            <div className="w-1 h-4 bg-green-300 rounded-full animate-pulse delay-150" />
          </div>
        )}
      </div>

      {/* Expanded Details Panel */}
      {expanded && (showDetails || connectionError) && (
        <div className={cn(
          'absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border border-t-0 border-gray-200 dark:border-gray-700',
          'rounded-b-lg shadow-lg p-4 min-w-64'
        )}>
          <div className="space-y-3">
            {/* Connection Details */}
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Status:</span>
                <span className={getStatusColor()}>{getStatusText()}</span>
              </div>
              
              {lastConnectionAttempt && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Last Attempt:</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{lastConnectionAttempt.toLocaleTimeString()}</span>
                  </div>
                </div>
              )}
              
              {retryCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Retry Count:</span>
                  <span>{retryCount}</span>
                </div>
              )}
            </div>

            {/* Error Message */}
            {connectionError && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                {connectionError}
              </div>
            )}

            {/* Connection Health Metrics */}
            {isConnected && (
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">WebSocket:</span>
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Active
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Server:</span>
                  <span className="text-green-600 dark:text-green-400">Claude CLI</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {!isConnected && onRetry && (
                <button
                  onClick={handleRetry}
                  disabled={connectionState === 'connecting' || connectionState === 'reconnecting'}
                  className={cn(
                    'flex items-center gap-1 text-xs px-2 py-1 rounded font-medium transition-colors',
                    'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <RefreshCw className={cn(
                    'w-3 h-3',
                    (connectionState === 'connecting' || connectionState === 'reconnecting') && 'animate-spin'
                  )} />
                  Retry
                </button>
              )}
              
              <button
                onClick={() => setExpanded(false)}
                className="text-xs px-2 py-1 rounded font-medium transition-colors bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionStatus