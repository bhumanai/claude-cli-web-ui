import React, { useState, useCallback, useEffect } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import WebSocketPerformanceMonitor from './WebSocketPerformanceMonitor'
import { runQuickPerformanceTest, runStressTest, PerformanceBenchmark } from '@/utils/webSocketPerformanceTest'

const WebSocketPerformanceDemo: React.FC = () => {
  const sessionId = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const {
    isConnected,
    connectionQuality,
    performanceMetrics,
    getWebSocketService,
    resetPerformanceMetrics,
    forceHealthCheck
  } = useWebSocket(sessionId)

  const [isRunningTest, setIsRunningTest] = useState(false)
  const [testResults, setTestResults] = useState<any>(null)
  const [benchmark] = useState(new PerformanceBenchmark())
  const [demoMessages, setDemoMessages] = useState<string[]>([])
  const [messageRate, setMessageRate] = useState(10) // messages per second
  const [isSpamming, setIsSpamming] = useState(false)

  const wsService = getWebSocketService()

  // Message spam for testing
  useEffect(() => {
    if (!isSpamming || !wsService) return

    const interval = setInterval(() => {
      const priorities = ['critical', 'high', 'normal', 'low']
      const priority = priorities[Math.floor(Math.random() * priorities.length)]
      const messageData = `Demo message ${Date.now()} - Priority: ${priority}`
      
      wsService.sendMessage('demo_message', {
        content: messageData,
        timestamp: Date.now(),
        priority
      }, priority as any)
      
      setDemoMessages(prev => [
        ...prev.slice(-99), // Keep last 100 messages
        `[${priority.toUpperCase()}] ${messageData}`
      ])
    }, 1000 / messageRate)

    return () => clearInterval(interval)
  }, [isSpamming, messageRate, wsService])

  const runPerformanceTest = useCallback(async (testType: 'quick' | 'stress') => {
    if (!wsService || isRunningTest) return

    setIsRunningTest(true)
    try {
      const result = testType === 'quick' 
        ? await runQuickPerformanceTest(wsService)
        : await runStressTest(wsService)
      
      setTestResults(result)
      benchmark.addResult(result)
      
      console.log(`${testType} test completed:`, result)
    } catch (error) {
      console.error('Performance test failed:', error)
    } finally {
      setIsRunningTest(false)
    }
  }, [wsService, isRunningTest, benchmark])

  const adjustBatchSize = useCallback((size: number) => {
    if (wsService) {
      wsService.setBatchSize(size)
      setDemoMessages(prev => [...prev, `Batch size set to ${size}`])
    }
  }, [wsService])

  const adjustRateLimit = useCallback((rate: number) => {
    if (wsService) {
      wsService.setRateLimit(rate)
      setDemoMessages(prev => [...prev, `Rate limit set to ${rate} msg/sec`])
    }
  }, [wsService])

  const adjustHealthCheckInterval = useCallback((interval: number) => {
    if (wsService) {
      wsService.setHealthCheckInterval(interval)
      setDemoMessages(prev => [...prev, `Health check interval set to ${interval}ms`])
    }
  }, [wsService])

  const clearAll = useCallback(() => {
    if (wsService) {
      wsService.clearMessageHistory()
      resetPerformanceMetrics()
      setDemoMessages([])
      setTestResults(null)
    }
  }, [wsService, resetPerformanceMetrics])

  const emergencyCleanup = useCallback(() => {
    if (wsService) {
      wsService.emergencyCleanup()
      setDemoMessages([])
      setIsSpamming(false)
    }
  }, [wsService])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          WebSocket Performance Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Showcase of advanced WebSocket performance optimizations including message queuing,
          connection health monitoring, exponential backoff, and memory management.
        </p>
        
        <div className="flex items-center space-x-4 mb-6">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="font-medium">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {connectionQuality && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Quality:</span>
              <span className={`font-medium ${
                connectionQuality === 'excellent' ? 'text-green-500' :
                connectionQuality === 'good' ? 'text-blue-500' :
                connectionQuality === 'poor' ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {connectionQuality}
              </span>
            </div>
          )}
          
          {performanceMetrics && (
            <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
              <span>Sent: {performanceMetrics.messagesSent}</span>
              <span>Received: {performanceMetrics.messagesReceived}</span>
              <span>Latency: {Math.round(performanceMetrics.lastLatency)}ms</span>
            </div>
          )}
        </div>
      </div>

      <WebSocketPerformanceMonitor 
        webSocketService={wsService}
        className="mb-8"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Performance Controls
          </h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Message Generation
              </h3>
              <div className="flex items-center space-x-4 mb-2">
                <button
                  onClick={() => setIsSpamming(!isSpamming)}
                  className={`px-4 py-2 rounded font-medium ${
                    isSpamming
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {isSpamming ? 'Stop Messages' : 'Start Messages'}
                </button>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Rate:</span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={messageRate}
                    onChange={(e) => setMessageRate(Number(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-sm font-mono">{messageRate}/s</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Performance Tuning
              </h3>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Batch Size:</span>
                  <div className="flex space-x-2">
                    {[50, 100, 200, 500].map(size => (
                      <button
                        key={size}
                        onClick={() => adjustBatchSize(size)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Rate Limit:</span>
                  <div className="flex space-x-2">
                    {[10, 50, 100, 200].map(rate => (
                      <button
                        key={rate}
                        onClick={() => adjustRateLimit(rate)}
                        className="px-2 py-1 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded hover:bg-purple-200 dark:hover:bg-purple-800"
                      >
                        {rate}/s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Performance Tests
              </h3>
              <div className="flex space-x-3">
                <button
                  onClick={() => runPerformanceTest('quick')}
                  disabled={isRunningTest}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {isRunningTest ? 'Running...' : 'Quick Test'}
                </button>
                <button
                  onClick={() => runPerformanceTest('stress')}
                  disabled={isRunningTest}
                  className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                >
                  {isRunningTest ? 'Running...' : 'Stress Test'}
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Actions
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={forceHealthCheck}
                  className="px-3 py-1 text-sm bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded hover:bg-green-200 dark:hover:bg-green-800"
                >
                  Health Check
                </button>
                <button
                  onClick={clearAll}
                  className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800"
                >
                  Clear All
                </button>
                <button
                  onClick={emergencyCleanup}
                  className="px-3 py-1 text-sm bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
                >
                  Emergency Cleanup
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Message Log ({demoMessages.length})
            </h2>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-4 h-64 overflow-y-auto">
              <div className="space-y-1 font-mono text-xs">
                {demoMessages.length === 0 ? (
                  <div className="text-gray-500 dark:text-gray-400 italic">
                    No messages yet. Start message generation to see activity.
                  </div>
                ) : (
                  demoMessages.map((msg, idx) => (
                    <div key={idx} className="text-gray-700 dark:text-gray-300">
                      {msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {testResults && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Latest Test Results
              </h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Messages/sec</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {Math.round(testResults.results.messagesPerSecond)}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Avg Latency</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {Math.round(testResults.results.averageLatency)}ms
                  </div>
                </div>
              </div>
              
              {testResults.recommendations.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Recommendations
                  </h3>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    {testResults.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-yellow-500">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WebSocketPerformanceDemo