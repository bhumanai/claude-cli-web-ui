# Browser Automation Agent

## Purpose
Execute automated browser interactions using Playwright MCP to simulate realistic user behavior and capture comprehensive test data.

## Core Capabilities

### 1. Browser Orchestration
- Launch and manage multiple browser instances (Chrome, Firefox, Safari)
- Handle different viewport sizes and device emulation
- Manage browser contexts and sessions
- Capture screenshots, videos, and performance metrics

### 2. User Interaction Simulation
- Execute realistic user actions with proper timing
- Handle complex interactions (drag-and-drop, file uploads, multi-step forms)
- Simulate network conditions and interruptions
- Manage authentication and session state

### 3. Data Capture & Analysis
- Capture network requests and responses
- Monitor console logs and JavaScript errors
- Record performance metrics and resource usage
- Generate detailed interaction traces

## Agent Implementation

### Browser Configuration
```javascript
const BrowserConfigurations = {
  desktop_chrome: {
    browser: 'chromium',
    viewport: { width: 1920, height: 1080 },
    device: null,
    user_agent: 'Chrome/latest',
    network_conditions: 'fast_3g'
  },
  mobile_safari: {
    browser: 'webkit', 
    viewport: { width: 375, height: 812 },
    device: 'iPhone 13',
    user_agent: 'Safari/iOS',
    network_conditions: 'slow_3g'
  },
  tablet_firefox: {
    browser: 'firefox',
    viewport: { width: 1024, height: 768 },
    device: 'iPad',
    user_agent: 'Firefox/latest',
    network_conditions: 'fast_3g'
  }
}
```

