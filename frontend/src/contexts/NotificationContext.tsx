import React, { createContext, useContext, useCallback, useReducer, useEffect, useRef } from 'react'
import { ErrorNotificationData } from '../components/ErrorNotification'

export type NotificationPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
export type NotificationLevel = 'error' | 'warning' | 'info' | 'success'

interface NotificationState {
  notifications: ErrorNotificationData[]
  maxNotifications: number
  position: NotificationPosition
  globalPaused: boolean
  errorModalCount: number
  maxErrorModals: number
}

interface NotificationContextType extends NotificationState {
  // Core notification methods
  addNotification: (notification: Omit<ErrorNotificationData, 'id'>) => string
  dismissNotification: (id: string) => void
  clearAllNotifications: () => void
  clearNotificationsByType: (type: string) => void
  clearConnectionErrors: () => void
  
  // Helper methods
  notifyError: (title: string, message: string, details?: string, action?: ErrorNotificationData['action']) => string
  notifySuccess: (title: string, message: string, duration?: number) => string
  notifyWarning: (title: string, message: string, details?: string) => string
  notifyInfo: (title: string, message: string, duration?: number) => string
  
  // Network-specific methods with smart deduplication
  notifyConnectionError: (retry?: () => void) => string
  notifyConnectionRestored: () => string
  notifyApiError: (endpoint: string, error: Error, retry?: () => void) => string
  
  // System configuration
  setMaxNotifications: (max: number) => void
  setPosition: (position: NotificationPosition) => void
  pauseNotifications: () => void
  resumeNotifications: () => void
  
  // Advanced features
  notifyWithProgress: (title: string, message: string, progress: number) => string
  updateProgress: (id: string, progress: number) => void
  notifyWithRetry: (title: string, message: string, retryAction: () => void, maxRetries?: number) => string
}

type NotificationAction =
  | { type: 'ADD_NOTIFICATION'; payload: ErrorNotificationData }
  | { type: 'DISMISS_NOTIFICATION'; payload: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'CLEAR_BY_TYPE'; payload: string }
  | { type: 'CLEAR_CONNECTION_ERRORS'; payload?: never }
  | { type: 'SET_MAX_NOTIFICATIONS'; payload: number }
  | { type: 'SET_POSITION'; payload: NotificationPosition }
  | { type: 'SET_PAUSED'; payload: boolean }
  | { type: 'UPDATE_PROGRESS'; payload: { id: string; progress: number } }

const initialState: NotificationState = {
  notifications: [],
  maxNotifications: 5,
  position: 'top-right',
  globalPaused: false,
  errorModalCount: 0,
  maxErrorModals: 1
}

// Create a hash for deduplication
function createNotificationHash(notification: ErrorNotificationData): string {
  return `${notification.type}-${notification.title}-${notification.message}`
}

function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'ADD_NOTIFICATION': {
      const newNotification = action.payload
      const hash = createNotificationHash(newNotification)
      
      // Check for duplicates - prevent stacking identical notifications
      const isDuplicate = state.notifications.some(n => 
        createNotificationHash(n) === hash
      )
      
      if (isDuplicate) {
        return state // Don't add duplicate notifications
      }
      
      // For error modals, enforce max limit by replacing oldest
      if (newNotification.type === 'error') {
        const currentErrorCount = state.notifications.filter(n => n.type === 'error').length
        
        if (currentErrorCount >= state.maxErrorModals) {
          // Remove the oldest error notification
          const notifications = state.notifications.filter(n => {
            const isError = n.type === 'error'
            const isOldest = isError && n === state.notifications.filter(n => n.type === 'error')[0]
            return !isOldest
          })
          return {
            ...state,
            notifications: [newNotification, ...notifications],
            errorModalCount: Math.min(state.errorModalCount + 1, state.maxErrorModals)
          }
        }
      }
      
      let notifications = [newNotification, ...state.notifications]
      
      // Enforce max notifications limit
      if (notifications.length > state.maxNotifications) {
        notifications = notifications.slice(0, state.maxNotifications)
      }
      
      return { 
        ...state, 
        notifications,
        errorModalCount: newNotification.type === 'error' 
          ? state.errorModalCount + 1 
          : state.errorModalCount
      }
    }
    
    case 'DISMISS_NOTIFICATION': {
      const dismissedNotification = state.notifications.find(n => n.id === action.payload)
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
        errorModalCount: dismissedNotification?.type === 'error' 
          ? Math.max(0, state.errorModalCount - 1)
          : state.errorModalCount
      }
    }
    
    case 'CLEAR_ALL':
      return { ...state, notifications: [], errorModalCount: 0 }
    
    case 'CLEAR_BY_TYPE': {
      const filteredNotifications = state.notifications.filter(n => n.type !== action.payload)
      const removedErrorCount = action.payload === 'error' 
        ? state.notifications.filter(n => n.type === 'error').length
        : 0
      
      return {
        ...state,
        notifications: filteredNotifications,
        errorModalCount: action.payload === 'error' ? 0 : state.errorModalCount
      }
    }
    
    case 'CLEAR_CONNECTION_ERRORS': {
      const filteredNotifications = state.notifications.filter(n => 
        !(n.title === 'Connection Lost' || n.title === 'Connection Restored')
      )
      const removedErrorCount = state.notifications.filter(n => 
        n.type === 'error' && (n.title === 'Connection Lost')
      ).length
      
      return {
        ...state,
        notifications: filteredNotifications,
        errorModalCount: Math.max(0, state.errorModalCount - removedErrorCount)
      }
    }
    
    case 'SET_MAX_NOTIFICATIONS':
      return { ...state, maxNotifications: action.payload }
    
    case 'SET_POSITION':
      return { ...state, position: action.payload }
    
    case 'SET_PAUSED':
      return { ...state, globalPaused: action.payload }
    
    case 'UPDATE_PROGRESS':
      return {
        ...state,
        notifications: state.notifications.map(n => 
          n.id === action.payload.id 
            ? { ...n, progress: action.payload.progress }
            : n
        )
      }
    
    default:
      return state
  }
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

