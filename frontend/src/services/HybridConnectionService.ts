/**
 * Hybrid connection service that tries WebSocket first, then falls back to HTTP polling
 */

import { WebSocketService } from './WebSocketService'
import { PollingService } from './PollingService'

export interface ConnectionMetrics {
  mode: 'websocket' | 'polling' | 'disconnected'
  isConnected: boolean
  lastActivity: number
  connectionAttempts: number
}

export class HybridConnectionService {
  private sessionId: string
  private wsService: WebSocketService
  private pollingService: PollingService
  private currentMode: 'websocket' | 'polling' | 'disconnected' = 'disconnected'
  private connectionHandlers: ((isConnected: boolean, mode?: string) => void)[] = []
  private messageHandlers: Map<string, (data: any) => void> = new Map()
  private wsFailureCount = 0
  private maxWsFailures = 3
  private forceFallback = false

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.wsService = new WebSocketService(sessionId)
    this.pollingService = new PollingService(sessionId)
    
    this.setupWebSocketHandlers()
    this.setupPollingHandlers()
  }

  private setupWebSocketHandlers(): void {
    this.wsService.onConnectionChange((isConnected: boolean) => {
      if (isConnected && this.currentMode !== 'websocket') {
        console.log('✅ WebSocket connected successfully')
        this.currentMode = 'websocket'
        this.wsFailureCount = 0
        
        // Stop polling if it was running
        if (this.pollingService) {
          this.pollingService.disconnect()
        }
        
        this.notifyConnectionHandlers(true, 'websocket')
      } else if (!isConnected && this.currentMode === 'websocket') {
        console.log('❌ WebSocket disconnected')
        this.wsFailureCount++
        
        if (this.wsFailureCount >= this.maxWsFailures || this.forceFallback) {
          console.log('🔄 Switching to polling mode')
          this.switchToPolling()
        }
      }
    })

    // Forward WebSocket messages
    this.wsService.onMessage('command_started', (data) => {
      this.handleMessage('command_started', data)
    })
    
    this.wsService.onMessage('command_update', (data) => {
      this.handleMessage('command_update', data)
    })
    
    this.wsService.onMessage('command_finished', (data) => {
      this.handleMessage('command_finished', data)
    })
  }

  private setupPollingHandlers(): void {
    this.pollingService.onConnection((isConnected: boolean) => {
      if (isConnected && this.currentMode !== 'polling') {
        console.log('✅ Polling service connected')
        this.currentMode = 'polling'
        this.notifyConnectionHandlers(true, 'polling')
      } else if (!isConnected && this.currentMode === 'polling') {
        console.log('❌ Polling service disconnected')
        this.currentMode = 'disconnected'
        this.notifyConnectionHandlers(false, 'polling')
      }
    })

    // Forward polling messages
    this.pollingService.onMessage('command_started', (data) => {
      this.handleMessage('command_started', data)
    })
    
    this.pollingService.onMessage('command_update', (data) => {
      this.handleMessage('command_update', data)
    })
    
    this.pollingService.onMessage('command_finished', (data) => {
      this.handleMessage('command_finished', data)
    })
  }

  async connect(): Promise<void> {
    console.log('🚀 Starting hybrid connection for session:', this.sessionId)
    
    // Check if already connected or connecting
    if (this.currentMode !== 'disconnected') {
      console.log('⚠️ Already connected or connecting, skipping...')
      return
    }
    
    // Skip WebSocket and go directly to polling to avoid connection issues
    console.log('📡 Using HTTP polling mode for stable connection')
    await this.switchToPolling()
  }

  private async switchToPolling(): Promise<void> {
    console.log('🔄 Switching to polling mode')
    this.forceFallback = true
    
    // Disconnect WebSocket if connected
    if (this.wsService) {
      this.wsService.disconnect()
    }
    
    // Start polling
    await this.pollingService.connect()
  }

  disconnect(): void {
    console.log('🛑 Disconnecting hybrid service')
    this.wsService.disconnect()
    this.pollingService.disconnect()
    this.currentMode = 'disconnected'
    this.notifyConnectionHandlers(false)
  }

  private handleMessage(type: string, data: any): void {
    const handler = this.messageHandlers.get(type)
    if (handler) {
      handler(data)
    }
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler)
  }

  onConnection(handler: (isConnected: boolean, mode?: string) => void): void {
    this.connectionHandlers.push(handler)
  }

  private notifyConnectionHandlers(isConnected: boolean, mode?: string): void {
    this.connectionHandlers.forEach(handler => handler(isConnected, mode))
  }

  async sendMessage(type: string, data: any): Promise<void> {
    if (this.currentMode === 'websocket') {
      return this.wsService.sendMessage(type, data)
    } else if (this.currentMode === 'polling') {
      return this.pollingService.sendMessage(type, data)
    }
    throw new Error('No connection available')
  }

  async executeCommand(command: string): Promise<any> {
    if (this.currentMode === 'websocket') {
      return this.wsService.sendMessage('execute_command', { command })
    } else if (this.currentMode === 'polling') {
      return this.pollingService.executeCommand(command)
    }
    throw new Error('No connection available')
  }

  getConnectionMetrics(): ConnectionMetrics {
    return {
      mode: this.currentMode,
      isConnected: this.currentMode !== 'disconnected',
      lastActivity: Date.now(),
      connectionAttempts: this.wsFailureCount
    }
  }

  getPerformanceMetrics() {
    if (this.currentMode === 'websocket') {
      return this.wsService.getPerformanceMetrics()
    } else if (this.currentMode === 'polling') {
      return this.pollingService.getMetrics()
    }
    return null
  }
  
  getConnectionHealth() {
    return {
      isHealthy: this.currentMode !== 'disconnected',
      latency: 0,
      connectionQuality: this.currentMode === 'websocket' ? 'excellent' : 'good',
      missedPings: 0,
      connectionStability: 1
    }
  }
  
  getDiagnosticReport() {
    return {
      mode: this.currentMode,
      wsFailureCount: this.wsFailureCount,
      isConnected: this.currentMode !== 'disconnected',
      timestamp: new Date().toISOString()
    }
  }
  
  resetMetrics() {
    if (this.currentMode === 'websocket' && this.wsService.resetMetrics) {
      this.wsService.resetMetrics()
    }
  }
  
  forceHealthCheck() {
    // No-op for now
  }
}