### Playwright MCP Integration
```javascript
class PlaywrightAutomationEngine {
  constructor() {
    this.activeSessions = new Map();
    this.performanceMetrics = new Map();
    this.interactionTraces = new Map();
  }

  async startTestSession(sessionId, configuration) {
    // Initialize Playwright session using MCP
    const session = await this.initializePlaywrightSession(configuration);
    
    // Start capturing performance metrics
    await this.startPerformanceCapture(session, sessionId);
    
    // Start console log capture
    await this.startConsoleCapture(session, sessionId);
    
    // Start network monitoring
    await this.startNetworkCapture(session, sessionId);
    
    this.activeSessions.set(sessionId, session);
    
    return {
      session_id: sessionId,
      browser_type: configuration.browser,
      viewport: configuration.viewport,
      start_time: Date.now()
    };
  }

  async executeUserScenario(sessionId, scenario) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`No active session found: ${sessionId}`);
    }

    const executionTrace = {
      scenario_id: scenario.id,
      persona: scenario.persona,
      steps: [],
      start_time: Date.now()
    };

    try {
      // Navigate to starting page
      await this.navigateToPage(session, scenario.start_url);
      
      // Execute each step in the scenario
      for (const step of scenario.steps) {
        const stepResult = await this.executeStep(session, step, scenario.persona);
        executionTrace.steps.push(stepResult);
        
        // Add realistic delays based on persona
        await this.addRealisticDelay(step, scenario.persona);
      }
      
      executionTrace.end_time = Date.now();
      executionTrace.duration = executionTrace.end_time - executionTrace.start_time;
      executionTrace.success = true;
      
    } catch (error) {
      executionTrace.end_time = Date.now();
      executionTrace.duration = executionTrace.end_time - executionTrace.start_time;
      executionTrace.success = false;
      executionTrace.error = {
        message: error.message,
        stack: error.stack,
        screenshot: await this.captureErrorScreenshot(session)
      };
    }
    
    this.interactionTraces.set(scenario.id, executionTrace);
    return executionTrace;
  }

  async executeStep(session, step, persona) {
    const stepTrace = {
      step_type: step.action,
      target: step.target,
      start_time: Date.now()
    };

    try {
      switch (step.action) {
        case 'navigate':
          await this.mcpNavigate(session, step.target);
          break;
          
        case 'click':
          await this.mcpClick(session, step.target);
          break;
          
        case 'type':
          await this.mcpType(session, step.target, step.value, persona);
          break;
          
        case 'select':
          await this.mcpSelect(session, step.target, step.value);
          break;
          
        case 'upload':
          await this.mcpUploadFile(session, step.target, step.file_path);
          break;
          
        case 'wait_for':
          await this.mcpWaitFor(session, step.target, step.timeout);
          break;
          
        case 'scroll':
          await this.mcpScroll(session, step.target, step.direction);
          break;
          
        case 'drag_drop':
          await this.mcpDragDrop(session, step.source, step.target);
          break;
          
        default:
          throw new Error(`Unknown step action: ${step.action}`);
      }
      
      stepTrace.success = true;
      stepTrace.end_time = Date.now();
      
      // Capture screenshot after each step for debugging
      if (step.capture_screenshot) {
        stepTrace.screenshot = await this.captureStepScreenshot(session, step);
      }
      
    } catch (error) {
      stepTrace.success = false;
      stepTrace.error = error.message;
      stepTrace.end_time = Date.now();
      stepTrace.screenshot = await this.captureErrorScreenshot(session);
    }
    
    stepTrace.duration = stepTrace.end_time - stepTrace.start_time;
    return stepTrace;
  }

  // Playwright MCP wrapper methods
  async mcpNavigate(session, url) {
    return await mcp__playwright__playwright_navigate({
      url: url,
      browserType: session.browser_type,
      headless: session.headless,
      timeout: 30000
    });
  }

  async mcpClick(session, selector) {
    return await mcp__playwright__playwright_click({
      selector: selector
    });
  }

  async mcpType(session, selector, value, persona) {
    // Simulate realistic typing based on persona
    const typingSpeed = this.getTypingSpeed(persona);
    const withTypos = this.shouldAddTypos(persona);
    
    if (withTypos && Math.random() < persona.error_rate) {
      // Simulate typos and corrections
      const typoValue = this.introduceTypos(value);
      await mcp__playwright__playwright_fill({
        selector: selector,
        value: typoValue
      });
      
      // Simulate user noticing and correcting typo
      await this.addRealisticDelay({ type: 'thinking' }, persona);
      await this.mcpClearAndType(session, selector, value);
      
    } else {
      await mcp__playwright__playwright_fill({
        selector: selector,
        value: value
      });
    }
  }

  async mcpSelect(session, selector, value) {
    return await mcp__playwright__playwright_select({
      selector: selector,
      value: value
    });
  }

  async mcpUploadFile(session, selector, filePath) {
    return await mcp__playwright__playwright_upload_file({
      selector: selector,
      filePath: filePath
    });
  }

  async mcpWaitFor(session, selector, timeout = 5000) {
    // Implement wait logic using Playwright evaluate
    return await mcp__playwright__playwright_evaluate({
      script: `
        new Promise((resolve, reject) => {
          const element = document.querySelector('${selector}');
          if (element) {
            resolve(true);
          } else {
            const observer = new MutationObserver((mutations) => {
              const element = document.querySelector('${selector}');
              if (element) {
                observer.disconnect();
                resolve(true);
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
              observer.disconnect();
              reject(new Error('Element not found within timeout'));
            }, ${timeout});
          }
        })
      `
    });
  }

  async captureStepScreenshot(session, step) {
    return await mcp__playwright__playwright_screenshot({
      name: `step_${step.action}_${Date.now()}`,
      fullPage: false,
      savePng: true
    });
  }

  async captureErrorScreenshot(session) {
    return await mcp__playwright__playwright_screenshot({
      name: `error_${Date.now()}`,
      fullPage: true,
      savePng: true
    });
  }
}
```

### Performance Monitoring Integration
```javascript
class BrowserPerformanceMonitor {
  constructor() {
    this.performanceData = new Map();
  }

  async startPerformanceCapture(session, sessionId) {
    // Start performance monitoring using Playwright evaluate
    await mcp__playwright__playwright_evaluate({
      script: `
        window.performanceMetrics = {
          navigationTiming: performance.getEntriesByType('navigation')[0],
          resourceTiming: performance.getEntriesByType('resource'),
          measureUserTiming: performance.getEntriesByType('measure'),
          memoryInfo: performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          } : null
        };
        
        // Set up performance observer
        if ('PerformanceObserver' in window) {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.performanceMetrics.userTiming = window.performanceMetrics.userTiming || [];
              window.performanceMetrics.userTiming.push(entry);
            }
          });
          observer.observe({entryTypes: ['measure', 'mark']});
        }
      `
    });
  }

  async capturePerformanceMetrics(session, sessionId) {
    const metrics = await mcp__playwright__playwright_evaluate({
      script: `
        return {
          performanceMetrics: window.performanceMetrics,
          vitals: {
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
            lcp: performance.getEntriesByType('largest-contentful-paint')[0]?.startTime,
            fid: performance.getEntriesByType('first-input')[0]?.processingStart,
            cls: performance.getEntriesByType('layout-shift').reduce((sum, entry) => sum + entry.value, 0)
          },
          resourceCounts: {
            totalResources: performance.getEntriesByType('resource').length,
            failedResources: performance.getEntriesByType('resource').filter(r => r.transferSize === 0).length
          }
        }
      `
    });
    
    this.performanceData.set(sessionId, metrics);
    return metrics;
  }
}
```

