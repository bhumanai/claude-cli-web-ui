import { useEffect, useCallback } from 'react'
import { useWebSocket } from './useWebSocket'

interface TaskWebSocketOptions {
  onTaskUpdate?: () => void
  onQueueUpdate?: () => void
  onProjectUpdate?: () => void
}

export const useTaskWebSocket = (sessionId: string, options: TaskWebSocketOptions = {}) => {
  const { isConnected } = useWebSocket(sessionId)

  useEffect(() => {
    if (!isConnected) return

    // Listen for WebSocket messages related to tasks
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data)
        
        switch (message.type) {
          case 'task.created':
          case 'task.updated':
          case 'task.deleted':
            options.onTaskUpdate?.()
            break
            
          case 'queue.updated':
          case 'queue.processing':
          case 'queue.completed':
            options.onQueueUpdate?.()
            break
            
          case 'project.created':
          case 'project.updated':
          case 'project.activated':
            options.onProjectUpdate?.()
            break
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    // Get WebSocket instance from the global connection
    const ws = (window as any).__claudeWebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.addEventListener('message', handleMessage)
    }

    return () => {
      if (ws) {
        ws.removeEventListener('message', handleMessage)
      }
    }
  }, [isConnected, options])

  return { isConnected }
}