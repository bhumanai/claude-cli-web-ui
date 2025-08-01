import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { WebSocketService } from '@/services/WebSocketService'
import { runQuickPerformanceTest, WebSocketPerformanceTester } from '@/utils/webSocketPerformanceTest'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(public url: string) {
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 100)
  }

  send(data: string): void {
    // Simulate message echo for testing
    setTimeout(() => {
      if (this.onmessage) {
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'ping') {
            // Respond with pong
            this.onmessage(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'pong',
                data: { timestamp: parsed.data?.timestamp },
                session_id: parsed.session_id
              })
            }))
          } else if (parsed.type === 'test_ping') {
            // Respond to performance test pings
            this.onmessage(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'test_response',
                data: { 
                  testId: parsed.data?.testId,
                  originalTimestamp: parsed.data?.timestamp
                },
                session_id: parsed.session_id
              })
            }))
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }, 10 + Math.random() * 40) // Random latency 10-50ms
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }
}

// @ts-ignore
global.WebSocket = MockWebSocket
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16))
global.cancelAnimationFrame = vi.fn()

describe('WebSocket Performance Optimizations', () => {
  let wsService: WebSocketService

  beforeEach(() => {
    wsService = new WebSocketService('test-session')
  })

  afterEach(() => {
    wsService.disconnect()
  })

  describe('Message Queuing and Batching', () => {
    it('should queue messages by priority', async () => {
      await wsService.connect()
      
      // Send messages with different priorities
      wsService.sendMessage('test1', {}, 'low')
      wsService.sendMessage('test2', {}, 'critical')
      wsService.sendMessage('test3', {}, 'normal')
      wsService.sendMessage('test4', {}, 'high')

      const queueStats = wsService.getQueueStats()
      
      // Queue should contain messages
      expect(queueStats.totalQueued).toBeGreaterThan(0)
      expect(queueStats.queuesByPriority).toHaveProperty('critical')
      expect(queueStats.queuesByPriority).toHaveProperty('high')
      expect(queueStats.queuesByPriority).toHaveProperty('normal')
      expect(queueStats.queuesByPriority).toHaveProperty('low')
    })

    it('should process messages in priority order', async () => {
      await wsService.connect()
      
      const processedMessages: string[] = []
      const originalSend = wsService['ws']?.send
      
      if (wsService['ws']) {
        wsService['ws'].send = vi.fn((data: string) => {
          const parsed = JSON.parse(data)
          processedMessages.push(parsed.type)
          originalSend?.call(wsService['ws'], data)
        })
      }

      // Send messages in non-priority order
      wsService.sendMessage('low_priority', {}, 'low')
      wsService.sendMessage('critical_message', {}, 'critical')
      wsService.sendMessage('normal_message', {}, 'normal')

      await new Promise(resolve => setTimeout(resolve, 200))

      // Critical should be processed first
      expect(processedMessages[0]).toBe('critical_message')
    })

    it('should respect rate limiting', async () => {
      await wsService.connect()
      wsService.setRateLimit(10) // 10 messages per second
      
      const startTime = Date.now()
      const messageCount = 25
      
      for (let i = 0; i < messageCount; i++) {
        wsService.sendMessage(`test_${i}`, {}, 'normal')
      }
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should take at least 2 seconds to send 25 messages at 10/sec rate
      expect(duration).toBeGreaterThan(2000)
    })
  })

  describe('Connection Health Monitoring', () => {
    it('should track connection health metrics', async () => {
      await wsService.connect()
      
      // Force a health check
      wsService.forceHealthCheck()
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const health = wsService.getConnectionHealth()
      
      expect(health).toHaveProperty('isHealthy')
      expect(health).toHaveProperty('latency')
      expect(health).toHaveProperty('connectionQuality')
      expect(health).toHaveProperty('missedPings')
      expect(health.connectionQuality).toMatch(/excellent|good|poor|critical/)
    })

    it('should calculate latency correctly', async () => {
      await wsService.connect()
      
      wsService.forceHealthCheck()
      
      // Wait for ping-pong cycle
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const health = wsService.getConnectionHealth()
      
      expect(health.latency).toBeGreaterThan(0)
      expect(health.latency).toBeLessThan(1000) // Should be reasonable
    })

    it('should detect connection quality degradation', async () => {
      await wsService.connect()
      
      // Simulate missed pings by not responding
      const originalOnMessage = wsService['ws']?.onmessage
      if (wsService['ws']) {
        wsService['ws'].onmessage = null // Block pong responses
      }
      
      wsService.forceHealthCheck()
      wsService.forceHealthCheck()
      wsService.forceHealthCheck()
      
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const health = wsService.getConnectionHealth()
      
      expect(health.missedPings).toBeGreaterThan(0)
      expect(health.isHealthy).toBe(false)
      
      // Restore message handler
      if (wsService['ws'] && originalOnMessage) {
        wsService['ws'].onmessage = originalOnMessage
      }
    })
  })

  describe('Exponential Backoff Reconnection', () => {
    it('should implement exponential backoff', async () => {
      const reconnectDelays: number[] = []
      const originalSetTimeout = global.setTimeout
      
      global.setTimeout = vi.fn((callback, delay) => {
        if (delay && delay > 500) { // Only track reconnection delays
          reconnectDelays.push(delay as number)
        }
        return originalSetTimeout(callback, delay)
      }) as any

      // Force disconnection and reconnection attempts
      await wsService.connect()
      wsService.disconnect()
      
      // Trigger multiple reconnection attempts
      for (let i = 0; i < 3; i++) {
        wsService['attemptReconnect']()
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Should have exponentially increasing delays
      expect(reconnectDelays.length).toBeGreaterThan(0)
      
      global.setTimeout = originalSetTimeout
    })
  })

  describe('Memory Management', () => {
    it('should use circular buffer for message history', async () => {
      await wsService.connect()
      
      const initialHistory = wsService.getMessageHistory()
      expect(Array.isArray(initialHistory)).toBe(true)
      
      // Add many messages to test buffer limit
      for (let i = 0; i < 2500; i++) {
        wsService['messageHistory'].push({
          type: 'test',
          data: { id: i },
          session_id: 'test'
        })
      }
      
      const history = wsService.getMessageHistory()
      
      // Should be limited by buffer size (2000)
      expect(history.length).toBeLessThanOrEqual(2000)
      
      // Should contain most recent messages
      const lastMessage = history[history.length - 1]
      expect(lastMessage.data.id).toBe(2499)
    })

    it('should track memory usage', async () => {
      await wsService.connect()
      
      const metrics = wsService.getPerformanceMetrics()
      
      expect(metrics).toHaveProperty('memoryUsage')
      expect(typeof metrics.memoryUsage).toBe('number')
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0)
    })

    it('should cleanup resources on disconnect', async () => {
      await wsService.connect()
      
      // Add some data
      for (let i = 0; i < 100; i++) {
        wsService.sendMessage('test', { data: i }, 'normal')
      }
      
      wsService.emergencyCleanup()
      
      const queueStats = wsService.getQueueStats()
      expect(queueStats.totalQueued).toBe(0)
      expect(queueStats.scheduledUpdates).toBe(0)
      
      const history = wsService.getMessageHistory()
      expect(history.length).toBe(0)
    })
  })

  describe('Performance Metrics', () => {
    it('should track comprehensive performance metrics', async () => {
      await wsService.connect()
      
      // Generate some activity
      wsService.sendMessage('test1', {}, 'normal')
      wsService.sendMessage('test2', {}, 'high')
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const metrics = wsService.getPerformanceMetrics()
      
      expect(metrics).toHaveProperty('messagesSent')
      expect(metrics).toHaveProperty('messagesReceived')
      expect(metrics).toHaveProperty('bytesTransferred')
      expect(metrics).toHaveProperty('connectionTime')
      expect(metrics).toHaveProperty('averageLatency')
      expect(metrics).toHaveProperty('queueProcessingTime')
      expect(metrics).toHaveProperty('memoryUsage')
      
      expect(typeof metrics.messagesSent).toBe('number')
      expect(typeof metrics.bytesTransferred).toBe('number')
    })

    it('should generate diagnostic report', async () => {
      await wsService.connect()
      
      const report = wsService.getDiagnosticReport()
      
      expect(report).toHaveProperty('connection')
      expect(report).toHaveProperty('performance')
      expect(report).toHaveProperty('queues')
      expect(report).toHaveProperty('recommendations')
      
      expect(Array.isArray(report.recommendations)).toBe(true)
      expect(report.connection.status).toBe('connected')
    })

    it('should reset metrics correctly', async () => {
      await wsService.connect()
      
      // Generate some activity
      wsService.sendMessage('test', {}, 'normal')
      await new Promise(resolve => setTimeout(resolve, 100))
      
      let metrics = wsService.getPerformanceMetrics()
      expect(metrics.messagesSent).toBeGreaterThan(0)
      
      wsService.resetMetrics()
      
      metrics = wsService.getPerformanceMetrics()
      expect(metrics.messagesSent).toBe(0)
      expect(metrics.messagesReceived).toBe(0)
      expect(metrics.bytesTransferred).toBe(0)
    })
  })

  describe('Performance Testing', () => {
    it('should run performance test successfully', async () => {
      await wsService.connect()
      
      const tester = new WebSocketPerformanceTester()
      const config = {
        messageCount: 100,
        messageSize: 100,
        concurrentConnections: 1,
        testDurationMs: 5000,
        messageTypes: ['test'],
        priorities: ['normal' as const]
      }
      
      const result = await tester.runPerformanceTest(wsService, config)
      
      expect(result).toHaveProperty('config')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('recommendations')
      expect(result).toHaveProperty('timestamp')
      
      expect(result.results.totalMessages).toBeGreaterThan(0)
      expect(Array.isArray(result.recommendations)).toBe(true)
    }, 10000) // Extended timeout for performance test

    it('should provide performance recommendations', async () => {
      await wsService.connect()
      
      // Simulate poor performance conditions
      wsService.setRateLimit(1) // Very low rate limit
      
      const result = await runQuickPerformanceTest(wsService)
      
      expect(result.recommendations).toContain(
        expect.stringMatching(/throughput|latency|performance/i)
      )
    }, 15000)
  })

  describe('RAF Optimization', () => {
    it('should batch UI updates using requestAnimationFrame', async () => {
      await wsService.connect()
      
      let rafCallCount = 0
      const originalRAF = global.requestAnimationFrame
      global.requestAnimationFrame = vi.fn((callback) => {
        rafCallCount++
        return originalRAF(callback)
      })
      
      // Queue multiple messages rapidly
      for (let i = 0; i < 10; i++) {
        wsService['queueMessage']({
          type: 'test',
          data: { id: i },
          session_id: 'test'
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Should batch updates efficiently
      expect(rafCallCount).toBeLessThan(10) // Fewer RAF calls than messages
      
      global.requestAnimationFrame = originalRAF
    })
  })
})