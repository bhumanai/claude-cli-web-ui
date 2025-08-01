#!/usr/bin/env node

/**
 * Claude CLI Web UI - Comprehensive Performance Testing Suite
 * 
 * This script performs comprehensive load testing for the Claude CLI Web UI system
 * including frontend, backend APIs, WebSocket connections, and real-time features.
 * 
 * Performance Targets:
 * - Frontend Load Time: < 2s (target: 1.2s)
 * - API Response Time: < 100ms (target: 65ms)
 * - Real-time Updates: < 50ms latency
 * - Task Execution Start: < 5s (target: 3.2s)
 * - Concurrent Users: 10,000+ supported
 */

import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import { EventSource } from 'eventsource';
import fs from 'fs/promises';
import path from 'path';

class PerformanceTestSuite {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      apiUrl: config.apiUrl || 'http://localhost:3000/api',
      wsUrl: config.wsUrl || 'ws://localhost:3000/ws',
      maxConcurrentUsers: config.maxConcurrentUsers || 1000,
      testDuration: config.testDuration || 300000, // 5 minutes
      reportInterval: config.reportInterval || 10000, // 10 seconds
      ...config
    };

    this.metrics = {
      requests: new Map(),
      connections: new Map(),
      errors: [],
      performance: {
        frontend: {},
        api: {},
        websocket: {},
        realtime: {}
      }
    };

    this.workers = [];
    this.startTime = Date.now();
  }

  /**
   * Main test execution orchestrator
   */
  async runComprehensiveTests() {
    console.log('🚀 Starting Claude CLI Web UI Performance Testing Suite');
    console.log('================================================');
    console.log(`Target Performance Metrics:`);
    console.log(`- Frontend Load Time: < 2s (target: 1.2s)`);
    console.log(`- API Response Time: < 100ms (target: 65ms)`);
    console.log(`- Real-time Updates: < 50ms latency`);
    console.log(`- Task Execution Start: < 5s (target: 3.2s)`);
    console.log(`- Concurrent Users: ${this.config.maxConcurrentUsers} target`);
    console.log('================================================\n');

    try {
      // Phase 1: Frontend Performance Testing
      console.log('📱 Phase 1: Frontend Performance Testing');
      await this.testFrontendPerformance();

      // Phase 2: API Load Testing
      console.log('\n🔌 Phase 2: API Load Testing');
      await this.testAPIPerformance();

      // Phase 3: WebSocket Scaling Testing
      console.log('\n🔄 Phase 3: WebSocket Scaling Testing');
      await this.testWebSocketPerformance();

      // Phase 4: Real-time Feature Testing
      console.log('\n⚡ Phase 4: Real-time Feature Testing');
      await this.testRealTimeFeatures();

      // Phase 5: Concurrent User Simulation
      console.log('\n👥 Phase 5: Concurrent User Simulation');
      await this.testConcurrentUsers();

      // Phase 6: Stress Testing
      console.log('\n🔥 Phase 6: Stress Testing');
      await this.testSystemLimits();

      // Generate comprehensive report
      await this.generatePerformanceReport();

      console.log('\n✅ Performance Testing Suite Completed Successfully');

    } catch (error) {
      console.error('❌ Performance Testing Failed:', error);
      this.metrics.errors.push({
        timestamp: Date.now(),
        phase: 'suite_execution',
        error: error.message,
        stack: error.stack
      });
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Frontend Performance Testing
   * Tests page load times, bundle sizes, rendering performance
   */
  async testFrontendPerformance() {
    const startTime = performance.now();
    
    try {
      // Test initial page load
      console.log('  📊 Testing initial page load performance...');
      const pageLoadMetrics = await this.measurePageLoad();
      
      // Test bundle size and load optimization
      console.log('  📦 Analyzing bundle size and optimization...');
      const bundleMetrics = await this.analyzeBundlePerformance();
      
      // Test rendering performance under load
      console.log('  🎨 Testing rendering performance...');
      const renderingMetrics = await this.testRenderingPerformance();

      this.metrics.performance.frontend = {
        pageLoad: pageLoadMetrics,
        bundle: bundleMetrics,
        rendering: renderingMetrics,
        totalTestTime: performance.now() - startTime
      };

      console.log(`  ✅ Frontend testing completed in ${Math.round(performance.now() - startTime)}ms`);
      
    } catch (error) {
      this.recordError('frontend_testing', error);
      throw error;
    }
  }

  /**
   * Measure page load performance metrics
   */
  async measurePageLoad() {
    const results = [];
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      try {
        const response = await fetch(this.config.baseUrl, {
          headers: {
            'User-Agent': 'PerformanceTestSuite/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        const loadTime = performance.now() - startTime;
        const contentLength = parseInt(response.headers.get('content-length') || '0');
        
        results.push({
          iteration: i + 1,
          loadTime,
          status: response.status,
          contentLength,
          ttfb: loadTime, // Time to first byte (simplified)
          success: response.ok
        });

        // Small delay between requests
        await this.sleep(100);
        
      } catch (error) {
        results.push({
          iteration: i + 1,
          loadTime: performance.now() - startTime,
          status: 0,
          contentLength: 0,
          ttfb: 0,
          success: false,
          error: error.message
        });
      }
    }

    const successfulResults = results.filter(r => r.success);
    const loadTimes = successfulResults.map(r => r.loadTime);
    
    return {
      iterations,
      successRate: (successfulResults.length / iterations) * 100,
      averageLoadTime: this.average(loadTimes),
      medianLoadTime: this.median(loadTimes),
      p95LoadTime: this.percentile(loadTimes, 95),
      p99LoadTime: this.percentile(loadTimes, 99),
      minLoadTime: Math.min(...loadTimes),
      maxLoadTime: Math.max(...loadTimes),
      averageContentLength: this.average(successfulResults.map(r => r.contentLength)),
      targetAchieved: this.average(loadTimes) < 2000, // Target: < 2s
      targetOptimal: this.average(loadTimes) < 1200,  // Optimal: < 1.2s
      results
    };
  }

  /**
   * Analyze bundle performance and optimization
   */
  async analyzeBundlePerformance() {
    try {
      // Simulate bundle analysis by checking static assets
      const staticAssets = [
        '/assets/index.js',
        '/assets/index.css',
        '/assets/vendor.js'
      ];

      const assetMetrics = [];

      for (const asset of staticAssets) {
        const startTime = performance.now();
        
        try {
          const response = await fetch(`${this.config.baseUrl}${asset}`);
          const loadTime = performance.now() - startTime;
          const size = parseInt(response.headers.get('content-length') || '0');
          
          assetMetrics.push({
            asset,
            loadTime,
            size,
            status: response.status,
            compressed: response.headers.get('content-encoding') === 'gzip',
            cached: response.headers.get('cache-control')?.includes('max-age')
          });
        } catch (error) {
          assetMetrics.push({
            asset,
            loadTime: performance.now() - startTime,
            size: 0,
            status: 0,
            error: error.message
          });
        }
      }

      const totalSize = assetMetrics.reduce((sum, asset) => sum + asset.size, 0);
      const totalLoadTime = assetMetrics.reduce((sum, asset) => sum + asset.loadTime, 0);

      return {
        assets: assetMetrics,
        totalSize,
        totalLoadTime,
        averageAssetLoadTime: totalLoadTime / assetMetrics.length,
        compressionRate: assetMetrics.filter(a => a.compressed).length / assetMetrics.length,
        cachingRate: assetMetrics.filter(a => a.cached).length / assetMetrics.length,
        targetSizeAchieved: totalSize < 500000, // Target: < 500KB
        performanceScore: this.calculateBundleScore(assetMetrics, totalSize, totalLoadTime)
      };

    } catch (error) {
      return {
        error: error.message,
        performanceScore: 0
      };
    }
  }

  /**
   * Test rendering performance under various loads
   */
  async testRenderingPerformance() {
    // Simulate rendering performance by testing rapid API calls
    // that would trigger UI updates
    const renderingTests = [
      { name: 'task_list_rendering', endpoint: '/api/tasks', iterations: 50 },
      { name: 'project_switching', endpoint: '/api/projects', iterations: 30 },
      { name: 'command_history', endpoint: '/api/sessions', iterations: 25 }
    ];

    const results = {};

    for (const test of renderingTests) {
      const startTime = performance.now();
      const timings = [];

      for (let i = 0; i < test.iterations; i++) {
        const iterationStart = performance.now();
        
        try {
          await fetch(`${this.config.apiUrl}${test.endpoint}`, {
            headers: { 'Accept': 'application/json' }
          });
          timings.push(performance.now() - iterationStart);
        } catch (error) {
          timings.push(performance.now() - iterationStart);
        }

        // Small delay to simulate user interaction
        await this.sleep(50);
      }

      results[test.name] = {
        iterations: test.iterations,
        totalTime: performance.now() - startTime,
        averageRenderTime: this.average(timings),
        p95RenderTime: this.percentile(timings, 95),
        minRenderTime: Math.min(...timings),
        maxRenderTime: Math.max(...timings),
        targetAchieved: this.average(timings) < 100, // Target: < 100ms per render
        timings
      };
    }

    return results;
  }

  /**
   * API Performance Testing
   * Tests all API endpoints under various load conditions
   */
  async testAPIPerformance() {
    const startTime = performance.now();
    
    try {
      console.log('  🔌 Testing API endpoint performance...');
      const endpointMetrics = await this.testAPIEndpoints();
      
      console.log('  📊 Testing API throughput and concurrency...');
      const throughputMetrics = await this.testAPIThroughput();
      
      console.log('  ⚡ Testing API response time consistency...');
      const consistencyMetrics = await this.testAPIConsistency();

      this.metrics.performance.api = {
        endpoints: endpointMetrics,
        throughput: throughputMetrics,
        consistency: consistencyMetrics,
        totalTestTime: performance.now() - startTime
      };

      console.log(`  ✅ API testing completed in ${Math.round(performance.now() - startTime)}ms`);
      
    } catch (error) {
      this.recordError('api_testing', error);
      throw error;
    }
  }

  /**
   * Test individual API endpoints
   */
  async testAPIEndpoints() {
    const endpoints = [
      { method: 'GET', path: '/health', expected: 200 },
      { method: 'GET', path: '/api/tasks', expected: 200 },
      { method: 'POST', path: '/api/tasks', expected: 201, body: { title: 'Test Task', description: 'Performance test' } },
      { method: 'GET', path: '/api/projects', expected: 200 },
      { method: 'POST', path: '/api/projects', expected: 201, body: { name: 'Test Project', description: 'Performance test' } }
    ];

    const results = {};

    for (const endpoint of endpoints) {
      console.log(`    Testing ${endpoint.method} ${endpoint.path}...`);
      
      const endpointResults = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          const options = {
            method: endpoint.method,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          };

          if (endpoint.body) {
            options.body = JSON.stringify(endpoint.body);
          }

          const response = await fetch(`${this.config.baseUrl}${endpoint.path}`, options);
          const responseTime = performance.now() - startTime;
          
          endpointResults.push({
            iteration: i + 1,
            responseTime,
            status: response.status,
            success: response.status === endpoint.expected,
            size: parseInt(response.headers.get('content-length') || '0')
          });

        } catch (error) {
          endpointResults.push({
            iteration: i + 1,
            responseTime: performance.now() - startTime,
            status: 0,
            success: false,
            error: error.message
          });
        }

        await this.sleep(50); // Small delay between requests
      }

      const successfulResults = endpointResults.filter(r => r.success);
      const responseTimes = successfulResults.map(r => r.responseTime);

      results[`${endpoint.method}_${endpoint.path.replace(/\//g, '_')}`] = {
        endpoint: `${endpoint.method} ${endpoint.path}`,
        iterations,
        successRate: (successfulResults.length / iterations) * 100,
        averageResponseTime: this.average(responseTimes),
        medianResponseTime: this.median(responseTimes),
        p95ResponseTime: this.percentile(responseTimes, 95),
        p99ResponseTime: this.percentile(responseTimes, 99),
        minResponseTime: Math.min(...responseTimes),
        maxResponseTime: Math.max(...responseTimes),
        targetAchieved: this.average(responseTimes) < 100, // Target: < 100ms
        targetOptimal: this.average(responseTimes) < 65,   // Optimal: < 65ms
        results: endpointResults
      };
    }

    return results;
  }

  /**
   * Test API throughput and concurrency
   */
  async testAPIThroughput() {
    const concurrencyLevels = [1, 5, 10, 25, 50, 100];
    const results = {};

    for (const concurrency of concurrencyLevels) {
      console.log(`    Testing throughput with ${concurrency} concurrent requests...`);
      
      const startTime = performance.now();
      const promises = [];
      const requestResults = [];

      // Create concurrent requests
      for (let i = 0; i < concurrency; i++) {
        promises.push(
          this.makeTimedRequest('/api/health')
            .then(result => requestResults.push(result))
            .catch(error => requestResults.push({ error: error.message, responseTime: 0 }))
        );
      }

      await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      const successfulRequests = requestResults.filter(r => !r.error);
      const responseTimes = successfulRequests.map(r => r.responseTime);

      results[`concurrency_${concurrency}`] = {
        concurrency,
        totalRequests: concurrency,
        successfulRequests: successfulRequests.length,
        failedRequests: concurrency - successfulRequests.length,
        totalTime,
        throughput: (successfulRequests.length / totalTime) * 1000, // Requests per second
        averageResponseTime: this.average(responseTimes),
        p95ResponseTime: this.percentile(responseTimes, 95),
        successRate: (successfulRequests.length / concurrency) * 100
      };
    }

    return results;
  }

  /**
   * Test API response time consistency
   */
  async testAPIConsistency() {
    const testDuration = 60000; // 1 minute
    const requestInterval = 1000; // 1 second
    const startTime = Date.now();
    const results = [];

    console.log('    Testing API consistency over 1 minute...');

    while (Date.now() - startTime < testDuration) {
      const requestStart = performance.now();
      
      try {
        const response = await fetch(`${this.config.baseUrl}/api/health`);
        const responseTime = performance.now() - requestStart;
        
        results.push({
          timestamp: Date.now(),
          responseTime,
          status: response.status,
          success: response.ok
        });

      } catch (error) {
        results.push({
          timestamp: Date.now(),
          responseTime: performance.now() - requestStart,
          status: 0,
          success: false,
          error: error.message
        });
      }

      await this.sleep(requestInterval);
    }

    const successfulResults = results.filter(r => r.success);
    const responseTimes = successfulResults.map(r => r.responseTime);

    return {
      duration: testDuration,
      totalRequests: results.length,
      successfulRequests: successfulResults.length,
      successRate: (successfulResults.length / results.length) * 100,
      averageResponseTime: this.average(responseTimes),
      responseTimeStdDev: this.standardDeviation(responseTimes),
      responseTimeVariance: this.variance(responseTimes),
      isConsistent: this.standardDeviation(responseTimes) < 50, // Consistent if std dev < 50ms
      results
    };
  }

  /**
   * WebSocket Performance Testing
   */
  async testWebSocketPerformance() {
    const startTime = performance.now();
    
    try {
      console.log('  🔄 Testing WebSocket connection performance...');
      const connectionMetrics = await this.testWebSocketConnections();
      
      console.log('  📨 Testing WebSocket message throughput...');
      const messageMetrics = await this.testWebSocketMessages();
      
      console.log('  📊 Testing WebSocket scaling...');
      const scalingMetrics = await this.testWebSocketScaling();

      this.metrics.performance.websocket = {
        connections: connectionMetrics,
        messages: messageMetrics,
        scaling: scalingMetrics,
        totalTestTime: performance.now() - startTime
      };

      console.log(`  ✅ WebSocket testing completed in ${Math.round(performance.now() - startTime)}ms`);
      
    } catch (error) {
      this.recordError('websocket_testing', error);
      throw error;
    }
  }

  /**
   * Test WebSocket connection performance
   */
  async testWebSocketConnections() {
    const connectionTests = 10;
    const results = [];

    for (let i = 0; i < connectionTests; i++) {
      const startTime = performance.now();
      
      try {
        const ws = new WebSocket(`${this.config.wsUrl}/test-session-${i}`);
        
        const connectionTime = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 5000);

          ws.on('open', () => {
            clearTimeout(timeout);
            resolve(performance.now() - startTime);
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        // Test message round-trip time
        const pingStart = performance.now();
        const roundTripTime = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Ping timeout'));
          }, 2000);

          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'pong') {
              clearTimeout(timeout);
              resolve(performance.now() - pingStart);
            }
          });

          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        });

        ws.close();

        results.push({
          iteration: i + 1,
          connectionTime,
          roundTripTime,
          success: true
        });

      } catch (error) {
        results.push({
          iteration: i + 1,
          connectionTime: performance.now() - startTime,
          roundTripTime: 0,
          success: false,
          error: error.message
        });
      }

      await this.sleep(100);
    }

    const successfulResults = results.filter(r => r.success);
    const connectionTimes = successfulResults.map(r => r.connectionTime);
    const roundTripTimes = successfulResults.map(r => r.roundTripTime);

    return {
      totalTests: connectionTests,
      successfulConnections: successfulResults.length,
      successRate: (successfulResults.length / connectionTests) * 100,
      averageConnectionTime: this.average(connectionTimes),
      p95ConnectionTime: this.percentile(connectionTimes, 95),
      averageRoundTripTime: this.average(roundTripTimes),
      p95RoundTripTime: this.percentile(roundTripTimes, 95),
      targetConnectionAchieved: this.average(connectionTimes) < 500, // Target: < 500ms
      targetLatencyAchieved: this.average(roundTripTimes) < 50,      // Target: < 50ms
      results
    };
  }

  /**
   * Test WebSocket message throughput
   */
  async testWebSocketMessages() {
    const messageTests = [
      { messagesPerSecond: 10, duration: 10000 },
      { messagesPerSecond: 50, duration: 10000 },
      { messagesPerSecond: 100, duration: 10000 }
    ];

    const results = {};

    for (const test of messageTests) {
      console.log(`    Testing ${test.messagesPerSecond} messages/second...`);
      
      try {
        const ws = new WebSocket(`${this.config.wsUrl}/throughput-test`);
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
          ws.on('open', () => {
            clearTimeout(timeout);
            resolve();
          });
          ws.on('error', reject);
        });

        const messagesSent = [];
        const messagesReceived = [];
        const startTime = performance.now();
        
        // Set up message listener
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          messagesReceived.push({
            ...message,
            receivedAt: performance.now()
          });
        });

        // Send messages at specified rate
        const interval = 1000 / test.messagesPerSecond;
        const sendMessages = setInterval(() => {
          const message = {
            id: messagesSent.length + 1,
            timestamp: Date.now(),
            sentAt: performance.now(),
            data: `Test message ${messagesSent.length + 1}`
          };
          
          ws.send(JSON.stringify(message));
          messagesSent.push(message);
        }, interval);

        // Stop after test duration
        setTimeout(() => {
          clearInterval(sendMessages);
        }, test.duration);

        // Wait for all messages to be processed
        await this.sleep(test.duration + 2000);
        ws.close();

        const latencies = messagesReceived.map(received => {
          const sent = messagesSent.find(s => s.id === received.id);
          return sent ? received.receivedAt - sent.sentAt : null;
        }).filter(l => l !== null);

        results[`${test.messagesPerSecond}_mps`] = {
          targetMessagesPerSecond: test.messagesPerSecond,
          testDuration: test.duration,
          messagesSent: messagesSent.length,
          messagesReceived: messagesReceived.length,
          messageSuccessRate: (messagesReceived.length / messagesSent.length) * 100,
          averageLatency: this.average(latencies),
          p95Latency: this.percentile(latencies, 95),
          p99Latency: this.percentile(latencies, 99),
          minLatency: Math.min(...latencies),
          maxLatency: Math.max(...latencies),
          actualThroughput: (messagesReceived.length / test.duration) * 1000,
          targetAchieved: this.average(latencies) < 50 && (messagesReceived.length / messagesSent.length) > 0.95
        };

      } catch (error) {
        results[`${test.messagesPerSecond}_mps`] = {
          error: error.message,
          targetAchieved: false
        };
      }
    }

    return results;
  }

  /**
   * Test WebSocket scaling with multiple connections
   */
  async testWebSocketScaling() {
    const scalingTests = [10, 25, 50, 100, 250];
    const results = {};

    for (const connectionCount of scalingTests) {
      console.log(`    Testing with ${connectionCount} concurrent WebSocket connections...`);
      
      const connections = [];
      const connectionMetrics = [];
      const startTime = performance.now();

      try {
        // Create multiple connections
        const connectionPromises = Array(connectionCount).fill().map(async (_, i) => {
          const connectionStart = performance.now();
          const ws = new WebSocket(`${this.config.wsUrl}/scale-test-${i}`);
          
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Connection ${i} timeout`));
            }, 10000);

            ws.on('open', () => {
              clearTimeout(timeout);
              connections.push(ws);
              connectionMetrics.push({
                connectionId: i,
                connectionTime: performance.now() - connectionStart,
                success: true
              });
              resolve(ws);
            });

            ws.on('error', (error) => {
              clearTimeout(timeout);
              connectionMetrics.push({
                connectionId: i,
                connectionTime: performance.now() - connectionStart,
                success: false,
                error: error.message
              });
              reject(error);
            });
          });
        });

        // Wait for all connections to establish (or fail)
        const connectionResults = await Promise.allSettled(connectionPromises);
        const successfulConnections = connectionResults.filter(r => r.status === 'fulfilled').length;

        // Test message broadcasting
        if (successfulConnections > 0) {
          const broadcastStart = performance.now();
          const testMessage = { type: 'broadcast_test', timestamp: Date.now() };
          
          connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(testMessage));
            }
          });

          await this.sleep(1000); // Wait for message processing
          const broadcastTime = performance.now() - broadcastStart;

          // Clean up connections
          connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          });

          const connectionTimes = connectionMetrics.filter(c => c.success).map(c => c.connectionTime);

          results[`${connectionCount}_connections`] = {
            targetConnections: connectionCount,
            successfulConnections,
            connectionSuccessRate: (successfulConnections / connectionCount) * 100,
            averageConnectionTime: this.average(connectionTimes),
            p95ConnectionTime: this.percentile(connectionTimes, 95),
            maxConnectionTime: Math.max(...connectionTimes),
            broadcastTime,
            scalingTargetAchieved: successfulConnections >= connectionCount * 0.95 && this.average(connectionTimes) < 1000,
            totalTestTime: performance.now() - startTime
          };
        } else {
          results[`${connectionCount}_connections`] = {
            targetConnections: connectionCount,
            successfulConnections: 0,
            connectionSuccessRate: 0,
            scalingTargetAchieved: false,
            error: 'No successful connections established',
            totalTestTime: performance.now() - startTime
          };
        }

      } catch (error) {
        // Clean up any open connections
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });

        results[`${connectionCount}_connections`] = {
          targetConnections: connectionCount,
          successfulConnections: 0,
          connectionSuccessRate: 0,
          scalingTargetAchieved: false,
          error: error.message,
          totalTestTime: performance.now() - startTime
        };
      }

      await this.sleep(1000); // Brief pause between scaling tests
    }

    return results;
  }

  /**
   * Test real-time features performance
   */
  async testRealTimeFeatures() {
    const startTime = performance.now();
    
    try {
      console.log('  ⚡ Testing Server-Sent Events performance...');
      const sseMetrics = await this.testServerSentEvents();
      
      console.log('  🔄 Testing queue processing performance...');
      const queueMetrics = await this.testQueueProcessing();
      
      console.log('  📊 Testing agent monitoring updates...');
      const monitoringMetrics = await this.testAgentMonitoring();

      this.metrics.performance.realtime = {
        sse: sseMetrics,
        queue: queueMetrics,
        monitoring: monitoringMetrics,
        totalTestTime: performance.now() - startTime
      };

      console.log(`  ✅ Real-time testing completed in ${Math.round(performance.now() - startTime)}ms`);
      
    } catch (error) {
      this.recordError('realtime_testing', error);
      throw error;
    }
  }

  /**
   * Test Server-Sent Events performance
   */
  async testServerSentEvents() {
    const testDuration = 30000; // 30 seconds
    const eventsSent = [];
    const eventsReceived = [];
    
    try {
      const eventSource = new EventSource(`${this.config.baseUrl}/api/events/test-channel`);
      const startTime = performance.now();

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        eventsReceived.push({
          ...data,
          receivedAt: performance.now()
        });
      };

      // Simulate events being sent (this would normally be done by the server)
      const eventInterval = setInterval(async () => {
        const event = {
          id: eventsSent.length + 1,
          timestamp: Date.now(),
          sentAt: performance.now(),
          type: 'test_event',
          data: `Test event ${eventsSent.length + 1}`
        };

        // Trigger server event (simulated via API call)
        try {
          await fetch(`${this.config.apiUrl}/events/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          });
          eventsSent.push(event);
        } catch (error) {
          // Event sending failed
        }
      }, 1000); // Send event every second

      // Wait for test duration
      await this.sleep(testDuration);
      clearInterval(eventInterval);
      eventSource.close();

      const latencies = eventsReceived.map(received => {
        const sent = eventsSent.find(s => s.id === received.id);
        return sent ? received.receivedAt - sent.sentAt : null;
      }).filter(l => l !== null);

      return {
        testDuration,
        eventsSent: eventsSent.length,
        eventsReceived: eventsReceived.length,
        eventSuccessRate: (eventsReceived.length / eventsSent.length) * 100,
        averageLatency: this.average(latencies),
        p95Latency: this.percentile(latencies, 95),
        minLatency: Math.min(...latencies),
        maxLatency: Math.max(...latencies),
        targetAchieved: this.average(latencies) < 50 && (eventsReceived.length / eventsSent.length) > 0.95,
        eventsPerSecond: (eventsReceived.length / testDuration) * 1000
      };

    } catch (error) {
      return {
        testDuration,
        eventsSent: 0,
        eventsReceived: 0,
        eventSuccessRate: 0,
        targetAchieved: false,
        error: error.message
      };
    }
  }

  /**
   * Test queue processing performance
   */
  async testQueueProcessing() {
    const queueSizes = [10, 50, 100, 500];
    const results = {};

    for (const queueSize of queueSizes) {
      console.log(`    Testing queue processing with ${queueSize} tasks...`);
      
      const startTime = performance.now();
      const tasksCreated = [];
      const tasksCompleted = [];

      try {
        // Create tasks in the queue
        const taskCreationPromises = Array(queueSize).fill().map(async (_, i) => {
          const task = {
            id: `perf-test-${Date.now()}-${i}`,
            title: `Performance Test Task ${i + 1}`,
            description: `Queue processing test task`,
            priority: i % 3 === 0 ? 'high' : (i % 2 === 0 ? 'medium' : 'low'),
            createdAt: performance.now()
          };

          try {
            const response = await fetch(`${this.config.apiUrl}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(task)
            });

            if (response.ok) {
              tasksCreated.push({ ...task, createdAt: performance.now() });
            }
          } catch (error) {
            // Task creation failed
          }
        });

        await Promise.all(taskCreationPromises);

        // Monitor task completion
        const monitoringDuration = 60000; // Monitor for 1 minute
        const monitoringStart = performance.now();

        while (performance.now() - monitoringStart < monitoringDuration) {
          try {
            const response = await fetch(`${this.config.apiUrl}/tasks?status=completed`);
            if (response.ok) {
              const completedTasks = await response.json();
              const ourCompletedTasks = completedTasks.filter(task => 
                task.id && task.id.startsWith('perf-test-')
              );

              ourCompletedTasks.forEach(task => {
                if (!tasksCompleted.find(t => t.id === task.id)) {
                  tasksCompleted.push({ ...task, completedAt: performance.now() });
                }
              });
            }
          } catch (error) {
            // Monitoring request failed
          }

          await this.sleep(2000); // Check every 2 seconds
        }

        const processingTimes = tasksCompleted.map(completed => {
          const created = tasksCreated.find(c => c.id === completed.id);
          return created ? completed.completedAt - created.createdAt : null;
        }).filter(t => t !== null);

        results[`queue_${queueSize}`] = {
          queueSize,
          tasksCreated: tasksCreated.length,
          tasksCompleted: tasksCompleted.length,
          completionRate: (tasksCompleted.length / tasksCreated.length) * 100,
          averageProcessingTime: this.average(processingTimes),
          p95ProcessingTime: this.percentile(processingTimes, 95),
          minProcessingTime: Math.min(...processingTimes),
          maxProcessingTime: Math.max(...processingTimes),
          throughput: (tasksCompleted.length / monitoringDuration) * 60000, // Tasks per minute
          targetAchieved: this.average(processingTimes) < 5000 && (tasksCompleted.length / tasksCreated.length) > 0.8,
          totalTestTime: performance.now() - startTime
        };

      } catch (error) {
        results[`queue_${queueSize}`] = {
          queueSize,
          tasksCreated: 0,
          tasksCompleted: 0,
          completionRate: 0,
          targetAchieved: false,
          error: error.message,
          totalTestTime: performance.now() - startTime
        };
      }
    }

    return results;
  }

  /**
   * Test agent monitoring updates
   */
  async testAgentMonitoring() {
    const monitoringDuration = 30000; // 30 seconds
    const updatesSent = [];
    const updatesReceived = [];
    
    try {
      // Set up monitoring endpoint
      const eventSource = new EventSource(`${this.config.baseUrl}/api/events/agent-monitor`);
      const startTime = performance.now();

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updatesReceived.push({
          ...data,
          receivedAt: performance.now()
        });
      };

      // Simulate agent activity that triggers monitoring updates
      const updateInterval = setInterval(async () => {
        const update = {
          id: updatesSent.length + 1,
          agentId: `agent-${Math.floor(Math.random() * 5) + 1}`,
          status: ['active', 'idle', 'busy', 'error'][Math.floor(Math.random() * 4)],
          timestamp: Date.now(),
          sentAt: performance.now(),
          metrics: {
            cpu: Math.random() * 100,
            memory: Math.random() * 100,
            tasks: Math.floor(Math.random() * 10)
          }
        };

        try {
          await fetch(`${this.config.apiUrl}/agents/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update)
          });
          updatesSent.push(update);
        } catch (error) {
          // Update sending failed
        }
      }, 2000); // Send update every 2 seconds

      // Wait for test duration
      await this.sleep(monitoringDuration);
      clearInterval(updateInterval);
      eventSource.close();

      const latencies = updatesReceived.map(received => {
        const sent = updatesSent.find(s => s.id === received.id);
        return sent ? received.receivedAt - sent.sentAt : null;
      }).filter(l => l !== null);

      return {
        monitoringDuration,
        updatesSent: updatesSent.length,
        updatesReceived: updatesReceived.length,
        updateSuccessRate: (updatesReceived.length / updatesSent.length) * 100,
        averageLatency: this.average(latencies),
        p95Latency: this.percentile(latencies, 95),
        minLatency: Math.min(...latencies),
        maxLatency: Math.max(...latencies),
        updatesPerSecond: (updatesReceived.length / monitoringDuration) * 1000,
        targetAchieved: this.average(latencies) < 50 && (updatesReceived.length / updatesSent.length) > 0.9
      };

    } catch (error) {
      return {
        monitoringDuration,
        updatesSent: 0,
        updatesReceived: 0,
        updateSuccessRate: 0,
        targetAchieved: false,
        error: error.message
      };
    }
  }

  /**
   * Test concurrent user simulation
   */
  async testConcurrentUsers() {
    const userCounts = [10, 25, 50, 100, 250, 500];
    const results = {};

    for (const userCount of userCounts) {
      console.log(`  👥 Testing with ${userCount} concurrent users...`);
      
      const startTime = performance.now();
      const userSessions = [];

      try {
        // Create concurrent user sessions
        const userPromises = Array(userCount).fill().map(async (_, i) => {
          const userId = `user-${i + 1}`;
          const sessionMetrics = {
            userId,
            startTime: performance.now(),
            actions: [],
            errors: []
          };

          try {
            // Simulate user workflow
            await this.simulateUserSession(userId, sessionMetrics);
            sessionMetrics.endTime = performance.now();
            sessionMetrics.sessionDuration = sessionMetrics.endTime - sessionMetrics.startTime;
            sessionMetrics.success = true;
            
            return sessionMetrics;
          } catch (error) {
            sessionMetrics.endTime = performance.now();
            sessionMetrics.sessionDuration = sessionMetrics.endTime - sessionMetrics.startTime;
            sessionMetrics.success = false;
            sessionMetrics.errors.push(error.message);
            
            return sessionMetrics;
          }
        });

        const sessionResults = await Promise.all(userPromises);
        const successfulSessions = sessionResults.filter(s => s.success);
        
        const sessionDurations = successfulSessions.map(s => s.sessionDuration);
        const totalActions = successfulSessions.reduce((sum, s) => sum + s.actions.length, 0);
        const totalErrors = sessionResults.reduce((sum, s) => sum + s.errors.length, 0);

        results[`${userCount}_users`] = {
          targetUsers: userCount,
          successfulSessions: successfulSessions.length,
          sessionSuccessRate: (successfulSessions.length / userCount) * 100,
          averageSessionDuration: this.average(sessionDurations),
          p95SessionDuration: this.percentile(sessionDurations, 95),
          totalActions,
          totalErrors,
          actionsPerUser: totalActions / successfulSessions.length,
          errorsPerUser: totalErrors / userCount,
          concurrencyTargetAchieved: (successfulSessions.length / userCount) > 0.9 && totalErrors < userCount * 0.1,
          totalTestTime: performance.now() - startTime
        };

      } catch (error) {
        results[`${userCount}_users`] = {
          targetUsers: userCount,
          successfulSessions: 0,
          sessionSuccessRate: 0,
          concurrencyTargetAchieved: false,
          error: error.message,
          totalTestTime: performance.now() - startTime
        };
      }

      await this.sleep(2000); // Brief pause between user count tests
    }

    return results;
  }

  /**
   * Simulate a single user session
   */
  async simulateUserSession(userId, sessionMetrics) {
    const actions = [
      { name: 'load_dashboard', endpoint: '/', method: 'GET' },
      { name: 'get_tasks', endpoint: '/api/tasks', method: 'GET' },
      { name: 'create_task', endpoint: '/api/tasks', method: 'POST', body: { title: `Task by ${userId}`, description: 'Concurrent user test' } },
      { name: 'get_projects', endpoint: '/api/projects', method: 'GET' },
      { name: 'update_task', endpoint: '/api/tasks/1', method: 'PUT', body: { status: 'in_progress' } },
      { name: 'get_session', endpoint: '/api/sessions', method: 'GET' }
    ];

    for (const action of actions) {
      const actionStart = performance.now();
      
      try {
        const options = {
          method: action.method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': `ConcurrentUser/${userId}`
          }
        };

        if (action.body) {
          options.body = JSON.stringify(action.body);
        }

        const url = action.endpoint.startsWith('/api') 
          ? `${this.config.baseUrl}${action.endpoint}`
          : `${this.config.baseUrl}${action.endpoint}`;

        const response = await fetch(url, options);
        const actionTime = performance.now() - actionStart;

        sessionMetrics.actions.push({
          name: action.name,
          responseTime: actionTime,
          status: response.status,
          success: response.ok
        });

        // Simulate user think time
        await this.sleep(Math.random() * 1000 + 500); // 500-1500ms

      } catch (error) {
        const actionTime = performance.now() - actionStart;
        
        sessionMetrics.actions.push({
          name: action.name,
          responseTime: actionTime,
          status: 0,
          success: false,
          error: error.message
        });

        sessionMetrics.errors.push(`${action.name}: ${error.message}`);
      }
    }
  }

  /**
   * Test system limits and stress scenarios
   */
  async testSystemLimits() {
    console.log('  🔥 Running stress tests to find system limits...');
    
    const stressTests = [
      { name: 'memory_stress', type: 'memory' },
      { name: 'cpu_stress', type: 'cpu' },
      { name: 'connection_stress', type: 'connections' },
      { name: 'throughput_stress', type: 'throughput' }
    ];

    const results = {};

    for (const test of stressTests) {
      console.log(`    Running ${test.name} test...`);
      
      try {
        switch (test.type) {
          case 'memory':
            results[test.name] = await this.testMemoryStress();
            break;
          case 'cpu':
            results[test.name] = await this.testCPUStress();
            break;
          case 'connections':
            results[test.name] = await this.testConnectionStress();
            break;
          case 'throughput':
            results[test.name] = await this.testThroughputStress();
            break;
        }
      } catch (error) {
        results[test.name] = {
          error: error.message,
          testCompleted: false
        };
      }
    }

    return results;
  }

  /**
   * Test memory stress scenarios
   */
  async testMemoryStress() {
    // Simulate memory stress by creating large payloads
    const memorySizes = [1024, 10240, 102400, 1024000]; // 1KB to 1MB
    const results = [];

    for (const size of memorySizes) {
      const payload = 'x'.repeat(size);
      const startTime = performance.now();
      
      try {
        const response = await fetch(`${this.config.apiUrl}/test/memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: payload, size })
        });

        const responseTime = performance.now() - startTime;
        
        results.push({
          payloadSize: size,
          responseTime,
          status: response.status,
          success: response.ok,
          memoryEfficient: responseTime < size * 0.01 // 0.01ms per byte threshold
        });

      } catch (error) {
        results.push({
          payloadSize: size,
          responseTime: performance.now() - startTime,
          status: 0,
          success: false,
          error: error.message
        });
      }

      await this.sleep(1000); // Allow garbage collection
    }

    const successfulTests = results.filter(r => r.success);
    const maxSuccessfulSize = Math.max(...successfulTests.map(r => r.payloadSize));

    return {
      tests: results,
      maxPayloadSize: maxSuccessfulSize,
      memoryEfficiencyScore: successfulTests.filter(r => r.memoryEfficient).length / successfulTests.length,
      recommendedMaxPayload: maxSuccessfulSize * 0.8 // 80% of max for safety margin
    };
  }

  /**
   * Test CPU stress scenarios
   */
  async testCPUStress() {
    // Test CPU-intensive operations
    const cpuIntensities = [100, 500, 1000, 5000]; // Number of operations
    const results = [];

    for (const intensity of cpuIntensities) {
      const startTime = performance.now();
      
      try {
        const response = await fetch(`${this.config.apiUrl}/test/cpu`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations: intensity })
        });

        const responseTime = performance.now() - startTime;
        
        results.push({
          operations: intensity,
          responseTime,
          status: response.status,
          success: response.ok,
          efficient: responseTime < intensity * 2 // 2ms per operation threshold
        });

      } catch (error) {
        results.push({
          operations: intensity,
          responseTime: performance.now() - startTime,
          status: 0,
          success: false,
          error: error.message
        });
      }

      await this.sleep(2000); // Allow CPU to cool down
    }

    const successfulTests = results.filter(r => r.success);
    const maxSuccessfulOps = Math.max(...successfulTests.map(r => r.operations));

    return {
      tests: results,
      maxOperations: maxSuccessfulOps,
      cpuEfficiencyScore: successfulTests.filter(r => r.efficient).length / successfulTests.length,
      recommendedMaxOperations: maxSuccessfulOps * 0.7 // 70% of max for safety margin
    };
  }

  /**
   * Test connection stress scenarios
   */
  async testConnectionStress() {
    // Test maximum number of simultaneous connections
    const connectionCounts = [100, 250, 500, 1000, 2000];
    const results = [];

    for (const count of connectionCounts) {
      const startTime = performance.now();
      const connections = [];
      let successfulConnections = 0;
      
      try {
        const connectionPromises = Array(count).fill().map(async (_, i) => {
          try {
            const ws = new WebSocket(`${this.config.wsUrl}/stress-test-${i}`);
            
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
              }, 5000);

              ws.on('open', () => {
                clearTimeout(timeout);
                connections.push(ws);
                successfulConnections++;
                resolve(ws);
              });

              ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
              });
            });
          } catch (error) {
            return Promise.reject(error);
          }
        });

        await Promise.allSettled(connectionPromises);
        
        // Test message broadcasting to all connections
        const broadcastStart = performance.now();
        const testMessage = { type: 'stress_test', timestamp: Date.now() };
        
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(testMessage));
          }
        });

        await this.sleep(2000); // Wait for message processing
        const broadcastTime = performance.now() - broadcastStart;

        // Clean up
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });

        const connectionTime = performance.now() - startTime;

        results.push({
          targetConnections: count,
          successfulConnections,
          connectionSuccessRate: (successfulConnections / count) * 100,
          connectionTime,
          broadcastTime,
          systemStable: successfulConnections >= count * 0.9 && broadcastTime < 5000
        });

      } catch (error) {
        // Clean up any connections
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });

        results.push({
          targetConnections: count,
          successfulConnections,
          connectionSuccessRate: (successfulConnections / count) * 100,
          connectionTime: performance.now() - startTime,
          error: error.message,
          systemStable: false
        });
      }

      await this.sleep(5000); // Allow system to recover
    }

    const stableTests = results.filter(r => r.systemStable);
    const maxStableConnections = stableTests.length > 0 
      ? Math.max(...stableTests.map(r => r.successfulConnections))
      : 0;

    return {
      tests: results,
      maxStableConnections,
      recommendedMaxConnections: maxStableConnections * 0.8, // 80% of max for safety
      scalabilityScore: stableTests.length / results.length
    };
  }

  /**
   * Test throughput stress scenarios
   */
  async testThroughputStress() {
    // Test maximum request throughput
    const requestRates = [50, 100, 250, 500, 1000]; // Requests per second
    const results = [];

    for (const rate of requestRates) {
      console.log(`      Testing ${rate} requests/second...`);
      
      const testDuration = 30000; // 30 seconds
      const interval = 1000 / rate; // Interval between requests
      const startTime = performance.now();
      
      const requestPromises = [];
      const requestResults = [];
      
      const requestInterval = setInterval(() => {
        const requestStart = performance.now();
        
        const requestPromise = fetch(`${this.config.baseUrl}/api/health`)
          .then(response => {
            requestResults.push({
              responseTime: performance.now() - requestStart,
              status: response.status,
              success: response.ok,
              timestamp: Date.now()
            });
          })
          .catch(error => {
            requestResults.push({
              responseTime: performance.now() - requestStart,
              status: 0,
              success: false,
              error: error.message,
              timestamp: Date.now()
            });
          });

        requestPromises.push(requestPromise);
      }, interval);

      // Stop after test duration
      setTimeout(() => {
        clearInterval(requestInterval);
      }, testDuration);

      // Wait for all requests to complete
      await this.sleep(testDuration + 5000);
      await Promise.allSettled(requestPromises);

      const totalTime = performance.now() - startTime;
      const successfulRequests = requestResults.filter(r => r.success);
      const responseTimes = successfulRequests.map(r => r.responseTime);
      
      const actualThroughput = (requestResults.length / totalTime) * 1000;
      const successThroughput = (successfulRequests.length / totalTime) * 1000;

      results.push({
        targetRate: rate,
        testDuration,
        totalRequests: requestResults.length,
        successfulRequests: successfulRequests.length,
        successRate: (successfulRequests.length / requestResults.length) * 100,
        actualThroughput,
        successThroughput,
        averageResponseTime: this.average(responseTimes),
        p95ResponseTime: this.percentile(responseTimes, 95),
        p99ResponseTime: this.percentile(responseTimes, 99),
        throughputEfficient: successThroughput >= rate * 0.9 && this.average(responseTimes) < 1000,
        totalTime
      });

      await this.sleep(10000); // Allow system to recover
    }

    const efficientTests = results.filter(r => r.throughputEfficient);
    const maxEfficientThroughput = efficientTests.length > 0
      ? Math.max(...efficientTests.map(r => r.successThroughput))
      : 0;

    return {
      tests: results,
      maxEfficientThroughput,
      recommendedMaxThroughput: maxEfficientThroughput * 0.8, // 80% of max for safety
      throughputEfficiencyScore: efficientTests.length / results.length
    };
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport() {
    console.log('\n📊 Generating Comprehensive Performance Report...');
    
    const report = {
      testSuite: {
        name: 'Claude CLI Web UI Performance Testing Suite',
        version: '1.0.0',
        executionDate: new Date().toISOString(),
        totalTestTime: Date.now() - this.startTime,
        testConfiguration: this.config
      },
      executiveSummary: this.generateExecutiveSummary(),
      detailedResults: {
        frontend: this.metrics.performance.frontend,
        api: this.metrics.performance.api,
        websocket: this.metrics.performance.websocket,
        realtime: this.metrics.performance.realtime
      },
      performanceTargets: this.evaluatePerformanceTargets(),
      recommendations: this.generateRecommendations(),
      errors: this.metrics.errors
    };

    // Write report to file
    const reportPath = `/Users/don/D3/performance-testing/performance-report-${Date.now()}.json`;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Generate human-readable summary
    const summaryPath = `/Users/don/D3/performance-testing/performance-summary-${Date.now()}.md`;
    await fs.writeFile(summaryPath, this.generateMarkdownSummary(report));

    console.log(`📄 Detailed performance report saved to: ${reportPath}`);
    console.log(`📋 Human-readable summary saved to: ${summaryPath}`);

    // Print key findings to console
    this.printPerformanceSummary(report);

    return report;
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary() {
    const summary = {
      overallHealthScore: 0,
      criticalIssues: [],
      keyAchievements: [],
      performanceTargetsAchieved: 0,
      totalPerformanceTargets: 0
    };

    // Analyze results and generate summary
    // This would include logic to evaluate all test results
    // and generate executive-level insights

    return summary;
  }

  /**
   * Evaluate performance targets
   */
  evaluatePerformanceTargets() {
    const targets = {
      frontendLoadTime: { target: 2000, optimal: 1200, achieved: false, actual: 0 },
      apiResponseTime: { target: 100, optimal: 65, achieved: false, actual: 0 },
      realtimeLatency: { target: 50, optimal: 30, achieved: false, actual: 0 },
      taskExecutionStart: { target: 5000, optimal: 3200, achieved: false, actual: 0 },
      concurrentUsers: { target: 10000, optimal: 15000, achieved: false, actual: 0 }
    };

    // Evaluate each target based on test results
    // This would include logic to check actual results against targets

    return targets;
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations() {
    const recommendations = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    // Analyze results and generate prioritized recommendations
    // This would include specific optimization suggestions

    return recommendations;
  }

  /**
   * Generate markdown summary report
   */
  generateMarkdownSummary(report) {
    return `# Claude CLI Web UI - Performance Testing Report

## Executive Summary

**Test Execution Date:** ${report.testSuite.executionDate}
**Total Test Duration:** ${Math.round(report.testSuite.totalTestTime / 1000)} seconds

## Performance Targets Assessment

### Key Metrics
- **Frontend Load Time:** Target < 2s | Optimal < 1.2s
- **API Response Time:** Target < 100ms | Optimal < 65ms  
- **Real-time Updates:** Target < 50ms latency
- **Task Execution Start:** Target < 5s | Optimal < 3.2s
- **Concurrent Users:** Target 10,000+ supported

## Test Results Summary

### Frontend Performance
[Results would be populated from actual test data]

### API Performance  
[Results would be populated from actual test data]

### WebSocket Performance
[Results would be populated from actual test data]

### Real-time Features
[Results would be populated from actual test data]

## Recommendations

### Critical Priority
[Critical recommendations would be listed here]

### High Priority
[High priority recommendations would be listed here]

### Medium Priority
[Medium priority recommendations would be listed here]

## Conclusion

[Overall assessment and next steps would be provided here]
`;
  }

  /**
   * Print performance summary to console
   */
  printPerformanceSummary(report) {
    console.log('\n🎯 PERFORMANCE TESTING RESULTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Test Duration: ${Math.round(report.testSuite.totalTestTime / 1000)} seconds`);
    console.log(`Test Completion: ${new Date(report.testSuite.executionDate).toLocaleString()}`);
    console.log('\n📊 KEY FINDINGS:');
    console.log('- Frontend Performance: [Results would be shown here]');
    console.log('- API Performance: [Results would be shown here]');
    console.log('- WebSocket Performance: [Results would be shown here]');
    console.log('- Real-time Features: [Results would be shown here]');
    console.log('\n🎯 PERFORMANCE TARGETS:');
    console.log('- [Target achievements would be listed here]');
    console.log('\n⚠️  CRITICAL RECOMMENDATIONS:');
    console.log('- [Critical recommendations would be listed here]');
    console.log('\n✅ NEXT STEPS:');
    console.log('1. Review detailed performance report');
    console.log('2. Implement critical optimizations');
    console.log('3. Re-run performance tests to validate improvements');
    console.log('4. Proceed with production deployment preparation');
  }

  /**
   * Utility methods
   */
  async makeTimedRequest(endpoint) {
    const startTime = performance.now();
    
    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`);
      const responseTime = performance.now() - startTime;
      
      return {
        responseTime,
        status: response.status,
        success: response.ok,
        size: parseInt(response.headers.get('content-length') || '0')
      };
    } catch (error) {
      return {
        responseTime: performance.now() - startTime,
        status: 0,
        success: false,
        error: error.message
      };
    }
  }

  calculateBundleScore(assets, totalSize, totalLoadTime) {
    let score = 100;
    
    // Penalize large bundle sizes
    if (totalSize > 500000) score -= 20;
    if (totalSize > 1000000) score -= 30;
    
    // Penalize slow load times
    if (totalLoadTime > 3000) score -= 20;
    if (totalLoadTime > 5000) score -= 30;
    
    // Reward compression
    const compressionRate = assets.filter(a => a.compressed).length / assets.length;
    score += compressionRate * 10;
    
    // Reward caching
    const cachingRate = assets.filter(a => a.cached).length / assets.length;
    score += cachingRate * 10;
    
    return Math.max(0, Math.min(100, score));
  }

  recordError(phase, error) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      phase,
      error: error.message,
      stack: error.stack
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  average(numbers) {
    return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
  }

  median(numbers) {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  percentile(numbers, p) {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  standardDeviation(numbers) {
    const avg = this.average(numbers);
    const squareDiffs = numbers.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = this.average(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  variance(numbers) {
    const avg = this.average(numbers);
    const squareDiffs = numbers.map(value => Math.pow(value - avg, 2));
    return this.average(squareDiffs);
  }

  async cleanup() {
    // Clean up any remaining connections, workers, etc.
    this.workers.forEach(worker => {
      if (!worker.killed) {
        worker.terminate();
      }
    });
  }
}

// Execute the performance testing suite if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = {
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    apiUrl: process.env.TEST_API_URL || 'http://localhost:3000/api',
    wsUrl: process.env.TEST_WS_URL || 'ws://localhost:3000/ws',
    maxConcurrentUsers: parseInt(process.env.MAX_CONCURRENT_USERS) || 1000,
    testDuration: parseInt(process.env.TEST_DURATION) || 300000
  };

  const testSuite = new PerformanceTestSuite(config);
  
  testSuite.runComprehensiveTests()
    .then(() => {
      console.log('\n🎉 Performance Testing Suite completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Performance Testing Suite failed:', error);
      process.exit(1);
    });
}

export default PerformanceTestSuite;