### Network Monitoring
```javascript
class NetworkMonitor {
  constructor() {
    this.networkLogs = new Map();
  }

  async startNetworkCapture(session, sessionId) {
    // Set up network request/response capture
    await mcp__playwright__playwright_evaluate({
      script: `
        window.networkRequests = [];
        
        // Intercept fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          const startTime = performance.now();
          const request = {
            url: args[0],
            method: args[1]?.method || 'GET',
            headers: args[1]?.headers || {},
            startTime: startTime,
            type: 'fetch'
          };
          
          return originalFetch.apply(this, args).then(response => {
            request.endTime = performance.now();
            request.duration = request.endTime - request.startTime;
            request.status = response.status;
            request.success = response.ok;
            window.networkRequests.push(request);
            return response;
          }).catch(error => {
            request.endTime = performance.now();
            request.duration = request.endTime - request.startTime;
            request.error = error.message;
            request.success = false;
            window.networkRequests.push(request);
            throw error;
          });
        };
        
        // Intercept XHR requests
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
          this._requestData = {
            method: method,
            url: url,
            startTime: performance.now(),
            type: 'xhr'
          };
          return originalXHROpen.apply(this, [method, url, ...args]);
        };
        
        XMLHttpRequest.prototype.send = function(...args) {
          if (this._requestData) {
            this.addEventListener('loadend', () => {
              this._requestData.endTime = performance.now();
              this._requestData.duration = this._requestData.endTime - this._requestData.startTime;
              this._requestData.status = this.status;
              this._requestData.success = this.status >= 200 && this.status < 300;
              window.networkRequests.push(this._requestData);
            });
          }
          return originalXHRSend.apply(this, args);
        };
      `
    });
  }

  async captureNetworkLogs(session, sessionId) {
    const networkData = await mcp__playwright__playwright_evaluate({
      script: `return window.networkRequests || []`
    });
    
    this.networkLogs.set(sessionId, networkData);
    return networkData;
  }
}
```

