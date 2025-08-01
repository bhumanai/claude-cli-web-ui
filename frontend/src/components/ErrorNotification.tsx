import React, { useState, useEffect } from 'react'
import { X, AlertCircle, AlertTriangle, Info, CheckCircle, WifiOff, RefreshCw, Clock, Zap } from 'lucide-react'
import { cn } from '../utils/cn'

export interface ErrorNotificationData {
  id: string
  type: 'error' | 'warning' | 'info' | 'success'
  title: string
  message: string
  details?: string
  action?: {
    label: string
    onClick: () => void
  }
  duration?: number // Auto-dismiss after this many ms (0 = no auto-dismiss)
  persistent?: boolean // Cannot be dismissed by user
  progress?: number // Progress value between 0-100 for progress notifications
  timestamp?: Date // When the notification was created
  priority?: 'low' | 'medium' | 'high' | 'critical' // Priority for ordering
  icon?: React.ReactNode // Custom icon override
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary' | 'danger'
  }> // Multiple action buttons
}

interface ErrorNotificationProps {
  notifications: ErrorNotificationData[]
  onDismiss: (id: string) => void
  className?: string
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
  maxVisible?: number
  onClearByType?: (type: string) => void
  onClearConnectionErrors?: () => void
}

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  notifications,
  onDismiss,
  className,
  position = 'top-right',
  maxVisible = 5,
  onClearByType,
  onClearConnectionErrors
}) => {
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())

  // Auto-dismiss notifications with duration
  useEffect(() => {
    const timers: Record<string, NodeJS.Timeout> = {}

    notifications.forEach(notification => {
      if (notification.duration && notification.duration > 0) {
        timers[notification.id] = setTimeout(() => {
          onDismiss(notification.id)
        }, notification.duration)
      }
    })

    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer))
    }
  }, [notifications, onDismiss])

  const toggleDetails = (id: string) => {
    const newExpanded = new Set(expandedDetails)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedDetails(newExpanded)
  }

  const getNotificationIcon = (notification: ErrorNotificationData) => {
    // Use custom icon if provided
    if (notification.icon) {
      return notification.icon
    }

    // Add priority indicators
    const getPriorityIcon = (priority?: string) => {
      switch (priority) {
        case 'critical':
          return <Zap className="h-5 w-5 text-red-600" />
        case 'high':
          return <AlertTriangle className="h-5 w-5 text-orange-500" />
        default:
          return null
      }
    }

    const priorityIcon = getPriorityIcon(notification.priority)
    if (priorityIcon) return priorityIcon

    switch (notification.type) {
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'info':
        return <Info className="h-5 w-5 text-blue-500" />
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      default:
        return <Info className="h-5 w-5 text-gray-500" />
    }
  }

  const getNotificationColors = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
      case 'warning':
        return 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20'
      case 'info':
        return 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
      case 'success':
        return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
      default:
        return 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
    }
  }

  // Sort notifications by priority and timestamp
  const sortedNotifications = [...notifications]
    .sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      const priorityA = priorityOrder[a.priority as keyof typeof priorityOrder] || 1
      const priorityB = priorityOrder[b.priority as keyof typeof priorityOrder] || 1
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA // Higher priority first
      }
      
      // Then by timestamp (newer first)
      const timeA = a.timestamp?.getTime() || 0
      const timeB = b.timestamp?.getTime() || 0
      return timeB - timeA
    })
    .slice(0, maxVisible) // Limit visible notifications

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'fixed top-4 left-4 z-50'
      case 'top-center':
        return 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50'
      case 'top-right':
        return 'fixed top-4 right-4 z-50'
      case 'bottom-left':
        return 'fixed bottom-4 left-4 z-50'
      case 'bottom-center':
        return 'fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50'
      case 'bottom-right':
        return 'fixed bottom-4 right-4 z-50'
      default:
        return 'fixed top-4 right-4 z-50'
    }
  }

  if (sortedNotifications.length === 0) return null

  return (
    <div className={cn(
      getPositionClasses(),
      'space-y-3 max-w-md w-full',
      className
    )}>
      {sortedNotifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            'border rounded-lg shadow-lg p-4 backdrop-blur-sm',
            'transform transition-all duration-300 ease-in-out',
            'animate-in slide-in-from-top-4 fade-in-0',
            getNotificationColors(notification.type)
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {getNotificationIcon(notification)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {notification.title}
                </h4>
                {notification.priority && (
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-medium',
                    notification.priority === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                    notification.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                    notification.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  )}>
                    {notification.priority.toUpperCase()}
                  </span>
                )}
                {notification.timestamp && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {(() => {
                      try {
                        const date = typeof notification.timestamp === 'string' 
                          ? new Date(notification.timestamp) 
                          : notification.timestamp;
                        return date.toLocaleTimeString();
                      } catch {
                        return 'Unknown time';
                      }
                    })()}
                  </span>
                )}
              </div>
              
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                {notification.message}
              </p>

              {/* Progress bar */}
              {notification.progress !== undefined && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{Math.round(notification.progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        notification.type === 'error' ? 'bg-red-500' :
                        notification.type === 'warning' ? 'bg-yellow-500' :
                        notification.type === 'success' ? 'bg-green-500' :
                        'bg-blue-500'
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, notification.progress))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Details section */}
              {notification.details && (
                <div className="mb-3">
                  <button
                    onClick={() => toggleDetails(notification.id)}
                    className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline"
                  >
                    {expandedDetails.has(notification.id) ? 'Hide' : 'Show'} details
                  </button>
                  
                  {expandedDetails.has(notification.id) && (
                    <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                      {notification.details}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {(notification.action || notification.actions) && (
                <div className="flex gap-2 flex-wrap">
                  {/* Legacy single action support */}
                  {notification.action && (
                    <button
                      onClick={notification.action.onClick}
                      className={cn(
                        'text-xs px-3 py-1.5 rounded font-medium transition-colors',
                        notification.type === 'error' 
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : notification.type === 'warning'
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      )}
                    >
                      {notification.action.label}
                    </button>
                  )}
                  
                  {/* Multiple actions support */}
                  {notification.actions?.map((action, index) => (
                    <button
                      key={index}
                      onClick={action.onClick}
                      className={cn(
                        'text-xs px-3 py-1.5 rounded font-medium transition-colors',
                        action.variant === 'danger' 
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : action.variant === 'secondary'
                          ? 'bg-gray-600 hover:bg-gray-700 text-white'
                          : notification.type === 'error' 
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : notification.type === 'warning'
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dismiss button */}
            {!notification.persistent && (
              <button
                onClick={() => onDismiss(notification.id)}
                className="flex-shrink-0 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Enhanced version with built-in deduplication handling
export const SmartErrorNotification: React.FC<Omit<ErrorNotificationProps, 'onClearByType' | 'onClearConnectionErrors'> & {
  onClearByType?: (type: string) => void
  onClearConnectionErrors?: () => void
}> = (props) => {
  return (
    <ErrorNotification
      {...props}
      onClearByType={props.onClearByType}
      onClearConnectionErrors={props.onClearConnectionErrors}
    />
  )
}

// Notification manager hook
export const useNotifications = () => {
  const [notifications, setNotifications] = useState<ErrorNotificationData[]>([])

  const addNotification = (notification: Omit<ErrorNotificationData, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newNotification: ErrorNotificationData = {
      ...notification,
      id,
      timestamp: notification.timestamp || new Date(),
      duration: notification.duration ?? (notification.type === 'success' ? 3000 : 0)
    }
    
    setNotifications(prev => [newNotification, ...prev])
    return id
  }

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const clearAllNotifications = () => {
    setNotifications([])
  }

  // Helper functions for common notification types
  const notifyError = (title: string, message: string, details?: string, action?: ErrorNotificationData['action']) => {
    return addNotification({
      type: 'error',
      title,
      message,
      details,
      action,
      priority: 'high'
    })
  }

  const notifySuccess = (title: string, message: string, duration = 3000) => {
    return addNotification({
      type: 'success',
      title,
      message,
      duration
    })
  }

  const notifyWarning = (title: string, message: string, details?: string) => {
    return addNotification({
      type: 'warning',
      title,
      message,
      details,
      priority: 'medium'
    })
  }

  const notifyInfo = (title: string, message: string, duration = 5000) => {
    return addNotification({
      type: 'info',
      title,
      message,
      duration
    })
  }

  // Network-specific notifications
  const notifyConnectionError = (retry?: () => void) => {
    return addNotification({
      type: 'error',
      title: 'Connection Lost',
      message: 'Unable to connect to Claude CLI server',
      details: 'Check that the backend server is running on the expected port',
      action: retry ? {
        label: 'Retry Connection',
        onClick: retry
      } : undefined,
      persistent: true,
      priority: 'critical',
      icon: <WifiOff className="h-5 w-5 text-red-500" />
    })
  }

  const notifyConnectionRestored = () => {
    return addNotification({
      type: 'success',
      title: 'Connection Restored',
      message: 'Successfully reconnected to Claude CLI server',
      duration: 3000,
      priority: 'medium'
    })
  }

  // Enhanced notification methods
  const notifyCritical = (title: string, message: string, actions?: ErrorNotificationData['actions']) => {
    return addNotification({
      type: 'error',
      title,
      message,
      priority: 'critical',
      persistent: true,
      actions
    })
  }

  const notifyProgress = (title: string, message: string, progress: number) => {
    return addNotification({
      type: 'info',
      title,
      message,
      progress,
      persistent: true,
      priority: 'medium'
    })
  }

  const updateNotificationProgress = (id: string, progress: number) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, progress }
          : notification
      )
    )
  }

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAllNotifications,
    notifyError,
    notifySuccess,
    notifyWarning,
    notifyInfo,
    notifyConnectionError,
    notifyConnectionRestored,
    notifyCritical,
    notifyProgress,
    updateNotificationProgress
  }
}

export default ErrorNotification