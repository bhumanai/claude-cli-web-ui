import { SSEMessage } from '../types'

// Event types for Server-Sent Events
export type SSEEventType = 
  | 'task_created'
  | 'task_updated' 
  | 'task_completed'
  | 'task_failed'
  | 'queue_updated'
  | 'worker_started'
  | 'worker_stopped'
  | 'worker_failed'
  | 'command_output'
  | 'command_completed'
  | 'system_notification'
  | 'connection_test'

interface SSEOptions {
  reconnectInterval?: number
  maxReconnectAttempts?: number
  authToken?: string | null
}

export class SSEService {
  private eventSource: EventSource | null = null
  private eventHandlers: Map<SSEEventType, ((data: any) => void)[]> = new Map()
  private connectionHandlers: ((connected: boolean, error?: string) => void)[] = []
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts: number
  private readonly reconnectInterval: number
  private reconnectTimer: NodeJS.Timeout | null = null
  private channel: string
  private authToken: string | null = null
  
  // Connection state
  private isConnecting = false
  private isConnected = false
  private lastEventId: string | null = null
  
  // Performance tracking
  private connectionStartTime = 0
  private messagesReceived = 0
  private reconnectCount = 0
  
  constructor(channel: string, options: SSEOptions = {}) {
    this.channel = channel
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10
    this.reconnectInterval = options.reconnectInterval || 1000
    this.authToken = options.authToken || null
    
    // Initialize event handler maps
    this.initializeEventHandlers()
  }
  
