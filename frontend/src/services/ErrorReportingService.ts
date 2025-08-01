export interface ErrorReport {
  id: string
  timestamp: Date
  level: 'error' | 'warning' | 'info'
  message: string
  stack?: string
  context: {
    url: string
    userAgent: string
    userId?: string
    sessionId?: string
    component?: string
    action?: string
    metadata?: Record<string, any>
  }
  breadcrumbs: Breadcrumb[]
  tags: string[]
}

export interface Breadcrumb {
  timestamp: Date
  level: 'error' | 'warning' | 'info' | 'debug'
  message: string
  category: 'navigation' | 'user' | 'http' | 'console' | 'system'
  data?: Record<string, any>
}

export interface ErrorReportingConfig {
  enabled: boolean
  apiEndpoint?: string
  maxBreadcrumbs: number
  enableConsoleCapture: boolean
  enableNavigationCapture: boolean
  enableHttpCapture: boolean
  beforeSend?: (report: ErrorReport) => ErrorReport | null
  sampleRate: number // 0-1, percentage of errors to report
}

class ErrorReportingService {
  private config: ErrorReportingConfig
  private breadcrumbs: Breadcrumb[] = []
  private userId?: string
  private sessionId?: string
  private tags: Set<string> = new Set()

  constructor(config: Partial<ErrorReportingConfig> = {}) {
    this.config = {
      enabled: true,
      maxBreadcrumbs: 100,
      enableConsoleCapture: true,
      enableNavigationCapture: true,
      enableHttpCapture: true,
      sampleRate: 1.0,
      ...config
    }

    if (this.config.enabled) {
      this.initialize()
    }
  }

