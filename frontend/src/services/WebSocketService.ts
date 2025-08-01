import { WebSocketMessage } from '@/types'
import { getApiUrl, getWsUrl } from '@/config/backend'

// Performance monitoring interfaces
interface PerformanceMetrics {
  messagesSent: number
  messagesReceived: number
  bytesTransferred: number
  connectionTime: number
  lastLatency: number
  averageLatency: number
  reconnectCount: number
  queueProcessingTime: number
  memoryUsage: number
}

interface ConnectionHealth {
  isHealthy: boolean
  lastPingTime: number
  lastPongTime: number
  latency: number
  missedPings: number
  connectionQuality: 'excellent' | 'good' | 'poor' | 'critical'
}

// Message priority types
type MessagePriority = 'critical' | 'high' | 'normal' | 'low'

interface PriorityMessage extends Omit<WebSocketMessage, 'timestamp'> {
  priority: MessagePriority
  timestamp: number
  retryCount?: number
}

// Circular buffer for efficient memory management
class CircularBuffer<T> {
  private buffer: T[]
  private head = 0
  private tail = 0
  private size = 0
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  push(item: T): void {
    this.buffer[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity
    
    if (this.size < this.capacity) {
      this.size++
    } else {
      this.head = (this.head + 1) % this.capacity
    }
  }

  getAll(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity
      result.push(this.buffer[index])
    }
    return result
  }

  clear(): void {
    this.head = 0
    this.tail = 0
    this.size = 0
  }

  getSize(): number {
    return this.size
  }

  isFull(): boolean {
    return this.size === this.capacity
  }
}

// Priority queue implementation
class PriorityQueue<T extends { priority: MessagePriority; timestamp: number }> {
  private queues: Map<MessagePriority, T[]> = new Map()
  private readonly priorities: MessagePriority[] = ['critical', 'high', 'normal', 'low']

  constructor() {
    this.priorities.forEach(priority => {
      this.queues.set(priority, [])
    })
  }

  enqueue(item: T): void {
    const queue = this.queues.get(item.priority)
    if (queue) {
      queue.push(item)
      // Sort by timestamp to maintain FIFO within same priority
      queue.sort((a, b) => a.timestamp - b.timestamp)
    }
  }

  dequeue(): T | null {
    for (const priority of this.priorities) {
      const queue = this.queues.get(priority)
      if (queue && queue.length > 0) {
        return queue.shift() || null
      }
    }
    return null
  }

  peek(): T | null {
    for (const priority of this.priorities) {
      const queue = this.queues.get(priority)
      if (queue && queue.length > 0) {
        return queue[0]
      }
    }
    return null
  }

  size(): number {
    let total = 0
    this.queues.forEach(queue => {
      total += queue.length
    })
    return total
  }

  clear(): void {
    this.queues.forEach(queue => {
      queue.length = 0
    })
  }

  getQueueSizes(): Record<MessagePriority, number> {
    const sizes: Record<MessagePriority, number> = {} as any
    this.priorities.forEach(priority => {
      sizes[priority] = this.queues.get(priority)?.length || 0
    })
    return sizes
  }
}

export class WebSocketService {
  private ws: WebSocket | null = null
  private sessionId: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10 // Increased from 5
  private baseReconnectDelay = 1000
  private maxReconnectDelay = 30000
  private messageHandlers: Map<string, (data: any) => void> = new Map()
  private connectionHandlers: ((connected: boolean, error?: string) => void)[] = []
  private wsBaseUrl: string
  
  // Enhanced performance optimizations
  private priorityQueue = new PriorityQueue<PriorityMessage>()
  private outgoingRateLimit = 50 // messages per second
  private lastMessageTime = 0
  private isProcessingQueue = false
  private batchSize = 100 // Increased from 50
  private batchDelay = 16 // ~60fps processing rate
  private processingTimeoutId: NodeJS.Timeout | null = null
  
  // Connection health monitoring
  private connectionHealth: ConnectionHealth = {
    isHealthy: true,
    lastPingTime: 0,
    lastPongTime: 0,
    latency: 0,
    missedPings: 0,
    connectionQuality: 'excellent'
  }
  private pingInterval: NodeJS.Timeout | null = null
  private healthCheckInterval = 15000 // Reduced to 15 seconds for better monitoring
  private maxMissedPings = 3
  
