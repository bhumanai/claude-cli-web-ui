/**
 * Polling-based fallback service for when WebSocket connections are not available
 * This service polls HTTP endpoints to simulate real-time communication
 */

import { mockBackend } from './MockBackendService'
import { getApiUrl } from '@/config/backend'

export interface PollingMessage {
  type: string
  data: any
  timestamp: number
}

export class PollingService {
  private sessionId: string
  private baseUrl: string
  private pollInterval: number = 5000 // 5 seconds - reduced frequency to prevent overload
  private isPolling: boolean = false
  private pollTimeoutId: NodeJS.Timeout | null = null
  private messageHandlers: Map<string, (data: any) => void> = new Map()
  private connectionHandlers: ((isConnected: boolean) => void)[] = []
  private lastPollTime: number = 0
  private consecutiveErrors: number = 0
  private maxConsecutiveErrors: number = 3

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.baseUrl = this.getApiBaseUrl()
  }

  private getApiBaseUrl(): string {
    return getApiUrl().replace(/\/$/, '') // Remove trailing slash
  }

  async connect(): Promise<void> {
    console.log('Starting polling service for session:', this.sessionId)
    this.isPolling = true
    this.startPolling()
    this.notifyConnectionHandlers(true)
  }

  disconnect(): void {
    console.log('Stopping polling service')
    this.isPolling = false
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId)
      this.pollTimeoutId = null
    }
    this.notifyConnectionHandlers(false)
  }

  private startPolling(): void {
    if (!this.isPolling) return

    // Stop polling if too many consecutive errors
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.error('Too many consecutive polling errors, stopping polling')
      this.disconnect()
      this.notifyConnectionHandlers(false)
      return
    }

    this.pollTimeoutId = setTimeout(async () => {
      try {
        await this.poll()
        this.consecutiveErrors = 0 // Reset error count on success
      } catch (error) {
        console.warn('Polling error:', error)
        this.consecutiveErrors++
      }
      
      if (this.isPolling) {
        this.startPolling() // Schedule next poll
      }
    }, this.pollInterval)
  }

  private async poll(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${this.sessionId}/messages?since=${this.lastPollTime}`)
      
      if (!response.ok) {
        throw new Error(`Polling failed: ${response.status}`)
      }

      const data = await response.json()
      const messages: PollingMessage[] = data.messages || data
      
      for (const message of messages) {
        this.handleMessage(message)
        this.lastPollTime = Math.max(this.lastPollTime, message.timestamp || Date.now())
      }
      
      // Update last poll time if no messages
      if (messages.length === 0) {
        this.lastPollTime = Date.now()
      }
      
    } catch (error) {
      // Fallback to mock backend
      console.debug('Poll failed, using mock backend:', error)
      try {
        const mockData = await mockBackend.getMessages(this.sessionId, this.lastPollTime)
        for (const message of mockData.messages) {
          this.handleMessage({
            type: message.type,
            data: message.data,
            timestamp: Date.now()
          })
        }
        this.lastPollTime = Date.now()
      } catch (mockError) {
        console.error('Mock backend also failed:', mockError)
      }
    }
  }

  private handleMessage(message: PollingMessage): void {
    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      handler(message.data)
    }
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler)
  }

  onConnection(handler: (isConnected: boolean) => void): void {
    this.connectionHandlers.push(handler)
  }

  private notifyConnectionHandlers(isConnected: boolean): void {
    this.connectionHandlers.forEach(handler => handler(isConnected))
  }

  async sendMessage(type: string, data: any): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${this.sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, data })
      })

      if (!response.ok) {
        throw new Error(`Send message failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      throw error
    }
  }

  async executeCommand(command: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${this.sessionId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command })
      })

      if (!response.ok) {
        throw new Error(`Command execution failed: ${response.status}`)
      }

      const result = await response.json()
      
      // First notify command started
      this.handleMessage({
        type: 'command_started',
        data: {
          id: result.id,
          command: command
        },
        timestamp: Date.now()
      })
      
      // Then simulate command updates for consistency
      setTimeout(() => {
        this.handleMessage({
          type: 'command_update',
          data: {
            id: result.id,
            output: [{content: result.output, type: 'stdout'}],
            isPartial: false,
            status: 'running'
          },
          timestamp: Date.now()
        })
        
        this.handleMessage({
          type: 'command_finished',
          data: {
            id: result.id,
            status: result.status
          },
          timestamp: Date.now()
        })
      }, 100)
      
      return result
    } catch (error) {
      console.error('Failed to execute command, using mock backend:', error)
      
      // Fallback to mock backend
      const mockResult = await mockBackend.executeCommand(this.sessionId, command)
      
      // First notify command started
      this.handleMessage({
        type: 'command_started',
        data: {
          id: mockResult.id,
          command: command
        },
        timestamp: Date.now()
      })
      
      // Simulate command updates
      setTimeout(() => {
        this.handleMessage({
          type: 'command_update',
          data: {
            id: mockResult.id,
            output: [{content: mockResult.output, type: 'stdout'}],
            isPartial: false,
            status: 'running'
          },
          timestamp: Date.now()
        })
        
        this.handleMessage({
          type: 'command_finished',
          data: {
            id: mockResult.id,
            status: mockResult.status
          },
          timestamp: Date.now()
        })
      }, 100)
      
      return mockResult
    }
  }

  getMetrics() {
    return {
      isPolling: this.isPolling,
      pollInterval: this.pollInterval,
      lastPollTime: this.lastPollTime
    }
  }
}