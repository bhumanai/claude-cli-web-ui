import { WebSocketService } from '@/services/WebSocketService'

export interface PerformanceTestConfig {
  messageCount: number
  messageSize: number
  concurrentConnections: number
  testDurationMs: number
  messageTypes: string[]
  priorities: ('critical' | 'high' | 'normal' | 'low')[]
}

export interface PerformanceTestResult {
  config: PerformanceTestConfig
  results: {
    totalMessages: number
    messagesPerSecond: number
    averageLatency: number
    minLatency: number
    maxLatency: number
    p95Latency: number
    p99Latency: number
    bytesTransferred: number
    connectionTime: number
    memoryUsage: number
    errorRate: number
    queueEfficiency: number
  }
  recommendations: string[]
  timestamp: Date
}

export class WebSocketPerformanceTester {
  private testRunning = false
  private testStartTime = 0
  private messageLatencies: number[] = []
  private messagesSent = 0
  private messagesReceived = 0
  private errors = 0
  private bytesTransferred = 0

  async runPerformanceTest(
    wsService: WebSocketService,
    config: PerformanceTestConfig
  ): Promise<PerformanceTestResult> {
    if (this.testRunning) {
      throw new Error('Performance test already running')
    }

    this.resetTestMetrics()
    this.testRunning = true
    this.testStartTime = Date.now()

    console.log('Starting WebSocket performance test...', config)

    try {
      // Run the test
      await this.executeTest(wsService, config)

      // Calculate results
      const results = this.calculateResults(config)
      
      console.log('Performance test completed:', results)
      
      return {
        config,
        results,
        recommendations: this.generateRecommendations(results),
        timestamp: new Date()
      }
    } finally {
      this.testRunning = false
    }
  }

  private resetTestMetrics(): void {
    this.messageLatencies = []
    this.messagesSent = 0
    this.messagesReceived = 0
    this.errors = 0
    this.bytesTransferred = 0
  }

  private async executeTest(
    wsService: WebSocketService,
    config: PerformanceTestConfig
  ): Promise<void> {
    const testPromises: Promise<void>[] = []

    // Message sending test
    testPromises.push(this.runMessageSendTest(wsService, config))

    // Latency measurement test
    testPromises.push(this.runLatencyTest(wsService, config))

    // Memory pressure test
    testPromises.push(this.runMemoryTest(wsService, config))

    // Queue efficiency test
    testPromises.push(this.runQueueEfficiencyTest(wsService, config))

    // Wait for all tests to complete or timeout
    await Promise.race([
      Promise.all(testPromises),
      new Promise(resolve => setTimeout(resolve, config.testDurationMs))
    ])
  }

  private async runMessageSendTest(
    wsService: WebSocketService,
    config: PerformanceTestConfig
  ): Promise<void> {
    const messageData = 'x'.repeat(config.messageSize)
    const messageTypes = config.messageTypes
    const priorities = config.priorities

    for (let i = 0; i < config.messageCount && this.testRunning; i++) {
      try {
        const messageType = messageTypes[i % messageTypes.length]
        const priority = priorities[i % priorities.length]
        
        const startTime = performance.now()
        
        wsService.sendMessage(messageType, { 
          data: messageData,
          testId: i,
          timestamp: startTime
        }, priority)
        
        this.messagesSent++
        this.bytesTransferred += JSON.stringify({ 
          type: messageType, 
          data: messageData,
          testId: i,
          timestamp: startTime
        }).length

        // Add small delay to avoid overwhelming the system
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      } catch (error) {
        this.errors++
        console.error('Message send error:', error)
      }
    }
  }

