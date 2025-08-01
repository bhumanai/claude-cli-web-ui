# Log Analysis Agent

## Purpose
Analyze system logs from frontend, backend, and browser automation to identify errors, anomalies, and performance issues during agentic testing.

## Core Capabilities

### 1. Multi-Source Log Correlation
- Aggregate logs from frontend (console), backend (application), and browser automation
- Correlate events across different system components using timestamps and correlation IDs
- Track user actions through the entire system stack
- Identify cascading failures and root causes

### 2. Error Pattern Detection
- Identify JavaScript errors, API failures, and system exceptions
- Detect performance anomalies and bottlenecks
- Recognize unusual patterns in user behavior flows
- Flag security-related events and access violations

### 3. Anomaly Analysis
- Compare current behavior against expected patterns
- Identify deviations from normal system performance
- Detect memory leaks, connection issues, and resource exhaustion
- Recognize data inconsistencies and state corruption

## Agent Implementation

### Log Sources Configuration
```javascript
const LogSources = {
  frontend: {
    console_logs: {
      path: "browser_console",
      types: ["error", "warning", "log", "info"],  
      correlation_field: "timestamp"
    },
    network_logs: {
      path: "browser_network",
      types: ["xhr", "fetch", "websocket"],
      correlation_field: "request_id"
    }
  },
  backend: {
    application_logs: {
      path: "/var/log/app/",
      types: ["error", "warning", "info", "debug"],
      correlation_field: "correlation_id"
    },
    access_logs: {
      path: "/var/log/nginx/",
      types: ["access", "error"],
      correlation_field: "request_id"
    }
  },
  database: {
    query_logs: {
      path: "/var/log/postgres/",
      types: ["slow_query", "error", "connection"],
      correlation_field: "session_id"
    }
  }
}
```

### Error Classification System
```javascript
const ErrorClassification = {
  critical: {
    patterns: [
      /500 Internal Server Error/,
      /Database connection failed/,
      /Authentication system down/,
      /Critical security violation/
    ],
    impact: "system_unavailable",
    priority: "P0"
  },
  high: {
    patterns: [
      /404 Not Found/,
      /Validation failed/,
      /Payment processing error/,
      /Data corruption detected/
    ],
    impact: "feature_broken",
    priority: "P1"
  },
  medium: {
    patterns: [
      /Timeout occurred/,
      /Rate limit exceeded/,
      /Cache miss/,
      /Performance degradation/
    ],
    impact: "performance_degraded",
    priority: "P2"
  },
  low: {
    patterns: [
      /Deprecated API used/,
      /Minor validation warning/,
      /Cosmetic UI issue/,
      /Non-critical resource missing/
    ],
    impact: "minor_issue",
    priority: "P3"
  }
}
```

### Log Analysis Engine
```javascript
class LogAnalysisEngine {
  async analyzeTestSession(sessionId, timeWindow) {
    const logs = await this.collectLogs(sessionId, timeWindow);
    const correlatedEvents = this.correlateEvents(logs);
    const errors = this.detectErrors(correlatedEvents);
    const anomalies = this.detectAnomalies(correlatedEvents);
    const performance = this.analyzePerformance(correlatedEvents);
    
    return {
      session_id: sessionId,
      time_window: timeWindow,
      summary: this.generateSummary(errors, anomalies, performance),
      errors: errors,
      anomalies: anomalies,
      performance_metrics: performance,
      recommendations: this.generateRecommendations(errors, anomalies)
    };
  }

  correlateEvents(logs) {
    const correlatedEvents = new Map();
    
    // Group events by correlation ID or timestamp proximity
    logs.forEach(log => {
      const correlationKey = log.correlation_id || this.findCorrelationKey(log);
      if (!correlatedEvents.has(correlationKey)) {
        correlatedEvents.set(correlationKey, []);
      }
      correlatedEvents.get(correlationKey).push(log);
    });
    
    return correlatedEvents;
  }

  detectErrors(correlatedEvents) {
    const errors = [];
    
    correlatedEvents.forEach((events, correlationId) => {
      const errorEvents = events.filter(event => this.isError(event));
      
      if (errorEvents.length > 0) {
        const errorContext = this.buildErrorContext(events, errorEvents);
        const classification = this.classifyError(errorEvents[0]);
        
        errors.push({
          correlation_id: correlationId,
          error_type: classification.type,
          severity: classification.severity,
          message: errorEvents[0].message,
          stack_trace: errorEvents[0].stack,
          context: errorContext,
          timestamp: errorEvents[0].timestamp,
          affected_components: this.identifyAffectedComponents(events)
        });
      }
    });
    
    return errors;
  }

  detectAnomalies(correlatedEvents) {
    const anomalies = [];
    
    correlatedEvents.forEach((events, correlationId) => {
      // Detect timing anomalies
      const timingAnomaly = this.detectTimingAnomaly(events);
      if (timingAnomaly) anomalies.push(timingAnomaly);
      
      // Detect resource usage anomalies
      const resourceAnomaly = this.detectResourceAnomaly(events);
      if (resourceAnomaly) anomalies.push(resourceAnomaly);
      
      // Detect behavior anomalies
      const behaviorAnomaly = this.detectBehaviorAnomaly(events);
      if (behaviorAnomaly) anomalies.push(behaviorAnomaly);
    });
    
    return anomalies;
  }

  analyzePerformance(correlatedEvents) {
    const metrics = {
      response_times: [],
      database_query_times: [],
      memory_usage: [],
      cpu_usage: [],
      network_latency: []
    };
    
    correlatedEvents.forEach(events => {
      events.forEach(event => {
        this.extractPerformanceMetrics(event, metrics);
      });
    });
    
    return {
      average_response_time: this.calculateAverage(metrics.response_times),
      p95_response_time: this.calculatePercentile(metrics.response_times, 95),
      slow_queries: metrics.database_query_times.filter(time => time > 1000),
      memory_peaks: metrics.memory_usage.filter(usage => usage > 500),
      performance_score: this.calculatePerformanceScore(metrics)
    };
  }
}
```

