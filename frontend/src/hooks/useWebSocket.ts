import { useState, useEffect, useRef, useCallback } from 'react'
import { HybridConnectionService } from '@/services/HybridConnectionService'
import { CommandHistory } from '@/types'
import { getApiUrl } from '@/config/backend'

export const useWebSocket = (sessionId: string, initialHistory?: CommandHistory[]) => {
  const [isConnected, setIsConnected] = useState(false)
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>(initialHistory || [])
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [lastConnectionAttempt, setLastConnectionAttempt] = useState<Date | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'critical'>('excellent')
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null)
  const [connectionMode, setConnectionMode] = useState<string>('connecting')
  const wsRef = useRef<HybridConnectionService | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Initialize hybrid connection service
    wsRef.current = new HybridConnectionService(sessionId)
    
    // Set up message handlers for streaming output
    wsRef.current.onMessage('command_started', (data) => {
      setCommandHistory(prev => {
        // Find if command already exists (from sendCommand)
        const existing = prev.find(cmd => cmd.command === data.command && cmd.status === 'pending')
        if (!existing) {
          // Add new command if not already in history
          return [...prev, {
            id: data.id,
            command: data.command,
            timestamp: new Date(),
            status: 'pending',
            output: ''
          }]
        }
        return prev
      })
    })
    
    wsRef.current.onMessage('command_update', (data) => {
      setCommandHistory(prev => {
        const updated = [...prev]
        const lastIndex = updated.length - 1
        if (lastIndex >= 0 && updated[lastIndex].status === 'pending') {
          // Accumulate output from streaming command
          const existingOutput = updated[lastIndex].output || ''
          const newOutput = data.output || []
          
          // Convert CommandResponse output to string
          let outputString = existingOutput
          if (Array.isArray(newOutput)) {
            outputString += newOutput.map(o => o.content).join('')
          }
          
          updated[lastIndex] = {
            ...updated[lastIndex],
            output: outputString,
            status: data.status === 'completed' || data.status === 'failed' ? data.status : 'pending'
          }
        }
        return updated
      })
    })

    wsRef.current.onMessage('command_finished', (data) => {
      setCommandHistory(prev => {
        const updated = [...prev]
        const lastIndex = updated.length - 1
        if (lastIndex >= 0 && updated[lastIndex].status === 'pending') {
          updated[lastIndex] = {
            ...updated[lastIndex],
            status: data.status === 'completed' ? 'completed' : 'error',
            error: data.error
          }
        }
        return updated
      })
    })

    wsRef.current.onMessage('command_error', (data) => {
      setCommandHistory(prev => {
        const updated = [...prev]
        const lastIndex = updated.length - 1
        if (lastIndex >= 0 && updated[lastIndex].status === 'pending') {
          updated[lastIndex] = {
            ...updated[lastIndex],
            error: data.error,
            status: 'error'
          }
        }
        return updated
      })
    })

    wsRef.current.onConnection((connected, mode) => {
      setIsConnected(connected)
      setConnectionMode(mode || 'unknown')
      setLastConnectionAttempt(new Date())
      
      if (connected) {
        setConnectionError(null)
        console.log(`✅ Connected via ${mode}`)
        // Clear any pending reconnect attempts
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
        
        // Start performance monitoring
        startPerformanceMonitoring()
      } else {
        setConnectionError('Connection lost')
        console.log(`❌ Disconnected from ${mode}`)
        
        // Stop performance monitoring
        stopPerformanceMonitoring()
        
        // Schedule reconnection attempt
        scheduleReconnect()
      }
    })

    // Connect WebSocket
    connectWithRetry()

    // Cleanup on unmount
    return () => {
      stopPerformanceMonitoring()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
    }
  }, [sessionId])

  const connectWithRetry = async () => {
    if (!wsRef.current) return

    try {
      await wsRef.current.connect()
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      setConnectionError(error instanceof Error ? error.message : 'Connection failed')
      setIsConnected(false)
      scheduleReconnect()
    }
  }

  const scheduleReconnect = () => {
    if (reconnectTimeoutRef.current) return // Already scheduled

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null
      connectWithRetry()
    }, 3000) // Retry after 3 seconds
  }

  const startPerformanceMonitoring = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
    }
    
    metricsIntervalRef.current = setInterval(() => {
      if (wsRef.current) {
        try {
          const health = wsRef.current.getConnectionHealth()
          const metrics = wsRef.current.getPerformanceMetrics()
          
          setConnectionQuality(health.connectionQuality)
          setPerformanceMetrics(metrics)
        } catch (error) {
          console.error('Failed to get performance metrics:', error)
        }
      }
    }, 2000) // Update every 2 seconds
  }, [])

  const stopPerformanceMonitoring = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }
  }, [])

  const forceReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    connectWithRetry()
  }, [])

  const getWebSocketService = useCallback(() => {
    return wsRef.current
  }, [])

  const getDiagnosticReport = useCallback(() => {
    return wsRef.current?.getDiagnosticReport() || null
  }, [])

  const resetPerformanceMetrics = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.resetMetrics()
    }
  }, [])

  const forceHealthCheck = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.forceHealthCheck()
    }
  }, [])

  const sendCommand = useCallback(async (command: string) => {
    const historyEntry: CommandHistory = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      command,
      timestamp: new Date(),
      status: 'pending'
    }
    
    setCommandHistory(prev => [...prev, historyEntry])
    
    if (wsRef.current) {
      try {
        await wsRef.current.executeCommand(command)
      } catch (error) {
        console.error('Failed to execute command:', error)
        // Update command history with error
        setCommandHistory(prev => 
          prev.map(cmd => 
            cmd === historyEntry 
              ? { ...cmd, status: 'failed', output: error instanceof Error ? error.message : 'Command failed' }
              : cmd
          )
        )
      }
    }
  }, [sessionId])

  const sendCommandViaHTTP = async (command: string, historyEntry: CommandHistory) => {
    try {
      // Get API URL from environment variables with fallback
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/commands/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          session_id: sessionId
        })
      })
      
      const data = await response.json()
      
      setCommandHistory(prev => {
        const updated = [...prev]
        const lastIndex = updated.length - 1
        if (lastIndex >= 0 && updated[lastIndex].id === historyEntry.id) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            output: data.output,
            status: data.success ? 'completed' : 'error',
            error: data.success ? undefined : data.output
          }
        }
        return updated
      })
    } catch (error) {
      setCommandHistory(prev => {
        const updated = [...prev]
        const lastIndex = updated.length - 1
        if (lastIndex >= 0 && updated[lastIndex].id === historyEntry.id) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            error: 'Failed to execute command',
            status: 'error'
          }
        }
        return updated
      })
    }
  }

  const clearHistory = useCallback(() => {
    setCommandHistory([])
  }, [])

  return {
    isConnected,
    connectionMode,
    commandHistory,
    sendCommand,
    clearHistory,
    connectionError,
    lastConnectionAttempt,
    connectionQuality,
    performanceMetrics,
    forceReconnect,
    getWebSocketService,
    getDiagnosticReport,
    resetPerformanceMetrics,
    forceHealthCheck
  }
}