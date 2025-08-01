import { useState, useEffect, useCallback, useRef } from 'react'
import { CommandHistory, CommandResponse } from '../types'
import { getApiUrl } from '@/config/backend'

interface CommandHistoryState {
  items: CommandHistory[]
  currentIndex: number
}

export const useWebSocketFallback = (sessionId: string) => {
  const [isConnected, setIsConnected] = useState(true) // Always show as connected for HTTP mode
  const [commandHistory, setCommandHistory] = useState<CommandHistoryState>({
    items: [],
    currentIndex: -1
  })
  const [showConnectionWarning, setShowConnectionWarning] = useState(false)
  const wsAttempted = useRef(false)

  useEffect(() => {
    // Check if WebSocket is available by attempting connection once
    if (!wsAttempted.current) {
      wsAttempted.current = true
      
      try {
        // Get WebSocket URL from environment variables
        const getWebSocketUrl = () => {
          const apiUrl = getApiUrl()
          if (apiUrl.startsWith('https://')) {
            return apiUrl.replace('https://', 'wss://')
          } else if (apiUrl.startsWith('http://')) {
            return apiUrl.replace('http://', 'ws://')
          }
          return apiUrl.includes('localhost') ? `ws://${apiUrl}` : `wss://${apiUrl}`
        }
        
        const ws = new WebSocket(`${getWebSocketUrl()}/ws/${sessionId}`)
        
        ws.onopen = () => {
          // WebSocket available, close and let normal WebSocket hook handle it
          ws.close()
          setShowConnectionWarning(false)
        }
        
        ws.onerror = () => {
          // WebSocket not available, show warning
          setShowConnectionWarning(true)
          console.info('WebSocket not available, using HTTP fallback mode')
        }
        
        // Cleanup
        setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.close()
            setShowConnectionWarning(true)
          }
        }, 1000)
      } catch (error) {
        setShowConnectionWarning(true)
      }
    }
  }, [sessionId])

  const sendCommand = useCallback(async (command: string): Promise<CommandResponse> => {
    try {
      // Add to history
      const historyItem: CommandHistory = {
        id: Date.now().toString(),
        command,
        timestamp: new Date(),
        output: '',
        status: 'pending'
      }
      
      setCommandHistory(prev => ({
        items: [...prev.items, historyItem],
        currentIndex: prev.items.length
      }))

      // Check for special commands that need task context
      if (command.startsWith('/plan') || command.startsWith('/smart-task')) {
        // Try to get task context from the current view
        const taskContext = {
          name: document.querySelector('h2')?.textContent || 'Current Task',
          description: document.querySelector('[data-task-description]')?.textContent || '',
          priority: document.querySelector('[data-task-priority]')?.textContent || 'medium'
        }
        
        // Send command with context
        const apiUrl = getApiUrl()
        const response = await fetch(`${apiUrl}/api/commands/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            command, 
            session_id: sessionId,
            context: taskContext
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        
        // Update history with output
        setCommandHistory(prev => {
          const newItems = [...prev.items]
          newItems[newItems.length - 1].output = data.output || ''
          newItems[newItems.length - 1].status = data.success ? 'success' : 'error'
          return { items: newItems, currentIndex: prev.currentIndex }
        })

        return {
          id: Date.now().toString(),
          command,
          output: data.output || '',
          timestamp: new Date().toISOString(),
          status: data.success ? 'success' : 'error'
        }
      }

      // Regular command execution
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/commands/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command, session_id: sessionId })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      // Update history with output
      setCommandHistory(prev => {
        const newItems = [...prev.items]
        newItems[newItems.length - 1].output = data.output || ''
        newItems[newItems.length - 1].status = data.success ? 'success' : 'error'
        return { items: newItems, currentIndex: prev.currentIndex }
      })

      return {
        id: Date.now().toString(),
        command,
        output: data.output || '',
        timestamp: new Date().toISOString(),
        status: data.success ? 'success' : 'error'
      }
    } catch (error) {
      console.error('Failed to execute command:', error)
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Update history with error
      setCommandHistory(prev => {
        const newItems = [...prev.items]
        if (newItems.length > 0) {
          newItems[newItems.length - 1].output = `Error: ${errorMessage}`
          newItems[newItems.length - 1].status = 'error'
        }
        return { items: newItems, currentIndex: prev.currentIndex }
      })

      return {
        id: Date.now().toString(),
        command,
        output: `Error: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        status: 'error'
      }
    }
  }, [sessionId])

  const clearHistory = useCallback(() => {
    setCommandHistory({ items: [], currentIndex: -1 })
  }, [])

  const getPreviousCommand = useCallback((): string | null => {
    if (commandHistory.items.length === 0) return null
    
    const newIndex = Math.max(0, commandHistory.currentIndex - 1)
    setCommandHistory(prev => ({ ...prev, currentIndex: newIndex }))
    
    return commandHistory.items[newIndex]?.command || null
  }, [commandHistory])

  const getNextCommand = useCallback((): string | null => {
    if (commandHistory.items.length === 0) return null
    
    const newIndex = Math.min(commandHistory.items.length - 1, commandHistory.currentIndex + 1)
    setCommandHistory(prev => ({ ...prev, currentIndex: newIndex }))
    
    if (newIndex >= commandHistory.items.length) {
      return ''
    }
    
    return commandHistory.items[newIndex]?.command || null
  }, [commandHistory])

  return {
    isConnected,
    commandHistory: commandHistory.items, // Return array to match WebSocket hook
    sendCommand,
    clearHistory,
    getPreviousCommand,
    getNextCommand,
    showConnectionWarning
  }
}