### Real-time Log Streaming
```javascript
class RealTimeLogAnalyzer {
  constructor() {
    this.logBuffer = new CircularBuffer(10000);
    this.errorPatterns = new Map();
    this.anomalyDetector = new AnomalyDetector();
  }

  streamLog(logEntry) {
    this.logBuffer.push(logEntry);
    
    // Real-time error detection
    if (this.detectImmediateError(logEntry)) {
      this.emitError(logEntry);
    }
    
    // Real-time anomaly detection
    if (this.anomalyDetector.isAnomalous(logEntry)) {
      this.emitAnomaly(logEntry);
    }
    
    // Pattern learning
    this.updatePatterns(logEntry);
  }

  detectImmediateError(logEntry) {
    return ErrorClassification.critical.patterns.some(pattern => 
      pattern.test(logEntry.message)
    );
  }

  emitError(logEntry) {
    const error = {
      type: "immediate_error",
      severity: "critical",
      message: logEntry.message,
      timestamp: logEntry.timestamp,
      source: logEntry.source
    };
    
    // Send to bug detection agent immediately
    this.notifyBugDetectionAgent(error);
  }
}
```

## Integration Points

### With User Simulation Agent  
- Correlates user actions with system responses
- Identifies unexpected system behavior during user scenarios
- Validates expected vs actual system behavior

### With Browser Automation Agent
- Analyzes browser console logs and network activity
- Correlates automation actions with system responses
- Identifies client-side errors and performance issues

### With Bug Detection Agent
- Provides structured error data for bug classification
- Supplies context and reproduction information
- Delivers performance metrics for impact assessment

## Output Format
```json
{
  "analysis_id": "uuid",
  "session_id": "test_session_uuid", 
  "analysis_period": {
    "start": "2025-07-31T10:00:00Z",
    "end": "2025-07-31T10:30:00Z"
  },
  "summary": {
    "total_events": 1500,
    "errors_found": 12,
    "anomalies_detected": 3,
    "performance_issues": 2,
    "overall_health_score": 85
  },
  "errors": [
    {
      "id": "error_001",
      "correlation_id": "req_123",
      "type": "api_error",
      "severity": "high",
      "message": "Task creation failed - validation error",
      "stack_trace": "...",
      "context": {
        "user_action": "create_task",
        "request_data": {...},
        "system_state": {...}
      },
      "affected_components": ["frontend", "backend", "database"],
      "reproduction_steps": [...]
    }
  ],
  "anomalies": [
    {
      "id": "anomaly_001",
      "type": "performance_degradation",
      "description": "Response time increased 300% during peak load",
      "metrics": {
        "baseline": "200ms",
        "observed": "800ms",
        "duration": "5 minutes"
      }
    }
  ],
  "performance_metrics": {
    "average_response_time": 245,
    "p95_response_time": 850,
    "error_rate": 0.8,
    "throughput": 150,
    "resource_utilization": 65
  },
  "recommendations": [
    {
      "priority": "high",
      "category": "error_handling",
      "description": "Add validation for task title field",
      "estimated_effort": "low"
    }
  ]
}
```

## Success Metrics
- Error detection accuracy: 95%+ of actual errors identified
- False positive rate: <5% for error classification
- Log correlation accuracy: 90%+ events properly correlated
- Analysis latency: <30 seconds for 1 hour of logs