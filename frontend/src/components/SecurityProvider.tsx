/**
 * Security Provider Component
 * Wraps the application with security context and monitoring
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { 
  SessionManager, 
  SecurityLogger, 
  RateLimiter, 
  securityLogger, 
  sessionManager, 
  rateLimiter,
  CSRFProtection 
} from '../utils/security'

interface SecurityContextType {
  // Session management
  isAuthenticated: boolean
  sessionId: string | null
  loginUser: (userId: string) => Promise<boolean>
  logoutUser: () => void
  extendSession: () => boolean
  
  // Security monitoring
  logSecurityEvent: (event: string, details: any, severity?: 'low' | 'medium' | 'high' | 'critical') => void
  getSecurityLogs: (severity?: string) => any[]
  clearSecurityLogs: () => void
  
  // Rate limiting
  checkRateLimit: (identifier?: string) => boolean
  getRemainingRequests: (identifier?: string) => number
  
  // CSRF protection
  csrfToken: string | null
  refreshCSRFToken: () => string
  
  // Security status
  securityStatus: 'secure' | 'warning' | 'danger'
  securityAlerts: string[]
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined)

interface SecurityProviderProps {
  children: React.ReactNode
  enableSessionTimeout?: boolean
  enableSecurityMonitoring?: boolean
  enableRateLimit?: boolean
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({
  children,
  enableSessionTimeout = true,
  enableSecurityMonitoring = true,
  enableRateLimit = true
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [securityStatus, setSecurityStatus] = useState<'secure' | 'warning' | 'danger'>('secure')
  const [securityAlerts, setSecurityAlerts] = useState<string[]>([])

  // Initialize security context
  useEffect(() => {
    // Check existing session
    const currentSession = sessionManager.getCurrentSession()
    if (currentSession && sessionManager.validateSession()) {
      setIsAuthenticated(true)
      setSessionId(currentSession.sessionId)
    }

    // Initialize CSRF token
    const token = CSRFProtection.getToken() || CSRFProtection.generateToken()
    setCsrfToken(token)

    // Start security monitoring
    if (enableSecurityMonitoring) {
      startSecurityMonitoring()
    }

    // Start session timeout monitoring
    if (enableSessionTimeout) {
      startSessionTimeoutMonitoring()
    }
  }, [enableSessionTimeout, enableSecurityMonitoring])

  // Login user
  const loginUser = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { sessionId: newSessionId } = sessionManager.createSession(userId)
      setIsAuthenticated(true)
      setSessionId(newSessionId)
      
      securityLogger.log('user_login', { userId, sessionId: newSessionId }, 'low')
      
      return true
    } catch (error) {
      securityLogger.log('login_failed', { userId, error }, 'high')
      return false
    }
  }, [])

  // Logout user
  const logoutUser = useCallback(() => {
    const currentSession = sessionManager.getCurrentSession()
    sessionManager.destroySession()
    setIsAuthenticated(false)
    setSessionId(null)
    
    securityLogger.log('user_logout', { 
      sessionId: currentSession?.sessionId 
    }, 'low')
  }, [])

  // Extend session
  const extendSession = useCallback((): boolean => {
    const success = sessionManager.extendSession()
    if (success) {
      securityLogger.log('session_extended', { sessionId }, 'low')
    } else {
      securityLogger.log('session_extension_failed', { sessionId }, 'medium')
    }
    return success
  }, [sessionId])

  // Security event logging
  const logSecurityEvent = useCallback((
    event: string, 
    details: any, 
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) => {
    securityLogger.log(event, details, severity)
    
    // Update security status based on severity
    if (severity === 'critical') {
      setSecurityStatus('danger')
      setSecurityAlerts(prev => [...prev, `Critical: ${event}`])
    } else if (severity === 'high') {
      setSecurityStatus('warning')
      setSecurityAlerts(prev => [...prev, `Warning: ${event}`])
    }
  }, [])

  // Get security logs
  const getSecurityLogs = useCallback((severity?: string) => {
    return securityLogger.getLogs(severity)
  }, [])

  // Clear security logs
  const clearSecurityLogs = useCallback(() => {
    securityLogger.clearLogs()
    setSecurityAlerts([])
    setSecurityStatus('secure')
  }, [])

  // Rate limit checking
  const checkRateLimit = useCallback((identifier?: string): boolean => {
    if (!enableRateLimit) return true
    
    const id = identifier || getClientIdentifier()
    const allowed = rateLimiter.isAllowed(id)
    
    if (!allowed) {
      logSecurityEvent('rate_limit_exceeded', { identifier: id }, 'medium')
    }
    
    return allowed
  }, [enableRateLimit, logSecurityEvent])

  // Get remaining requests
  const getRemainingRequests = useCallback((identifier?: string): number => {
    const id = identifier || getClientIdentifier()
    return rateLimiter.getRemainingRequests(id)
  }, [])

  // Refresh CSRF token
  const refreshCSRFToken = useCallback((): string => {
    const newToken = CSRFProtection.generateToken()
    setCsrfToken(newToken)
    return newToken
  }, [])

  // Security monitoring
  const startSecurityMonitoring = useCallback(() => {
    const checkInterval = setInterval(() => {
      // Check for suspicious activity
      const recentLogs = (securityLogger.getLogs() || []).filter(
        log => Date.now() - new Date(log.timestamp).getTime() < 5 * 60 * 1000 // Last 5 minutes
      )

      const criticalEvents = recentLogs.filter(log => log.severity === 'critical')
      const highSeverityEvents = recentLogs.filter(log => log.severity === 'high')

      if (criticalEvents.length > 0) {
        setSecurityStatus('danger')
      } else if (highSeverityEvents.length > 2) {
        setSecurityStatus('warning')
      } else {
        setSecurityStatus('secure')
      }

      // Check for repeated failed attempts
      const failedAttempts = recentLogs.filter(log => 
        log.event.includes('failed') || log.event.includes('invalid')
      )

      if (failedAttempts.length > 5) {
        logSecurityEvent('suspicious_activity', {
          failedAttempts: failedAttempts.length,
          events: failedAttempts.map(log => log.event)
        }, 'high')
      }

      // Check session validity
      if (isAuthenticated && !sessionManager.validateSession()) {
        logSecurityEvent('session_expired', { sessionId }, 'medium')
        logoutUser()
      }
    }, 30000) // Check every 30 seconds

    return () => clearInterval(checkInterval)
  }, [isAuthenticated, sessionId, logSecurityEvent, logoutUser])

  // Session timeout monitoring
  const startSessionTimeoutMonitoring = useCallback(() => {
    let activityTimer: NodeJS.Timeout

    const resetActivityTimer = () => {
      clearTimeout(activityTimer)
      
      if (isAuthenticated) {
        activityTimer = setTimeout(() => {
          // Warn user about impending timeout
          logSecurityEvent('session_timeout_warning', { sessionId }, 'medium')
          
          setTimeout(() => {
            if (isAuthenticated) {
              logSecurityEvent('session_timeout', { sessionId }, 'medium')
              logoutUser()
            }
          }, 60000) // 1 minute warning
        }, 29 * 60 * 1000) // 29 minutes
      }
    }

    // Monitor user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    
    const handleActivity = () => {
      if (isAuthenticated) {
        sessionManager.extendSession()
        resetActivityTimer()
      }
    }

    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, true)
    })

    resetActivityTimer()

    return () => {
      clearTimeout(activityTimer)
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity, true)
      })
    }
  }, [isAuthenticated, sessionId, logSecurityEvent, logoutUser])

  // Helper function to get client identifier
  const getClientIdentifier = (): string => {
    return `${navigator.userAgent.slice(0, 50)}-${window.location.hostname}`
  }

  // Security context value
  const contextValue: SecurityContextType = {
    // Session management
    isAuthenticated,
    sessionId,
    loginUser,
    logoutUser,
    extendSession,
    
    // Security monitoring
    logSecurityEvent,
    getSecurityLogs,
    clearSecurityLogs,
    
    // Rate limiting
    checkRateLimit,
    getRemainingRequests,
    
    // CSRF protection
    csrfToken,
    refreshCSRFToken,
    
    // Security status
    securityStatus,
    securityAlerts
  }

  return (
    <SecurityContext.Provider value={contextValue}>
      {children}
    </SecurityContext.Provider>
  )
}

// Hook to use security context
export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext)
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider')
  }
  return context
}

// Security Status Component
export const SecurityStatus: React.FC<{ className?: string }> = ({ className }) => {
  const { securityStatus, securityAlerts, clearSecurityLogs } = useSecurity()

  const statusColors = {
    secure: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    danger: 'text-red-600 dark:text-red-400'
  }

  const statusIcons = {
    secure: '🔒',
    warning: '⚠️',
    danger: '🚨'
  }

  if (securityStatus === 'secure' && securityAlerts.length === 0) {
    return null
  }

  return (
    <div className={`p-2 rounded-lg border ${className}`}>
      <div className="flex items-center justify-between">
        <div className={`flex items-center space-x-2 ${statusColors[securityStatus]}`}>
          <span>{statusIcons[securityStatus]}</span>
          <span className="font-medium">
            Security Status: {securityStatus.charAt(0).toUpperCase() + securityStatus.slice(1)}
          </span>
        </div>
        
        {securityAlerts.length > 0 && (
          <button
            onClick={clearSecurityLogs}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear Alerts
          </button>
        )}
      </div>
      
      {securityAlerts.length > 0 && (
        <div className="mt-2 space-y-1">
          {securityAlerts.slice(0, 3).map((alert, index) => (
            <div key={index} className="text-sm text-gray-600 dark:text-gray-400">
              {alert}
            </div>
          ))}
          {securityAlerts.length > 3 && (
            <div className="text-sm text-gray-500 dark:text-gray-500">
              +{securityAlerts.length - 3} more alerts
            </div>
          )}
        </div>
      )}
    </div>
  )
}