interface NotificationProviderProps {
  children: React.ReactNode
  maxNotifications?: number
  position?: NotificationPosition
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  maxNotifications = 5,
  position = 'top-right'
}) => {
  const [state, dispatch] = useReducer(notificationReducer, {
    ...initialState,
    maxNotifications,
    position
  })
  
  // Debouncing refs for connection notifications
  const connectionErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const connectionRestoredTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-dismiss notifications with duration
  useEffect(() => {
    const timers: Record<string, NodeJS.Timeout> = {}

    state.notifications.forEach(notification => {
      if (notification.duration && notification.duration > 0 && !state.globalPaused) {
        timers[notification.id] = setTimeout(() => {
          dispatch({ type: 'DISMISS_NOTIFICATION', payload: notification.id })
        }, notification.duration)
      }
    })

    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer))
    }
  }, [state.notifications, state.globalPaused])

  const generateId = useCallback(() => {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }, [])

  const addNotification = useCallback((notification: Omit<ErrorNotificationData, 'id'>) => {
    const id = generateId()
    const newNotification: ErrorNotificationData = {
      ...notification,
      id,
      duration: notification.duration ?? (notification.type === 'success' ? 3000 : 0)
    }
    
    dispatch({ type: 'ADD_NOTIFICATION', payload: newNotification })
    return id
  }, [generateId])

  const dismissNotification = useCallback((id: string) => {
    dispatch({ type: 'DISMISS_NOTIFICATION', payload: id })
  }, [])

  const clearAllNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
  }, [])

  const clearNotificationsByType = useCallback((type: string) => {
    dispatch({ type: 'CLEAR_BY_TYPE', payload: type })
  }, [])

  const clearConnectionErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_CONNECTION_ERRORS' })
  }, [])

  // Helper methods
  const notifyError = useCallback((
    title: string, 
    message: string, 
    details?: string, 
    action?: ErrorNotificationData['action']
  ) => {
    return addNotification({
      type: 'error',
      title,
      message,
      details,
      action
    })
  }, [addNotification])

  const notifySuccess = useCallback((title: string, message: string, duration = 3000) => {
    return addNotification({
      type: 'success',
      title,
      message,
      duration
    })
  }, [addNotification])

  const notifyWarning = useCallback((title: string, message: string, details?: string) => {
    return addNotification({
      type: 'warning',
      title,
      message,
      details
    })
  }, [addNotification])

  const notifyInfo = useCallback((title: string, message: string, duration = 5000) => {
    return addNotification({
      type: 'info',
      title,
      message,
      duration
    })
  }, [addNotification])

  // Network-specific notifications with debouncing
  const notifyConnectionError = useCallback((retry?: () => void) => {
    // Clear any pending connection restored notifications
    if (connectionRestoredTimeoutRef.current) {
      clearTimeout(connectionRestoredTimeoutRef.current)
      connectionRestoredTimeoutRef.current = null
    }
    
    // Debounce connection error notifications
    if (connectionErrorTimeoutRef.current) {
      return '' // Already have a pending connection error notification
    }
    
    connectionErrorTimeoutRef.current = setTimeout(() => {
      connectionErrorTimeoutRef.current = null
    }, 1000) // 1 second debounce
    
    return addNotification({
      type: 'error',
      title: 'Connection Lost',
      message: 'Unable to connect to Claude CLI server',
      details: 'Check that the backend server is running on the expected port',
      action: retry ? {
        label: 'Retry Connection',
        onClick: () => {
          retry()
          // Clear connection errors when retrying
          clearConnectionErrors()
        }
      } : undefined,
      persistent: false  // Allow dismissal
    })
  }, [addNotification, clearConnectionErrors])

  const notifyConnectionRestored = useCallback(() => {
    // Clear any pending connection error notifications
    if (connectionErrorTimeoutRef.current) {
      clearTimeout(connectionErrorTimeoutRef.current)
      connectionErrorTimeoutRef.current = null
    }
    
    // Auto-dismiss existing connection error modals
    clearConnectionErrors()
    
    // Debounce connection restored notifications
    if (connectionRestoredTimeoutRef.current) {
      return '' // Already have a pending connection restored notification
    }
    
    connectionRestoredTimeoutRef.current = setTimeout(() => {
      connectionRestoredTimeoutRef.current = null
    }, 500) // 500ms debounce (shorter for success messages)
    
    return addNotification({
      type: 'success',
      title: 'Connection Restored',
      message: 'Successfully reconnected to Claude CLI server',
      duration: 3000
    })
  }, [addNotification, clearConnectionErrors])

  const notifyApiError = useCallback((endpoint: string, error: Error, retry?: () => void) => {
    return addNotification({
      type: 'error',
      title: 'API Request Failed',
      message: `Failed to communicate with ${endpoint}`,
      details: error.message,
      action: retry ? {
        label: 'Retry',
        onClick: retry
      } : undefined
    })
  }, [addNotification])

  // System configuration
  const setMaxNotifications = useCallback((max: number) => {
    dispatch({ type: 'SET_MAX_NOTIFICATIONS', payload: max })
  }, [])

  const setPosition = useCallback((position: NotificationPosition) => {
    dispatch({ type: 'SET_POSITION', payload: position })
  }, [])

  const pauseNotifications = useCallback(() => {
    dispatch({ type: 'SET_PAUSED', payload: true })
  }, [])

  const resumeNotifications = useCallback(() => {
    dispatch({ type: 'SET_PAUSED', payload: false })
  }, [])

  // Advanced features
  const notifyWithProgress = useCallback((title: string, message: string, progress: number) => {
    return addNotification({
      type: 'info',
      title,
      message,
      progress,
      persistent: true
    })
  }, [addNotification])

  const updateProgress = useCallback((id: string, progress: number) => {
    dispatch({ type: 'UPDATE_PROGRESS', payload: { id, progress } })
  }, [])

  const notifyWithRetry = useCallback((
    title: string, 
    message: string, 
    retryAction: () => void, 
    maxRetries = 3
  ) => {
    let retryCount = 0
    
    const retry = () => {
      retryCount++
      if (retryCount <= maxRetries) {
        retryAction()
      }
    }

    return addNotification({
      type: 'error',
      title,
      message: `${message} (${retryCount}/${maxRetries})`,
      action: retryCount < maxRetries ? {
        label: `Retry (${retryCount}/${maxRetries})`,
        onClick: retry
      } : undefined
    })
  }, [addNotification])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (connectionErrorTimeoutRef.current) {
        clearTimeout(connectionErrorTimeoutRef.current)
      }
      if (connectionRestoredTimeoutRef.current) {
        clearTimeout(connectionRestoredTimeoutRef.current)
      }
    }
  }, [])

  const contextValue: NotificationContextType = {
    ...state,
    addNotification,
    dismissNotification,
    clearAllNotifications,
    clearNotificationsByType,
    clearConnectionErrors,
    notifyError,
    notifySuccess,
    notifyWarning,
    notifyInfo,
    notifyConnectionError,
    notifyConnectionRestored,
    notifyApiError,
    setMaxNotifications,
    setPosition,
    pauseNotifications,
    resumeNotifications,
    notifyWithProgress,
    updateProgress,
    notifyWithRetry
  }

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  )
}

export default NotificationProvider