  private async runLatencyTest(
    wsService: WebSocketService,
    config: PerformanceTestConfig
  ): Promise<void> {
    // Set up message handler for latency measurement
    wsService.onMessage('test_response', (data) => {
      if (data.testId !== undefined && data.originalTimestamp) {
        const latency = performance.now() - data.originalTimestamp
        this.messageLatencies.push(latency)
        this.messagesReceived++
      }
    })

    // Send ping-style messages for latency measurement
    const pingCount = Math.min(100, config.messageCount / 10)
    for (let i = 0; i < pingCount && this.testRunning; i++) {
      const timestamp = performance.now()
      wsService.sendMessage('test_ping', {
        testId: i,
        timestamp
      }, 'high')

      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  private async runMemoryTest(
    wsService: WebSocketService,
    config: PerformanceTestConfig
  ): Promise<void> {
    // Create memory pressure by sending large messages
    const largeMessageData = 'x'.repeat(config.messageSize * 10)
    
    for (let i = 0; i < 50 && this.testRunning; i++) {
      wsService.sendMessage('memory_test', {
        data: largeMessageData,
        iteration: i
      }, 'low')

      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  private async runQueueEfficiencyTest(
    wsService: WebSocketService,
    config: PerformanceTestConfig
  ): Promise<void> {
    // Send burst of messages to test queue efficiency
    const burstSize = 500
    const startTime = performance.now()
    
    for (let i = 0; i < burstSize && this.testRunning; i++) {
      const priority = i % 4 === 0 ? 'critical' : 
                      i % 3 === 0 ? 'high' : 
                      i % 2 === 0 ? 'normal' : 'low'
      
      wsService.sendMessage('queue_test', {
        burstId: i,
        priority
      }, priority as any)
    }

    // Measure queue processing time
    const processingTime = performance.now() - startTime
    console.log(`Queue burst processing time: ${processingTime}ms`)
  }

  private calculateResults(config: PerformanceTestConfig): PerformanceTestResult['results'] {
    const testDuration = Date.now() - this.testStartTime
    const sortedLatencies = this.messageLatencies.sort((a, b) => a - b)
    
    return {
      totalMessages: this.messagesSent,
      messagesPerSecond: (this.messagesSent / testDuration) * 1000,
      averageLatency: this.messageLatencies.length > 0 ? 
        this.messageLatencies.reduce((a, b) => a + b, 0) / this.messageLatencies.length : 0,
      minLatency: sortedLatencies[0] || 0,
      maxLatency: sortedLatencies[sortedLatencies.length - 1] || 0,
      p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
      p99Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
      bytesTransferred: this.bytesTransferred,
      connectionTime: testDuration,
      memoryUsage: 0, // Would need to be measured externally
      errorRate: this.errors / Math.max(this.messagesSent, 1),
      queueEfficiency: this.messagesReceived / Math.max(this.messagesSent, 1)
    }
  }

  private generateRecommendations(results: PerformanceTestResult['results']): string[] {
    const recommendations: string[] = []

    if (results.averageLatency > 100) {
      recommendations.push('High average latency detected. Consider optimizing network conditions or reducing message size.')
    }

    if (results.messagesPerSecond < 50) {
      recommendations.push('Low message throughput. Consider increasing batch size or optimizing queue processing.')
    }

    if (results.errorRate > 0.01) {
      recommendations.push('High error rate detected. Check connection stability and error handling.')
    }

    if (results.queueEfficiency < 0.95) {
      recommendations.push('Low queue efficiency. Some messages may be getting lost or not processed.')
    }

    if (results.p99Latency > results.averageLatency * 5) {
      recommendations.push('High latency variance detected. Consider implementing better flow control.')
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance looks good! No specific optimizations needed.')
    }

    return recommendations
  }
}

// Utility function to run a quick performance test
export async function runQuickPerformanceTest(wsService: WebSocketService): Promise<PerformanceTestResult> {
  const tester = new WebSocketPerformanceTester()
  
  const config: PerformanceTestConfig = {
    messageCount: 1000,
    messageSize: 1024, // 1KB messages
    concurrentConnections: 1,
    testDurationMs: 30000, // 30 seconds
    messageTypes: ['test_message', 'command_test', 'data_update'],
    priorities: ['critical', 'high', 'normal', 'low']
  }

  return await tester.runPerformanceTest(wsService, config)
}

// Utility function for stress testing
export async function runStressTest(wsService: WebSocketService): Promise<PerformanceTestResult> {
  const tester = new WebSocketPerformanceTester()
  
  const config: PerformanceTestConfig = {
    messageCount: 10000,
    messageSize: 4096, // 4KB messages
    concurrentConnections: 1,
    testDurationMs: 60000, // 60 seconds
    messageTypes: ['stress_test', 'large_data', 'bulk_update'],
    priorities: ['high', 'normal', 'low']
  }

  return await tester.runPerformanceTest(wsService, config)
}

// Performance benchmarking utility
export class PerformanceBenchmark {
  private results: PerformanceTestResult[] = []

  addResult(result: PerformanceTestResult): void {
    this.results.push(result)
  }

  getAverageMetrics(): Partial<PerformanceTestResult['results']> {
    if (this.results.length === 0) return {}

    const totals = this.results.reduce((acc, result) => {
      Object.keys(result.results).forEach(key => {
        if (typeof result.results[key as keyof typeof result.results] === 'number') {
          acc[key] = (acc[key] || 0) + (result.results[key as keyof typeof result.results] as number)
        }
      })
      return acc
    }, {} as Record<string, number>)

    const averages: Partial<PerformanceTestResult['results']> = {}
    Object.keys(totals).forEach(key => {
      ;(averages as any)[key] = totals[key] / this.results.length
    })

    return averages
  }

  generateBenchmarkReport(): {
    averages: Partial<PerformanceTestResult['results']>
    improvements: string[]
    regressions: string[]
  } {
    const averages = this.getAverageMetrics()
    const improvements: string[] = []
    const regressions: string[] = []

    if (this.results.length >= 2) {
      const latest = this.results[this.results.length - 1].results
      const previous = this.results[this.results.length - 2].results

      if (latest.messagesPerSecond > previous.messagesPerSecond * 1.1) {
        improvements.push(`Message throughput improved by ${((latest.messagesPerSecond / previous.messagesPerSecond - 1) * 100).toFixed(1)}%`)
      } else if (latest.messagesPerSecond < previous.messagesPerSecond * 0.9) {
        regressions.push(`Message throughput decreased by ${((1 - latest.messagesPerSecond / previous.messagesPerSecond) * 100).toFixed(1)}%`)
      }

      if (latest.averageLatency < previous.averageLatency * 0.9) {
        improvements.push(`Average latency improved by ${((1 - latest.averageLatency / previous.averageLatency) * 100).toFixed(1)}%`)
      } else if (latest.averageLatency > previous.averageLatency * 1.1) {
        regressions.push(`Average latency increased by ${((latest.averageLatency / previous.averageLatency - 1) * 100).toFixed(1)}%`)
      }
    }

    return { averages, improvements, regressions }
  }
}