import { useState, useEffect, useCallback, useRef } from 'react'
import { SSEService, SSEEventType, getSSEService, disconnectSSE } from '../services/SSEService'
import { authService } from '../services/AuthService'
import { CommandHistory } from '../types'

interface UseSSEOptions {
  autoConnect?: boolean
  channel?: string
  onError?: (error: string) => void
  onConnectionChange?: (connected: boolean) => void
}

interface UseSSEReturn {
  isConnected: boolean
  isConnecting: boolean
  connectionError: string | null
  reconnectCount: number
  messagesReceived: number
  connect: () => Promise<void>
  disconnect: () => void
  forceReconnect: () => void
  on: (eventType: SSEEventType, handler: (data: any) => void) => void
  off: (eventType: SSEEventType, handler: (data: any) => void) => void
  sendCommand: (command: string) => Promise<void>
  commandHistory: CommandHistory[]
  clearHistory: () => void
  lastConnectionAttempt: Date | null
}

export function useSSE(sessionId: string, options: UseSSEOptions = {}): UseSSEReturn {
  const {
    autoConnect = true,
    channel = sessionId,
    onError,
    onConnectionChange
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([])
  const [lastConnectionAttempt, setLastConnectionAttempt] = useState<Date | null>(null)
  
  const sseRef = useRef<SSEService | null>(null)
  const authTokenRef = useRef<string | null>(null)
  const statsRef = useRef({ reconnectCount: 0, messagesReceived: 0 })

  // Initialize SSE service
  const initializeSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.disconnect()
    }

    const authToken = authService.getAccessToken()
    authTokenRef.current = authToken

    sseRef.current = getSSEService(channel, {
      authToken,
      maxReconnectAttempts: 10,
      reconnectInterval: 1000
    })

    // Connection change handler
    sseRef.current.onConnectionChange((connected, error) => {
      setIsConnected(connected)
      setIsConnecting(false)
      
      if (error) {
        setConnectionError(error)
        onError?.(error)
      } else {
        setConnectionError(null)
      }
      
      onConnectionChange?.(connected)
      
      // Update stats
      const stats = sseRef.current?.getStats()
      if (stats) {
        statsRef.current = {
          reconnectCount: stats.reconnectCount,
          messagesReceived: stats.messagesReceived
        }
      }
    })

    // Set up command-related event listeners
    sseRef.current.on('command_output', (data) => {
      setCommandHistory(prev => {
        const updated = [...prev]
        const existingIndex = updated.findIndex(cmd => cmd.id === data.command_id)
        
        if (existingIndex >= 0) {
          // Update existing command with new output
          updated[existingIndex] = {
            ...updated[existingIndex],
            output: (updated[existingIndex].output || '') + data.output,
            status: data.status || updated[existingIndex].status,
            timestamp: new Date(data.timestamp || Date.now())
          }
        } else {
          // Create new command entry
          updated.push({
            id: data.command_id,
            command: data.command || '',
            output: data.output,
            status: data.status || 'pending',
            timestamp: new Date(data.timestamp || Date.now())
          })
        }
        
        return updated
      })
    })

    sseRef.current.on('command_completed', (data) => {
      setCommandHistory(prev => {
        const updated = [...prev]
        const existingIndex = updated.findIndex(cmd => cmd.id === data.command_id)
        
        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            status: data.exit_code === 0 ? 'completed' : 'error',
            duration: data.duration,
            error: data.error,
            timestamp: new Date(data.timestamp || Date.now())
          }
        }
        
        return updated
      })
    })

    return sseRef.current
  }, [channel, onError, onConnectionChange])

  // Connect function
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return

    setIsConnecting(true)
    setLastConnectionAttempt(new Date())
    
    try {
      const sse = sseRef.current || initializeSSE()
      await sse.connect()
    } catch (error) {
      setIsConnecting(false)
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      setConnectionError(errorMessage)
      onError?.(errorMessage)
    }
  }, [isConnecting, isConnected, initializeSSE, onError])

  // Disconnect function
  const disconnect = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.disconnect()
    }
    setIsConnected(false)
    setIsConnecting(false)
  }, [])

  // Force reconnect function
  const forceReconnect = useCallback(() => {
    disconnect()
    setTimeout(() => {
      connect()
    }, 100)
  }, [disconnect, connect])

  // Send command function (using traditional HTTP API, not SSE)
  const sendCommand = useCallback(async (command: string) => {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Optimistically add command to history
    const newCommand: CommandHistory = {
      id: commandId,
      command,
      status: 'pending',
      timestamp: new Date()
    }
    
    setCommandHistory(prev => [...prev, newCommand])
    
    try {
      const authToken = authService.getAccessToken()
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/commands/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        body: JSON.stringify({
          command,
          session_id: sessionId,
          command_id: commandId
        })
      })
      
      if (!response.ok) {
        throw new Error(`Command execution failed: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      // Update command status to indicate it was sent successfully
      setCommandHistory(prev => {
        const updated = [...prev]
        const index = updated.findIndex(cmd => cmd.id === commandId)
        if (index >= 0) {
          updated[index] = {
            ...updated[index],
            status: 'success'
          }
        }
        return updated
      })
      
    } catch (error) {
      // Update command with error
      setCommandHistory(prev => {
        const updated = [...prev]
        const index = updated.findIndex(cmd => cmd.id === commandId)
        if (index >= 0) {
          updated[index] = {
            ...updated[index],
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
        return updated
      })
      throw error
    }
  }, [sessionId])

  // Event listener management
  const on = useCallback((eventType: SSEEventType, handler: (data: any) => void) => {
    sseRef.current?.on(eventType, handler)
  }, [])

  const off = useCallback((eventType: SSEEventType, handler: (data: any) => void) => {
    sseRef.current?.off(eventType, handler)
  }, [])

  // Clear command history
  const clearHistory = useCallback(() => {
    setCommandHistory([])
  }, [])

  // Initialize on mount
  useEffect(() => {
    if (autoConnect) {
      initializeSSE()
      connect()
    }

    return () => {
      disconnect()
      disconnectSSE()
    }
  }, [autoConnect, initializeSSE, connect, disconnect])

  // Handle auth token changes
  useEffect(() => {
    const unsubscribe = authService.subscribe((authState) => {
      const newToken = authState.tokens?.access_token || null
      
      if (newToken !== authTokenRef.current) {
        authTokenRef.current = newToken
        
        // Update SSE service with new token
        if (sseRef.current) {
          sseRef.current.updateAuthToken(newToken)
        }
      }
    })

    return unsubscribe
  }, [])

  return {
    isConnected,
    isConnecting,
    connectionError,
    reconnectCount: statsRef.current.reconnectCount,
    messagesReceived: statsRef.current.messagesReceived,
    connect,
    disconnect,
    forceReconnect,
    on,
    off,
    sendCommand,
    commandHistory,
    clearHistory,
    lastConnectionAttempt
  }
}

// Specialized hook for task events
export function useTaskSSE(sessionId: string, onTaskUpdate?: (task: any) => void) {
  const sse = useSSE(sessionId, { channel: `tasks_${sessionId}` })
  
  useEffect(() => {
    if (onTaskUpdate) {
      sse.on('task_created', onTaskUpdate)
      sse.on('task_updated', onTaskUpdate)
      sse.on('task_completed', onTaskUpdate)
      sse.on('task_failed', onTaskUpdate)
      
      return () => {
        sse.off('task_created', onTaskUpdate)
        sse.off('task_updated', onTaskUpdate)
        sse.off('task_completed', onTaskUpdate)
        sse.off('task_failed', onTaskUpdate)
      }
    }
  }, [sse, onTaskUpdate])
  
  return sse
}

// Specialized hook for worker events
export function useWorkerSSE(sessionId: string, onWorkerUpdate?: (worker: any) => void) {
  const sse = useSSE(sessionId, { channel: `workers_${sessionId}` })
  
  useEffect(() => {
    if (onWorkerUpdate) {
      sse.on('worker_started', onWorkerUpdate)
      sse.on('worker_stopped', onWorkerUpdate)
      sse.on('worker_failed', onWorkerUpdate)
      
      return () => {
        sse.off('worker_started', onWorkerUpdate)
        sse.off('worker_stopped', onWorkerUpdate)
        sse.off('worker_failed', onWorkerUpdate)
      }
    }
  }, [sse, onWorkerUpdate])
  
  return sse
}