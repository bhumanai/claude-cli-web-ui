/**
 * Security Dashboard Component
 * Provides real-time security monitoring and controls
 */

import React, { useState, useEffect, useMemo } from 'react'
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Lock, 
  Unlock, 
  Eye, 
  EyeOff, 
  Clock, 
  User, 
  Settings,
  Download,
  Trash2,
  RefreshCw
} from 'lucide-react'
import { useSecurity } from './SecurityProvider'
import { AccessibleModal } from './AccessibleModal'
import { cn } from '../utils/cn'

interface SecurityDashboardProps {
  className?: string
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ className }) => {
  const {
    isAuthenticated,
    sessionId,
    securityStatus,
    securityAlerts,
    getSecurityLogs,
    clearSecurityLogs,
    logSecurityEvent,
    getRemainingRequests,
    extendSession,
    refreshCSRFToken
  } = useSecurity()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'logs' | 'settings'>('overview')
  const [logFilter, setLogFilter] = useState<string>('all')
  const [showSensitiveData, setShowSensitiveData] = useState(false)

  // Security metrics
  const securityMetrics = useMemo(() => {
    const logs = getSecurityLogs() || []
    const now = Date.now()
    const oneHourAgo = now - (60 * 60 * 1000)
    const oneDayAgo = now - (24 * 60 * 60 * 1000)

    const recentLogs = logs.filter(log => 
      new Date(log.timestamp).getTime() > oneHourAgo
    )
    
    const dailyLogs = logs.filter(log => 
      new Date(log.timestamp).getTime() > oneDayAgo
    )

    const severityCounts = logs.reduce((acc, log) => {
      acc[log.severity] = (acc[log.severity] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      totalEvents: logs.length,
      recentEvents: recentLogs.length,
      dailyEvents: dailyLogs.length,
      severityCounts,
      remainingRequests: getRemainingRequests(),
      sessionDuration: sessionId ? getSessionDuration() : 0
    }
  }, [getSecurityLogs, getRemainingRequests, sessionId])

  // Get session duration
  const getSessionDuration = (): number => {
    // This would normally come from the session manager
    // For now, we'll estimate based on localStorage
    const sessionData = localStorage.getItem('claude-cli-session-current')
    if (sessionData) {
      try {
        const session = JSON.parse(localStorage.getItem(`claude-cli-session-${sessionData}`) || '{}')
        return session.createdAt ? Date.now() - session.createdAt : 0
      } catch {
        return 0
      }
    }
    return 0
  }

  // Format duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  // Get filtered logs
  const filteredLogs = useMemo(() => {
    const logs = getSecurityLogs() || []
    if (logFilter === 'all') return logs
    return logs.filter(log => log.severity === logFilter)
  }, [getSecurityLogs, logFilter])

  // Export logs
  const exportLogs = () => {
    const logs = getSecurityLogs()
    const dataStr = JSON.stringify(logs, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
    
    const exportFileDefaultName = `security-logs-${new Date().toISOString().split('T')[0]}.json`
    
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
    
    logSecurityEvent('logs_exported', { count: logs.length }, 'low')
  }

  // Status indicator colors
  const statusColors = {
    secure: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
  }

  return (
    <div className={className}>
      {/* Security Status Indicator */}
      <button
        onClick={() => setIsModalOpen(true)}
        className={cn(
          "flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors",
          "hover:bg-gray-100 dark:hover:bg-gray-800",
          "focus:outline-none focus:ring-2 focus:ring-violet-500"
        )}
        aria-label="Open security dashboard"
      >
        <Shield className="w-4 h-4" />
        <span className={cn(
          "px-2 py-1 rounded-full text-xs font-medium",
          statusColors[securityStatus]
        )}>
          {securityStatus.charAt(0).toUpperCase() + securityStatus.slice(1)}
        </span>
        {securityAlerts.length > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
            {securityAlerts.length}
          </span>
        )}
      </button>

      {/* Security Dashboard Modal */}
      <AccessibleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Security Dashboard"
        size="xl"
      >
        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: Activity },
                { id: 'logs', label: 'Security Logs', icon: Eye },
                { id: 'settings', label: 'Settings', icon: Settings }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSelectedTab(id as any)}
                  className={cn(
                    "flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-violet-500",
                    selectedTab === id
                      ? "border-violet-500 text-violet-600 dark:text-violet-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Overview Tab */}
          {selectedTab === 'overview' && (
            <div className="space-y-6">
              {/* Security Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Shield className={cn(
                      "w-8 h-8",
                      securityStatus === 'secure' ? "text-green-500" :
                      securityStatus === 'warning' ? "text-yellow-500" : "text-red-500"
                    )} />
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Status</div>
                      <div className="font-semibold capitalize">{securityStatus}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <User className="w-8 h-8 text-blue-500" />
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Session</div>
                      <div className="font-semibold">
                        {isAuthenticated ? 'Active' : 'None'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Clock className="w-8 h-8 text-purple-500" />
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Duration</div>
                      <div className="font-semibold">
                        {formatDuration(securityMetrics.sessionDuration)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Activity className="w-8 h-8 text-green-500" />
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Events</div>
                      <div className="font-semibold">{securityMetrics.recentEvents}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alerts */}
              {securityAlerts.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <h3 className="font-medium text-yellow-800 dark:text-yellow-200">
                      Security Alerts
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {securityAlerts.map((alert, index) => (
                      <div key={index} className="text-sm text-yellow-700 dark:text-yellow-300">
                        {alert}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={extendSession}
                  disabled={!isAuthenticated}
                  className={cn(
                    "flex items-center justify-center space-x-2 p-3 rounded-lg",
                    "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500"
                  )}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="text-sm">Extend Session</span>
                </button>

                <button
                  onClick={refreshCSRFToken}
                  className={cn(
                    "flex items-center justify-center space-x-2 p-3 rounded-lg",
                    "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300",
                    "focus:outline-none focus:ring-2 focus:ring-green-500"
                  )}
                >
                  <Lock className="w-4 h-4" />
                  <span className="text-sm">Refresh Token</span>
                </button>

                <button
                  onClick={exportLogs}
                  className={cn(
                    "flex items-center justify-center space-x-2 p-3 rounded-lg",
                    "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500"
                  )}
                >
                  <Download className="w-4 h-4" />
                  <span className="text-sm">Export Logs</span>
                </button>

                <button
                  onClick={clearSecurityLogs}
                  className={cn(
                    "flex items-center justify-center space-x-2 p-3 rounded-lg",
                    "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300",
                    "focus:outline-none focus:ring-2 focus:ring-red-500"
                  )}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm">Clear Logs</span>
                </button>
              </div>
            </div>
          )}

          {/* Logs Tab */}
          {selectedTab === 'logs' && (
            <div className="space-y-4">
              {/* Log Filters */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <select
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className={cn(
                      "px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg",
                      "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
                      "focus:outline-none focus:ring-2 focus:ring-violet-500"
                    )}
                  >
                    <option value="all">All Events</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>

                  <button
                    onClick={() => setShowSensitiveData(!showSensitiveData)}
                    className={cn(
                      "flex items-center space-x-2 px-3 py-2 rounded-lg",
                      "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600",
                      "focus:outline-none focus:ring-2 focus:ring-violet-500"
                    )}
                  >
                    {showSensitiveData ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    <span className="text-sm">
                      {showSensitiveData ? 'Hide' : 'Show'} Sensitive Data
                    </span>
                  </button>
                </div>

                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {filteredLogs.length} events
                </div>
              </div>

              {/* Log Entries */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredLogs.map((log, index) => (
                  <div
                    key={index}
                    className={cn(
                      "p-3 rounded-lg border-l-4",
                      log.severity === 'critical' ? "border-red-500 bg-red-50 dark:bg-red-900/20" :
                      log.severity === 'high' ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20" :
                      log.severity === 'medium' ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" :
                      "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {log.event}
                          </span>
                          <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            log.severity === 'critical' ? "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" :
                            log.severity === 'high' ? "bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-200" :
                            log.severity === 'medium' ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200" :
                            "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200"
                          )}>
                            {log.severity}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                        
                        {log.details && (
                          <div className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                            <pre className="whitespace-pre-wrap">
                              {showSensitiveData 
                                ? JSON.stringify(log.details, null, 2)
                                : '[Details hidden - click show sensitive data]'
                              }
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {filteredLogs.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No security events found
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {selectedTab === 'settings' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Security Settings
                </h3>
                
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          Automatic Session Extension
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Extend session automatically based on user activity
                        </div>
                      </div>
                      <button className="w-12 h-6 bg-violet-600 rounded-full relative">
                        <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          Security Monitoring
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Monitor for suspicious activity and security events
                        </div>
                      </div>
                      <button className="w-12 h-6 bg-violet-600 rounded-full relative">
                        <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          Rate Limiting
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Limit the number of requests per minute
                        </div>
                      </div>
                      <button className="w-12 h-6 bg-violet-600 rounded-full relative">
                        <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Session ID: {showSensitiveData ? sessionId : '••••••••'}
                  <br />
                  Rate Limit: {securityMetrics.remainingRequests} requests remaining
                </div>
              </div>
            </div>
          )}
        </div>
      </AccessibleModal>
    </div>
  )
}