/**
 * Polling-based service for HTTP communication
 * NO MOCK BACKEND - REQUIRES REAL BACKEND ONLY!
 */

import { getApiUrl } from '@/config/backend'

export interface PollingMessage {
  type: string
  data: any
  timestamp: number
}

export class PollingService {
  private sessionId: string
  private baseUrl: string
  private pollInterval: number = 5000 // 5 seconds
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

  isConnected(): boolean {
    return this.isPolling
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler)
  }

  offMessage(type: string): void {
    this.messageHandlers.delete(type)
  }

  onConnectionChange(handler: (isConnected: boolean) => void): void {
    this.connectionHandlers.push(handler)
  }

  private notifyConnectionHandlers(isConnected: boolean): void {
    this.connectionHandlers.forEach(handler => handler(isConnected))
  }

  private startPolling(): void {
    if (!this.isPolling) return
    
    // Poll immediately, then schedule next poll
    this.poll().then(() => {
      if (this.isPolling) {
        this.pollTimeoutId = setTimeout(() => this.startPolling(), this.pollInterval)
      }
    })
  }

  private async poll(): Promise<void> {
    if (!this.isPolling) return
    
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${this.sessionId}/messages?since=${this.lastPollTime}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('claude-cli-auth') || ''
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.messages && Array.isArray(data.messages)) {
          for (const message of data.messages) {
            this.handleMessage({
              type: message.type,
              data: message.data,
              timestamp: message.timestamp || Date.now()
            })
          }
        }
        this.lastPollTime = Date.now()
      }
      
    } catch (error) {
      // NO MOCK FALLBACK - REAL BACKEND REQUIRED!
      console.error('Poll failed - BACKEND REQUIRED:', error)
      this.consecutiveErrors++
      
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error('Too many consecutive errors - BACKEND NOT AVAILABLE')
        this.handleMessage({
          type: 'error',
          data: {
            message: 'BACKEND REQUIRED - NO MOCK MODE! Make sure the full backend is running!',
            error: 'backend_required'
          },
          timestamp: Date.now()
        })
      }
    }
  }

  private handleMessage(message: PollingMessage): void {
    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      handler(message.data)
    }
  }

  async sendCommand(command: string): Promise<any> {
    try {
      // Check if this is a /plan command and route accordingly
      const endpoint = command.trim().toLowerCase().startsWith('/plan') 
        ? `${this.baseUrl}/api/commands/plan`
        : `${this.baseUrl}/api/commands/execute`;
      
      // Get current project_id from localStorage
      const currentProject = localStorage.getItem('claude-cli-current-project');
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('claude-cli-auth') || ''
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          session_id: this.sessionId, // Some endpoints use snake_case
          command,
          project_id: currentProject || undefined
        })
      })
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`)
      }
      
      const result = await response.json()
      
      // Notify about command start
      this.handleMessage({
        type: 'command_started',
        data: {
          id: result.id || `cmd_${Date.now()}`,
          command: command
        },
        timestamp: Date.now()
      })
      
      // Simulate command updates for now
      setTimeout(() => {
        this.handleMessage({
          type: 'command_update',
          data: {
            id: result.id || `cmd_${Date.now()}`,
            output: [{content: result.output || 'Command sent to backend', type: 'stdout'}],
            isPartial: false,
            status: 'completed'
          },
          timestamp: Date.now()
        })
      }, 100)
      
      return result
    } catch (error) {
      console.error('Failed to execute command:', error)
      throw new Error('BACKEND REQUIRED - NO MOCK MODE! Run the full backend!')
    }
  }

  // Alias for HybridConnectionService compatibility
  onConnection(handler: (isConnected: boolean) => void): void {
    this.onConnectionChange(handler)
  }

  // Add executeCommand method for HybridConnectionService
  async executeCommand(command: string): Promise<any> {
    return this.sendCommand(command)
  }

  // Add getMetrics method for HybridConnectionService
  getMetrics() {
    return {
      pollInterval: this.pollInterval,
      consecutiveErrors: this.consecutiveErrors,
      lastPollTime: this.lastPollTime,
      isPolling: this.isPolling
    }
  }
}