  private initializeEventHandlers(): void {
    const eventTypes: SSEEventType[] = [
      'task_created', 'task_updated', 'task_completed', 'task_failed',
      'queue_updated', 'worker_started', 'worker_stopped', 'worker_failed',
      'command_output', 'command_completed', 'system_notification', 'connection_test'
    ]
    
    eventTypes.forEach(type => {
      this.eventHandlers.set(type, [])
    })
  }
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || this.isConnected) {
        resolve()
        return
      }
      
      this.isConnecting = true
      this.connectionStartTime = Date.now()
      
      try {
        // Build SSE URL with authentication if available
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        let url = `${baseUrl}/api/events/${encodeURIComponent(this.channel)}`
        
        // Add last event ID for resume functionality
        if (this.lastEventId) {
          url += `?lastEventId=${encodeURIComponent(this.lastEventId)}`
        }
        
        // Create EventSource with auth header if available
        if (this.authToken) {
          // EventSource doesn't support custom headers directly
          // We'll use a query parameter for auth (if backend supports it)
          url += `${this.lastEventId ? '&' : '?'}token=${encodeURIComponent(this.authToken)}`
        }
        
        this.eventSource = new EventSource(url)
        
        this.eventSource.onopen = () => {
          console.log('SSE connected to channel:', this.channel)
          this.isConnecting = false
          this.isConnected = true
          this.reconnectAttempts = 0
          this.notifyConnectionHandlers(true)
          resolve()
        }
        
        this.eventSource.onmessage = (event) => {
          this.handleMessage(event)
        }
        
        this.eventSource.onerror = (error) => {
          console.error('SSE error:', error)
          this.isConnecting = false
          this.isConnected = false
          this.notifyConnectionHandlers(false, 'Connection error')
          
          if (this.reconnectAttempts === 0) {
            // First error, reject the promise
            reject(new Error('Failed to establish SSE connection'))
          }
          
          this.attemptReconnect()
        }
        
        // Set up custom event listeners for typed events
        this.eventHandlers.forEach((_, eventType) => {
          if (this.eventSource) {
            this.eventSource.addEventListener(eventType, (event) => {
              this.handleTypedEvent(eventType, event as MessageEvent)
            })
          }
        })
        
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }
  
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    
    this.isConnected = false
    this.isConnecting = false
    this.notifyConnectionHandlers(false)
  }
  
  private handleMessage(event: MessageEvent): void {
    try {
      this.messagesReceived++
      this.lastEventId = event.lastEventId || null
      
      // Parse the message data
      const data = JSON.parse(event.data)
      
      // Handle generic messages
      this.triggerHandlers('system_notification', data)
      
    } catch (error) {
      console.error('Failed to parse SSE message:', error)
    }
  }
  
  private handleTypedEvent(eventType: SSEEventType, event: MessageEvent): void {
    try {
      this.messagesReceived++
      this.lastEventId = event.lastEventId || null
      
      const data = JSON.parse(event.data)
      this.triggerHandlers(eventType, data)
      
    } catch (error) {
      console.error(`Failed to parse SSE event ${eventType}:`, error)
    }
  }
  
  private triggerHandlers(eventType: SSEEventType, data: any): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`Error in SSE handler for ${eventType}:`, error)
        }
      })
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      this.reconnectCount++
      
      const delay = Math.min(
        this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
        30000 // Max 30 seconds
      )
      
      console.log(`Attempting SSE reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`)
      
      this.reconnectTimer = setTimeout(() => {
        this.disconnect() // Clean up current connection
        this.connect().catch(error => {
          console.error('SSE reconnection failed:', error)
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.notifyConnectionHandlers(false, 'Max reconnection attempts reached')
          }
        })
      }, delay)
    } else {
      console.error('Max SSE reconnection attempts reached')
      this.notifyConnectionHandlers(false, 'Max reconnection attempts reached')
    }
  }
  
  private notifyConnectionHandlers(connected: boolean, error?: string): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected, error)
      } catch (error) {
        console.error('Error in connection handler:', error)
      }
    })
  }
  
  // Public API methods
  on(eventType: SSEEventType, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.push(handler)
    }
  }
  
  off(eventType: SSEEventType, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }
  
  onConnectionChange(handler: (connected: boolean, error?: string) => void): void {
    this.connectionHandlers.push(handler)
  }
  
  offConnectionChange(handler: (connected: boolean, error?: string) => void): void {
    const index = this.connectionHandlers.indexOf(handler)
    if (index > -1) {
      this.connectionHandlers.splice(index, 1)
    }
  }
  
  updateAuthToken(token: string | null): void {
    this.authToken = token
    
    // Reconnect with new token if currently connected
    if (this.isConnected) {
      this.disconnect()
      setTimeout(() => {
        this.connect().catch(console.error)
      }, 100)
    }
  }
  
  // Getters
  get connected(): boolean {
    return this.isConnected
  }
  
  get connecting(): boolean {
    return this.isConnecting
  }
  
  get readyState(): number {
    return this.eventSource?.readyState || EventSource.CLOSED
  }
  
  getStats(): {
    connected: boolean
    reconnectAttempts: number
    reconnectCount: number
    messagesReceived: number
    connectionTime: number
    uptime: number
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      reconnectCount: this.reconnectCount,
      messagesReceived: this.messagesReceived,
      connectionTime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0,
      uptime: this.isConnected && this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
    }
  }
  
  // Utility methods for common event patterns
  onTaskUpdates(handler: (task: any) => void): void {
    this.on('task_created', handler)
    this.on('task_updated', handler)
    this.on('task_completed', handler)
    this.on('task_failed', handler)
  }
  
  onWorkerUpdates(handler: (worker: any) => void): void {
    this.on('worker_started', handler)
    this.on('worker_stopped', handler)
    this.on('worker_failed', handler)
  }
  
  onCommandUpdates(handler: (command: any) => void): void {
    this.on('command_output', handler)
    this.on('command_completed', handler)
  }
}

// Singleton instance for global use
let globalSSE: SSEService | null = null

export function getSSEService(channel: string, options?: SSEOptions): SSEService {
  if (!globalSSE || globalSSE['channel'] !== channel) {
    if (globalSSE) {
      globalSSE.disconnect()
    }
    globalSSE = new SSEService(channel, options)
  }
  return globalSSE
}

export function disconnectSSE(): void {
  if (globalSSE) {
    globalSSE.disconnect()
    globalSSE = null
  }
}