  // Performance metrics
  private metrics: PerformanceMetrics = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesTransferred: 0,
    connectionTime: 0,
    lastLatency: 0,
    averageLatency: 0,
    reconnectCount: 0,
    queueProcessingTime: 0,
    memoryUsage: 0
  }
  private latencyHistory: number[] = []
  private connectionStartTime = 0
  
  // Memory management with circular buffers
  private messageHistory = new CircularBuffer<WebSocketMessage>(2000) // Increased capacity
  private metricsHistory = new CircularBuffer<PerformanceMetrics>(100)
  
  // Request animation frame optimization
  private rafId: number | null = null
  private scheduledUpdates = new Set<() => void>()

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.wsBaseUrl = this.getWebSocketBaseUrl()
    this.initializePerformanceMonitoring()
  }

  /**
   * Get WebSocket base URL from environment variables with fallback
   * @returns WebSocket base URL (ws:// or wss://)
   */
  private getWebSocketBaseUrl(): string {
    // Use configured WebSocket URL
    return getWsUrl()
  }

  private getFallbackUrls(): string[] {
    const fallbackUrls = import.meta.env.VITE_FALLBACK_API_URLS?.split(',') || []
    return fallbackUrls.map(url => {
      const trimmedUrl = url.trim()
      if (trimmedUrl.startsWith('https://')) {
        return trimmedUrl.replace('https://', 'wss://')
      } else if (trimmedUrl.startsWith('http://')) {
        return trimmedUrl.replace('http://', 'ws://')
      }
      return `wss://${trimmedUrl}`
    })
  }

  private initializePerformanceMonitoring(): void {
    // Monitor memory usage periodically
    setInterval(() => {
      this.updateMemoryMetrics()
    }, 5000)
    
    // Clean up old metrics periodically
    setInterval(() => {
      this.cleanupOldMetrics()
    }, 60000)
  }

  private updateMemoryMetrics(): void {
    // Estimate memory usage
    const messageHistorySize = this.messageHistory.getSize() * 200 // rough estimate per message
    const queueSize = this.priorityQueue.size() * 300 // rough estimate per queued message
    const metricsSize = this.metricsHistory.getSize() * 100 // rough estimate per metrics entry
    
    this.metrics.memoryUsage = messageHistorySize + queueSize + metricsSize
  }

  private cleanupOldMetrics(): void {
    // Keep only recent latency history
    if (this.latencyHistory.length > 100) {
      this.latencyHistory = this.latencyHistory.slice(-50)
    }
    
    // Update average latency
    if (this.latencyHistory.length > 0) {
      this.metrics.averageLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
    }
  }

  connect(): Promise<void> {
    return this.connectWithFallback()
  }

  private async connectWithFallback(): Promise<void> {
    const urls = [this.wsBaseUrl, ...this.getFallbackUrls()].filter(Boolean)
    let lastError: Error | null = null

    for (let i = 0; i < urls.length; i++) {
      const baseUrl = urls[i]
      try {
        console.log(`Attempting connection ${i + 1}/${urls.length} to:`, baseUrl)
        await this.connectToUrl(baseUrl)
        console.log(`Successfully connected to:`, baseUrl)
        this.wsBaseUrl = baseUrl // Update successful URL for future connections
        return
      } catch (error) {
        console.warn(`Connection ${i + 1} failed:`, error)
        lastError = error as Error
        
        // Wait a bit before trying the next URL
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }

    throw lastError || new Error('All connection attempts failed')
  }

  private connectToUrl(baseUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${baseUrl}/ws/${this.sessionId}`
        this.ws = new WebSocket(wsUrl)
        this.connectionStartTime = Date.now()

        this.ws.onopen = () => {
          console.log('WebSocket connected to:', wsUrl)
          this.reconnectAttempts = 0
          this.connectionHealth.isHealthy = true
          this.connectionHealth.missedPings = 0
          this.metrics.connectionTime = Date.now() - this.connectionStartTime
          
          this.startHealthCheck()
          this.startQueueProcessing()
          this.notifyConnectionHandlers(true)
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.metrics.messagesReceived++
            this.metrics.bytesTransferred += event.data.length
            
            // Handle pong messages for latency calculation
            if (message.type === 'pong') {
              this.handlePongMessage(message)
            } else {
              this.queueMessage(message)
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason)
          this.connectionHealth.isHealthy = false
          this.stopHealthCheck()
          this.stopQueueProcessing()
          this.notifyConnectionHandlers(false, event.reason)
          this.attemptReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.connectionHealth.isHealthy = false
          reject(error)
        }

        // Connection timeout
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close()
            reject(new Error('Connection timeout'))
          }
        }, 10000)

      } catch (error) {
        reject(error)
      }
    })
  }

  disconnect(): void {
    this.stopHealthCheck()
    this.stopQueueProcessing()
    
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect') // Clean close
      this.ws = null
    }
    
    this.clearMessageQueue()
    this.scheduledUpdates.clear()
    this.notifyConnectionHandlers(false)
  }

  sendMessage(type: string, data: any, priority: MessagePriority = 'normal'): void {
    const message: PriorityMessage = {
      type: type as any,
      data,
      session_id: this.sessionId,
      priority,
      timestamp: Date.now()
    }
    
    this.priorityQueue.enqueue(message)
    this.processOutgoingQueue()
  }

  private processOutgoingQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    
    const now = Date.now()
    const timeSinceLastMessage = now - this.lastMessageTime
    const minInterval = 1000 / this.outgoingRateLimit // ms between messages
    
    if (timeSinceLastMessage < minInterval) {
      // Rate limit exceeded, schedule for later
      setTimeout(() => this.processOutgoingQueue(), minInterval - timeSinceLastMessage)
      return
    }
    
    const message = this.priorityQueue.dequeue()
    if (!message) {
      return
    }
    
    try {
      const jsonMessage = JSON.stringify(message)
      this.ws.send(jsonMessage)
      
      this.metrics.messagesSent++
      this.metrics.bytesTransferred += jsonMessage.length
      this.lastMessageTime = now
      
      // Process next message if queue is not empty
      if (this.priorityQueue.size() > 0) {
        setTimeout(() => this.processOutgoingQueue(), minInterval)
      }
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
      // Re-queue message with retry count
      message.retryCount = (message.retryCount || 0) + 1
      if (message.retryCount < 3) {
        this.priorityQueue.enqueue(message)
      }
    }
  }

  sendCommand(command: string): void {
    // Commands are high priority for immediate execution
    this.sendMessage('execute_command', { command }, 'high')
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler)
  }

  onConnectionChange(handler: (connected: boolean, error?: string) => void): void {
    this.connectionHandlers.push(handler)
  }


  private handlePongMessage(message: WebSocketMessage): void {
    const now = Date.now()
    this.connectionHealth.lastPongTime = now
    
    if (message.data?.timestamp) {
      const latency = now - message.data.timestamp
      this.connectionHealth.latency = latency
      this.metrics.lastLatency = latency
      this.latencyHistory.push(latency)
      
      // Update connection quality based on latency
      this.updateConnectionQuality(latency)
    }
    
    this.connectionHealth.missedPings = 0
  }

  private updateConnectionQuality(latency: number): void {
    if (latency < 50) {
      this.connectionHealth.connectionQuality = 'excellent'
    } else if (latency < 150) {
      this.connectionHealth.connectionQuality = 'good'
    } else if (latency < 500) {
      this.connectionHealth.connectionQuality = 'poor'
    } else {
      this.connectionHealth.connectionQuality = 'critical'
    }
  }

  private notifyConnectionHandlers(connected: boolean, error?: string): void {
    this.connectionHandlers.forEach(handler => handler(connected, error))
  }
  
  // Enhanced message processing with RAF optimization
  private queueMessage(message: WebSocketMessage): void {
    this.messageHistory.push(message)
    
    // Schedule UI update using requestAnimationFrame for smooth performance
    this.scheduleUIUpdate(() => {
      const handler = this.messageHandlers.get(message.type)
      if (handler) {
        handler(message.data)
      }
    })
  }

  private scheduleUIUpdate(update: () => void): void {
    this.scheduledUpdates.add(update)
    
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.processBatchedUpdates()
      })
    }
  }

  private processBatchedUpdates(): void {
    const updates = Array.from(this.scheduledUpdates)
    this.scheduledUpdates.clear()
    this.rafId = null
    
    const startTime = performance.now()
    
    // Process updates in batches to prevent blocking
    const batchSize = Math.min(updates.length, this.batchSize)
    const batch = updates.splice(0, batchSize)
    
    batch.forEach(update => {
      try {
        update()
      } catch (error) {
        console.error('Error processing UI update:', error)
      }
    })
    
    // Track processing time
    this.metrics.queueProcessingTime = performance.now() - startTime
    
    // If there are remaining updates, schedule next batch
    if (updates.length > 0) {
      updates.forEach(update => this.scheduledUpdates.add(update))
      setTimeout(() => {
        this.rafId = requestAnimationFrame(() => {
          this.processBatchedUpdates()
        })
      }, this.batchDelay)
    }
  }
  
  private startQueueProcessing(): void {
    this.isProcessingQueue = true
  }

  private stopQueueProcessing(): void {
    this.isProcessingQueue = false
    
    if (this.processingTimeoutId) {
      clearTimeout(this.processingTimeoutId)
      this.processingTimeoutId = null
    }
    
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
  
  
  private clearMessageQueue(): void {
    this.priorityQueue.clear()
    this.scheduledUpdates.clear()
    this.isProcessingQueue = false
  }
  
  private startHealthCheck(): void {
    this.stopHealthCheck()
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        const now = Date.now()
        
        // Check if we missed previous pong
        if (this.connectionHealth.lastPingTime > 0 && 
            this.connectionHealth.lastPongTime < this.connectionHealth.lastPingTime) {
          this.connectionHealth.missedPings++
          
          if (this.connectionHealth.missedPings >= this.maxMissedPings) {
            console.warn('Connection unhealthy, missed pings:', this.connectionHealth.missedPings)
            this.connectionHealth.isHealthy = false
            this.connectionHealth.connectionQuality = 'critical'
            
            // Trigger reconnection
            this.disconnect()
            this.attemptReconnect()
            return
          }
        }
        
        this.connectionHealth.lastPingTime = now
        this.sendMessage('ping', { timestamp: now }, 'critical')
      }
    }, this.healthCheckInterval)
  }
  
  private stopHealthCheck(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      this.metrics.reconnectCount++
      
      // Exponential backoff with jitter
      const backoffDelay = Math.min(
        this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.maxReconnectDelay
      )
      
      // Add random jitter (0-25% of delay) to prevent thundering herd
      const jitter = Math.random() * 0.25 * backoffDelay
      const totalDelay = backoffDelay + jitter
      
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${Math.round(totalDelay)}ms...`)
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error)
          
          // If this was the last attempt, notify handlers
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.notifyConnectionHandlers(false, 'Max reconnection attempts reached')
          }
        })
      }, totalDelay)
    } else {
      console.error('Max reconnection attempts reached')
      this.notifyConnectionHandlers(false, 'Max reconnection attempts reached')
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.connectionHealth.isHealthy
  }
  
  // Additional utility methods
  getConnectionStats(): {
    reconnectAttempts: number
    messageQueueLength: number
    messageHistoryLength: number
    lastPingTime: number
    isProcessingQueue: boolean
    connectionHealth: ConnectionHealth
    metrics: PerformanceMetrics
    queueSizes: Record<MessagePriority, number>
    memoryUsage: number
  } {
    return {
      reconnectAttempts: this.reconnectAttempts,
      messageQueueLength: this.priorityQueue.size(),
      messageHistoryLength: this.messageHistory.getSize(),
      lastPingTime: this.connectionHealth.lastPingTime,
      isProcessingQueue: this.isProcessingQueue,
      connectionHealth: { ...this.connectionHealth },
      metrics: { ...this.metrics },
      queueSizes: this.priorityQueue.getQueueSizes(),
      memoryUsage: this.metrics.memoryUsage
    }
  }

  getPerformanceMetrics(): PerformanceMetrics {
    this.updateMemoryMetrics()
    this.metricsHistory.push({ ...this.metrics })
    return { ...this.metrics }
  }

  getConnectionHealth(): ConnectionHealth {
    return { ...this.connectionHealth }
  }

  getLatencyHistory(): number[] {
    return [...this.latencyHistory]
  }

  getDiagnosticReport(): {
    connection: {
      status: string
      quality: string
      latency: number
      uptime: number
      reconnects: number
    }
    performance: {
      messagesPerSecond: number
      bytesPerSecond: number
      queueProcessingTime: number
      memoryUsage: number
    }
    queues: {
      outgoing: Record<MessagePriority, number>
      scheduledUpdates: number
    }
    recommendations: string[]
  } {
    const now = Date.now()
    const uptime = this.connectionStartTime ? now - this.connectionStartTime : 0
    const recommendations: string[] = []
    
    if (this.metrics.averageLatency > 500) {
      recommendations.push('High latency detected - consider optimizing network conditions')
    }
    
    if (this.priorityQueue.size() > 100) {
      recommendations.push('Large outgoing queue detected - consider reducing message frequency')
    }
    
    if (this.metrics.memoryUsage > 10000000) {
      recommendations.push('High memory usage - consider clearing message history more frequently')
    }
    
    if (this.connectionHealth.missedPings > 1) {
      recommendations.push('Connection instability detected - check network connectivity')
    }
    
    return {
      connection: {
        status: this.isConnected ? 'connected' : 'disconnected',
        quality: this.connectionHealth.connectionQuality,
        latency: this.connectionHealth.latency,
        uptime,
        reconnects: this.metrics.reconnectCount
      },
      performance: {
        messagesPerSecond: uptime > 0 ? (this.metrics.messagesReceived + this.metrics.messagesSent) / (uptime / 1000) : 0,
        bytesPerSecond: uptime > 0 ? this.metrics.bytesTransferred / (uptime / 1000) : 0,
        queueProcessingTime: this.metrics.queueProcessingTime,
        memoryUsage: this.metrics.memoryUsage
      },
      queues: {
        outgoing: this.priorityQueue.getQueueSizes(),
        scheduledUpdates: this.scheduledUpdates.size
      },
      recommendations
    }
  }

  setBatchSize(size: number): void {
    this.batchSize = Math.max(1, Math.min(size, 1000))
  }

  setRateLimit(messagesPerSecond: number): void {
    this.outgoingRateLimit = Math.max(1, Math.min(messagesPerSecond, 1000))
  }

  setHealthCheckInterval(intervalMs: number): void {
    this.healthCheckInterval = Math.max(5000, Math.min(intervalMs, 120000))
    if (this.isConnected) {
      this.startHealthCheck()
    }
  }
  
  clearMessageHistory(): void {
    this.messageHistory.clear()
  }
  
  getMessageHistory(): WebSocketMessage[] {
    return this.messageHistory.getAll()
  }

  forceHealthCheck(): void {
    if (this.isConnected) {
      const now = Date.now()
      this.connectionHealth.lastPingTime = now
      this.sendMessage('ping', { timestamp: now }, 'critical')
    }
  }

  resetMetrics(): void {
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      connectionTime: 0,
      lastLatency: 0,
      averageLatency: 0,
      reconnectCount: 0,
      queueProcessingTime: 0,
      memoryUsage: 0
    }
    this.latencyHistory = []
    this.metricsHistory.clear()
  }

  getQueueStats(): {
    totalQueued: number
    queuesByPriority: Record<MessagePriority, number>
    scheduledUpdates: number
    isProcessing: boolean
  } {
    return {
      totalQueued: this.priorityQueue.size(),
      queuesByPriority: this.priorityQueue.getQueueSizes(),
      scheduledUpdates: this.scheduledUpdates.size,
      isProcessing: this.isProcessingQueue
    }
  }

  emergencyCleanup(): void {
    this.stopQueueProcessing()
    this.clearMessageQueue()
    this.messageHistory.clear()
    this.scheduledUpdates.clear()
    
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    
    console.log('Emergency cleanup completed')
  }

  /**
   * Get current WebSocket configuration details
   * @returns Configuration object with connection details
   */
  getConfiguration(): {
    wsBaseUrl: string
    sessionId: string
    apiUrl: string
    environment: 'production' | 'development' | 'local'
  } {
    const apiUrl = getApiUrl()
    
    let environment: 'production' | 'development' | 'local' = 'local'
    if (apiUrl.includes('vercel.app') || apiUrl.includes('production')) {
      environment = 'production'
    } else if (apiUrl.includes('dev') || apiUrl.includes('staging')) {
      environment = 'development'
    }
    
    return {
      wsBaseUrl: this.wsBaseUrl,
      sessionId: this.sessionId,
      apiUrl,
      environment
    }
  }

  /**
   * Validate WebSocket connection settings
   * @returns Validation results with recommendations
   */
  validateConfiguration(): {
    isValid: boolean
    warnings: string[]
    recommendations: string[]
  } {
    const warnings: string[] = []
    const recommendations: string[] = []
    let isValid = true

    const config = this.getConfiguration()
    
    // Validate URL format
    try {
      new URL(config.wsBaseUrl.replace('ws://', 'http://').replace('wss://', 'https://'))
    } catch {
      warnings.push('Invalid WebSocket URL format')
      recommendations.push('Check VITE_API_URL environment variable format')
      isValid = false
    }

    // Check for mixed content issues
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && config.wsBaseUrl.startsWith('ws://')) {
      warnings.push('Mixed content: HTTPS page with insecure WebSocket')
      recommendations.push('Use wss:// protocol for HTTPS pages')
    }

    // Check for localhost in production
    if (config.environment === 'production' && (config.wsBaseUrl.includes('localhost') || config.wsBaseUrl.includes('127.0.0.1'))) {
      warnings.push('Using localhost URL in production environment')
      recommendations.push('Set VITE_API_URL to production WebSocket URL')
      isValid = false
    }

    // Check session ID format
    if (!config.sessionId || config.sessionId.length < 8) {
      warnings.push('Session ID is too short or missing')
      recommendations.push('Ensure session ID is properly generated')
    }

    return {
      isValid,
      warnings,
      recommendations
    }
  }
}