  private initialize() {
    // Capture unhandled errors
    window.addEventListener('error', this.handleGlobalError.bind(this))
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this))

    // Capture console logs if enabled
    if (this.config.enableConsoleCapture) {
      this.instrumentConsole()
    }

    // Capture navigation events if enabled
    if (this.config.enableNavigationCapture) {
      this.instrumentNavigation()
    }

    // Capture HTTP requests if enabled
    if (this.config.enableHttpCapture) {
      this.instrumentHttp()
    }
  }

  private handleGlobalError(event: ErrorEvent) {
    this.captureError(event.error || new Error(event.message), {
      component: 'Global',
      action: 'unhandled_error',
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    })
  }

  private handleUnhandledRejection(event: PromiseRejectionEvent) {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason))

    this.captureError(error, {
      component: 'Global',
      action: 'unhandled_promise_rejection'
    })
  }

  private instrumentConsole() {
    const originalConsole = { ...console }

    const levels: Array<keyof Console> = ['error', 'warn', 'info', 'debug']
    
    levels.forEach(level => {
      const originalMethod = originalConsole[level] as Function
      
      ;(console as any)[level] = (...args: any[]) => {
        // Call original method
        originalMethod.apply(console, args)
        
        // Add breadcrumb
        this.addBreadcrumb({
          level: level === 'warn' ? 'warning' : level === 'info' ? 'info' : level === 'debug' ? 'debug' : 'error',
          message: args.map(arg => String(arg)).join(' '),
          category: 'console',
          data: { arguments: args }
        })
      }
    })
  }

  private instrumentNavigation() {
    // Track page navigation
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function(...args) {
      const result = originalPushState.apply(this, args)
      window.dispatchEvent(new Event('pushstate'))
      return result
    }

    history.replaceState = function(...args) {
      const result = originalReplaceState.apply(this, args)
      window.dispatchEvent(new Event('replacestate'))
      return result
    }

    const handleNavigation = () => {
      this.addBreadcrumb({
        level: 'info',
        message: `Navigation to ${window.location.pathname}`,
        category: 'navigation',
        data: {
          from: document.referrer,
          to: window.location.href
        }
      })
    }

    window.addEventListener('pushstate', handleNavigation)
    window.addEventListener('replacestate', handleNavigation)
    window.addEventListener('popstate', handleNavigation)
  }

  private instrumentHttp() {
    // Instrument fetch
    const originalFetch = window.fetch
    
    window.fetch = async (...args) => {
      const startTime = Date.now()
      const url = typeof args[0] === 'string' ? args[0] : args[0].url
      
      try {
        const response = await originalFetch(...args)
        const duration = Date.now() - startTime
        
        this.addBreadcrumb({
          level: response.ok ? 'info' : 'warning',
          message: `HTTP ${response.status} ${url}`,
          category: 'http',
          data: {
            url,
            method: args[1]?.method || 'GET',
            status: response.status,
            duration
          }
        })
        
        return response
      } catch (error) {
        const duration = Date.now() - startTime
        
        this.addBreadcrumb({
          level: 'error',
          message: `HTTP Error ${url}`,
          category: 'http',
          data: {
            url,
            method: args[1]?.method || 'GET',
            error: error instanceof Error ? error.message : String(error),
            duration
          }
        })
        
        throw error
      }
    }

    // Instrument XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open
    const originalXHRSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._errorReporting = { method, url, startTime: 0 }
      return originalXHROpen.call(this, method, url, ...args)
    }

    XMLHttpRequest.prototype.send = function(...args) {
      if (this._errorReporting) {
        this._errorReporting.startTime = Date.now()
        
        this.addEventListener('load', () => {
          const duration = Date.now() - this._errorReporting.startTime
          
          window.errorReporting?.addBreadcrumb({
            level: this.status >= 200 && this.status < 300 ? 'info' : 'warning',
            message: `XHR ${this.status} ${this._errorReporting.url}`,
            category: 'http',
            data: {
              url: this._errorReporting.url,
              method: this._errorReporting.method,
              status: this.status,
              duration
            }
          })
        })
        
        this.addEventListener('error', () => {
          const duration = Date.now() - this._errorReporting.startTime
          
          window.errorReporting?.addBreadcrumb({
            level: 'error',
            message: `XHR Error ${this._errorReporting.url}`,
            category: 'http',
            data: {
              url: this._errorReporting.url,
              method: this._errorReporting.method,
              duration
            }
          })
        })
      }
      
      return originalXHRSend.call(this, ...args)
    }
  }

  public setUser(userId: string) {
    this.userId = userId
  }

  public setSession(sessionId: string) {
    this.sessionId = sessionId
  }

  public addTag(tag: string) {
    this.tags.add(tag)
  }

  public removeTag(tag: string) {
    this.tags.delete(tag)
  }

  public addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>) {
    if (!this.config.enabled) return

    const fullBreadcrumb: Breadcrumb = {
      timestamp: new Date(),
      ...breadcrumb
    }

    this.breadcrumbs.push(fullBreadcrumb)

    // Maintain max breadcrumbs limit
    if (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.config.maxBreadcrumbs)
    }
  }

  public captureError(error: Error, context: Partial<ErrorReport['context']> = {}) {
    if (!this.config.enabled) return

    // Check sample rate
    if (Math.random() > this.config.sampleRate) return

    const report: ErrorReport = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: 'error',
      message: error.message,
      stack: error.stack,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        userId: this.userId,
        sessionId: this.sessionId,
        ...context
      },
      breadcrumbs: [...this.breadcrumbs],
      tags: Array.from(this.tags)
    }

    // Allow modification or filtering via beforeSend
    const finalReport = this.config.beforeSend?.(report) || report

    if (finalReport) {
      this.sendReport(finalReport)
    }
  }

  public captureMessage(message: string, level: ErrorReport['level'] = 'info', context: Partial<ErrorReport['context']> = {}) {
    if (!this.config.enabled) return

    const report: ErrorReport = {
      id: `message-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        userId: this.userId,
        sessionId: this.sessionId,
        ...context
      },
      breadcrumbs: [...this.breadcrumbs],
      tags: Array.from(this.tags)
    }

    const finalReport = this.config.beforeSend?.(report) || report

    if (finalReport) {
      this.sendReport(finalReport)
    }
  }

  private async sendReport(report: ErrorReport) {
    try {
      if (this.config.apiEndpoint) {
        // Send to external service
        await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(report)
        })
      } else {
        // Log to console for development
        console.group('🚨 Error Report')
        console.error('Error:', report.message)
        console.error('Stack:', report.stack)
        console.error('Context:', report.context)
        console.error('Breadcrumbs:', report.breadcrumbs)
        console.groupEnd()
      }

      // Store in localStorage for debugging (keep last 10 reports)
      const stored = JSON.parse(localStorage.getItem('error-reports') || '[]')
      stored.push(report)
      localStorage.setItem('error-reports', JSON.stringify(stored.slice(-10)))

    } catch (error) {
      console.error('Failed to send error report:', error)
    }
  }

  public getStoredReports(): ErrorReport[] {
    try {
      return JSON.parse(localStorage.getItem('error-reports') || '[]')
    } catch {
      return []
    }
  }

  public clearStoredReports() {
    localStorage.removeItem('error-reports')
  }

  public disable() {
    this.config.enabled = false
  }

  public enable() {
    this.config.enabled = true
  }
}

// Global instance
declare global {
  interface Window {
    errorReporting?: ErrorReportingService
  }
}

// Create and export default instance
export const errorReporting = new ErrorReportingService()

// Make available globally for debugging
if (typeof window !== 'undefined') {
  window.errorReporting = errorReporting
}

export default ErrorReportingService