### Console Log Capture
```javascript
class ConsoleLogCapture {
  constructor() {
    this.consoleLogs = new Map();
  }

  async startConsoleCapture(session, sessionId) {
    // Capture console logs using Playwright console monitoring
    await mcp__playwright__playwright_evaluate({
      script: `
        window.capturedLogs = [];
        
        // Override console methods
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        
        console.log = function(...args) {
          window.capturedLogs.push({
            level: 'log',
            message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
            timestamp: Date.now(),
            stack: new Error().stack
          });
          return originalLog.apply(this, args);
        };
        
        console.error = function(...args) {
          window.capturedLogs.push({
            level: 'error',
            message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
            timestamp: Date.now(),
            stack: new Error().stack
          });
          return originalError.apply(this, args);
        };
        
        console.warn = function(...args) {
          window.capturedLogs.push({
            level: 'warn',
            message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
            timestamp: Date.now(),
            stack: new Error().stack
          });
          return originalWarn.apply(this, args);
        };
        
        console.info = function(...args) {
          window.capturedLogs.push({
            level: 'info',
            message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
            timestamp: Date.now(),
            stack: new Error().stack
          });
          return originalInfo.apply(this, args);
        };
        
        // Capture unhandled errors
        window.addEventListener('error', (event) => {
          window.capturedLogs.push({
            level: 'error',
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error ? event.error.stack : null,
            timestamp: Date.now(),
            type: 'unhandled_error'
          });
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
          window.capturedLogs.push({
            level: 'error',
            message: 'Unhandled promise rejection: ' + (event.reason?.message || String(event.reason)),
            stack: event.reason?.stack,
            timestamp: Date.now(),
            type: 'unhandled_rejection'
          });
        });
      `
    });
  }

  async captureConsoleLogs(session, sessionId) {
    const logs = await mcp__playwright__playwright_console_logs({
      type: 'all',
      limit: 1000
    });
    
    // Also get captured custom logs
    const customLogs = await mcp__playwright__playwright_evaluate({
      script: `return window.capturedLogs || []`
    });
    
    const combinedLogs = [...logs, ...customLogs];
    this.consoleLogs.set(sessionId, combinedLogs);
    return combinedLogs;
  }
}
```

## Integration Points

### With User Simulation Agent
- Receives realistic user scenarios and persona-based behaviors
- Executes user actions with appropriate timing and error patterns
- Provides execution results and interaction traces

### With Log Analysis Agent
- Supplies browser console logs, network requests, and performance data
- Provides context about user actions that triggered system events
- Delivers screenshots and traces for error correlation

### With Bug Detection Agent
- Provides reproduction scenarios and test execution results
- Supplies detailed error context and system state information
- Delivers performance metrics and resource usage data

## Output Format
```json
{
  "session_id": "uuid",
  "browser_config": {
    "browser_type": "chromium",
    "viewport": {"width": 1920, "height": 1080},
    "device": null,
    "network_conditions": "fast_3g"
  },
  "execution_summary": {
    "total_scenarios": 5,
    "successful_scenarios": 4,
    "failed_scenarios": 1,
    "total_steps": 45,
    "successful_steps": 42,
    "failed_steps": 3,
    "execution_time": 180000
  },
  "scenarios": [
    {
      "scenario_id": "create_task_001",
      "persona": "novice_user",
      "success": true,
      "duration": 8000,
      "steps": [
        {
          "step_type": "navigate",
          "target": "/tasks/new",
          "duration": 1200,
          "success": true
        },
        {
          "step_type": "type",
          "target": "#title",
          "value": "My first task",
          "duration": 5000,
          "success": true,
          "persona_behaviors": ["slow_typing", "typo_correction"]
        }
      ]
    }
  ],
  "performance_metrics": {
    "page_load_time": 2400,
    "time_to_interactive": 3200,
    "largest_contentful_paint": 2800,
    "cumulative_layout_shift": 0.05,
    "memory_usage": {
      "peak": 67000000,
      "average": 45000000
    }
  },
  "network_activity": {
    "total_requests": 25,
    "failed_requests": 2,
    "average_response_time": 245,
    "slowest_requests": [
      {
        "url": "/api/tasks",
        "method": "POST",
        "duration": 850,
        "status": 200
      }
    ]
  },
  "console_logs": [
    {
      "level": "error",
      "message": "Validation failed for task title",
      "timestamp": 1722427200000,
      "stack": "Error stack trace...",
      "type": "validation_error"
    }
  ],
  "screenshots": [
    {
      "name": "error_1722427200000.png",
      "path": "/screenshots/error_1722427200000.png",
      "context": "Task creation validation error"
    }
  ]
}
```

## Success Metrics
- Scenario execution success rate: 90%+
- Realistic user behavior simulation: 85%+ persona accuracy
- Error detection coverage: 95%+ of UI/frontend errors captured
- Performance data quality: 100% of key metrics captured