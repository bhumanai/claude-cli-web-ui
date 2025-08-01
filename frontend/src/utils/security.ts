/**
 * Enterprise Security Utilities for Claude CLI Web UI
 * Provides authentication, authorization, input validation, and security monitoring
 */

// Content Security Policy utilities
export const CSP = {
  // Generate nonce for inline scripts/styles
  generateNonce: (): string => {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
  },

  // CSP header values for different environments
  policies: {
    development: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-eval'", 'localhost:*'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'ws:', 'wss:', 'localhost:*'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"]
    },
    production: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'wss:'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': []
    }
  },

  // Build CSP header string
  buildHeader: (environment: 'development' | 'production' = 'production'): string => {
    const policy = CSP.policies[environment]
    return Object.entries(policy)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ')
  }
}

// Input validation and sanitization
export const InputValidator = {
  // Sanitize HTML to prevent XSS
  sanitizeHTML: (input: string): string => {
    const div = document.createElement('div')
    div.textContent = input
    return div.innerHTML
  },

  // Validate command input
  validateCommand: (command: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    // Basic length check
    if (command.length > 10000) {
      errors.push('Command too long (max 10000 characters)')
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      /format\s+c:/, // Windows format
      /:\(\)\{.*\|.*&.*\}:/, // Fork bomb
      /eval\s*\(/, // eval injection
      /exec\s*\(/, // exec injection
      /system\s*\(/, // system calls
      /<script[^>]*>/, // script tags
      /javascript:/, // javascript protocol
      /vbscript:/, // vbscript protocol
      /data:text\/html/, // data URLs with HTML
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        errors.push('Command contains potentially dangerous patterns')
        break
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  },

  // Validate file paths
  validateFilePath: (path: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []

    // Check for path traversal
    if (path.includes('../') || path.includes('..\\')) {
      errors.push('Path traversal detected')
    }

    // Check for absolute paths to sensitive directories
    const sensitivePaths = ['/etc/', '/sys/', '/proc/', 'C:\\Windows\\']
    for (const sensitive of sensitivePaths) {
      if (path.startsWith(sensitive)) {
        errors.push('Access to sensitive directories not allowed')
        break
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  },

  // Validate API input
  validateApiInput: (input: any, schema: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    // Basic type checking
    if (schema.type && typeof input !== schema.type) {
      errors.push(`Expected ${schema.type}, got ${typeof input}`)
    }

    // String length validation
    if (schema.maxLength && typeof input === 'string' && input.length > schema.maxLength) {
      errors.push(`String too long (max ${schema.maxLength})`)
    }

    // Number range validation
    if (schema.min && typeof input === 'number' && input < schema.min) {
      errors.push(`Number too small (min ${schema.min})`)
    }

    if (schema.max && typeof input === 'number' && input > schema.max) {
      errors.push(`Number too large (max ${schema.max})`)
    }

    // Pattern validation
    if (schema.pattern && typeof input === 'string' && !new RegExp(schema.pattern).test(input)) {
      errors.push('Input does not match required pattern')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}

// Rate limiting
export class RateLimiter {
  private requests: Map<string, number[]> = new Map()
  private windowMs: number
  private maxRequests: number

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now()
    const requests = this.requests.get(identifier) || []
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs)
    
    if (validRequests.length >= this.maxRequests) {
      return false
    }

    // Add current request
    validRequests.push(now)
    this.requests.set(identifier, validRequests)
    
    return true
  }

  getRemainingRequests(identifier: string): number {
    const now = Date.now()
    const requests = this.requests.get(identifier) || []
    const validRequests = requests.filter(time => now - time < this.windowMs)
    
    return Math.max(0, this.maxRequests - validRequests.length)
  }

  getResetTime(identifier: string): number {
    const requests = this.requests.get(identifier) || []
    if (requests.length === 0) return 0
    
    const oldestRequest = Math.min(...requests)
    return oldestRequest + this.windowMs
  }
}

// Session management
export class SessionManager {
  private sessionKey = 'claude-cli-session'
  private sessionTimeout = 30 * 60 * 1000 // 30 minutes

  generateSessionId(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  createSession(userId: string): { sessionId: string; expiresAt: number } {
    const sessionId = this.generateSessionId()
    const expiresAt = Date.now() + this.sessionTimeout
    
    const session = {
      sessionId,
      userId,
      createdAt: Date.now(),
      expiresAt,
      lastActivity: Date.now()
    }

    localStorage.setItem(`${this.sessionKey}-${sessionId}`, JSON.stringify(session))
    localStorage.setItem(`${this.sessionKey}-current`, sessionId)
    
    return { sessionId, expiresAt }
  }

  validateSession(sessionId?: string): boolean {
    const id = sessionId || localStorage.getItem(`${this.sessionKey}-current`)
    if (!id) return false

    const sessionData = localStorage.getItem(`${this.sessionKey}-${id}`)
    if (!sessionData) return false

    try {
      const session = JSON.parse(sessionData)
      
      if (Date.now() > session.expiresAt) {
        this.destroySession(id)
        return false
      }

      // Update last activity
      session.lastActivity = Date.now()
      localStorage.setItem(`${this.sessionKey}-${id}`, JSON.stringify(session))
      
      return true
    } catch {
      return false
    }
  }

  extendSession(sessionId?: string): boolean {
    const id = sessionId || localStorage.getItem(`${this.sessionKey}-current`)
    if (!id) return false

    const sessionData = localStorage.getItem(`${this.sessionKey}-${id}`)
    if (!sessionData) return false

    try {
      const session = JSON.parse(sessionData)
      session.expiresAt = Date.now() + this.sessionTimeout
      session.lastActivity = Date.now()
      
      localStorage.setItem(`${this.sessionKey}-${id}`, JSON.stringify(session))
      return true
    } catch {
      return false
    }
  }

  destroySession(sessionId?: string): void {
    const id = sessionId || localStorage.getItem(`${this.sessionKey}-current`)
    if (!id) return

    localStorage.removeItem(`${this.sessionKey}-${id}`)
    localStorage.removeItem(`${this.sessionKey}-current`)
  }

  getCurrentSession(): any | null {
    const id = localStorage.getItem(`${this.sessionKey}-current`)
    if (!id) return null

    const sessionData = localStorage.getItem(`${this.sessionKey}-${id}`)
    if (!sessionData) return null

    try {
      return JSON.parse(sessionData)
    } catch {
      return null
    }
  }
}

// Security event logging
export class SecurityLogger {
  private logs: any[] = []
  private maxLogs = 1000

  log(event: string, details: any, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      severity,
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: new SessionManager().getCurrentSession()?.sessionId
    }

    this.logs.unshift(logEntry)
    
    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs)
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Security Event [${severity.toUpperCase()}]:`, event, details)
    }

    // Store in localStorage for persistence
    try {
      localStorage.setItem('security-logs', JSON.stringify(this.logs.slice(0, 100)))
    } catch {
      // Ignore storage errors
    }

    // Send critical events to server (if endpoint available)
    if (severity === 'critical') {
      this.reportCriticalEvent(logEntry)
    }
  }

  private async reportCriticalEvent(logEntry: any): Promise<void> {
    try {
      await fetch('/api/security/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      })
    } catch {
      // Silently fail - logging is best effort
    }
  }

  getLogs(severity?: string): any[] {
    if (!severity) return this.logs
    return this.logs.filter(log => log.severity === severity)
  }

  clearLogs(): void {
    this.logs = []
    localStorage.removeItem('security-logs')
  }
}

// Encryption utilities
export const CryptoUtils = {
  // Generate random key
  generateKey: async (): Promise<CryptoKey> => {
    return await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  },

  // Encrypt data
  encrypt: async (data: string, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: ArrayBuffer }> => {
    const encoder = new TextEncoder()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    )

    return { encrypted, iv }
  },

  // Decrypt data
  decrypt: async (encrypted: ArrayBuffer, key: CryptoKey, iv: ArrayBuffer): Promise<string> => {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )

    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  },

  // Hash data
  hash: async (data: string): Promise<string> => {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
}

// Secure communication utilities
export class SecureApiClient {
  private rateLimiter = new RateLimiter()
  private sessionManager = new SessionManager()
  private securityLogger = new SecurityLogger()
  private baseUrl: string

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const identifier = this.getClientIdentifier()
    
    // Rate limiting check
    if (!this.rateLimiter.isAllowed(identifier)) {
      this.securityLogger.log('rate_limit_exceeded', { endpoint, identifier }, 'medium')
      throw new Error('Rate limit exceeded')
    }

    // Session validation
    if (!this.sessionManager.validateSession()) {
      this.securityLogger.log('invalid_session', { endpoint }, 'high')
      throw new Error('Invalid session')
    }

    // Input validation
    if (options.body && typeof options.body === 'string') {
      try {
        const data = JSON.parse(options.body)
        this.validateRequestData(data)
      } catch (error) {
        this.securityLogger.log('invalid_request_data', { endpoint, error }, 'medium')
        throw new Error('Invalid request data')
      }
    }

    // Add security headers
    const secureOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Session-ID': this.sessionManager.getCurrentSession()?.sessionId || '',
        ...options.headers
      }
    }

    try {
      const response = await fetch(this.baseUrl + endpoint, secureOptions)
      
      // Log successful requests
      this.securityLogger.log('api_request', { 
        endpoint, 
        status: response.status,
        method: options.method || 'GET'
      }, 'low')

      return response
    } catch (error) {
      this.securityLogger.log('api_request_failed', { 
        endpoint, 
        error: error.message 
      }, 'medium')
      throw error
    }
  }

  private getClientIdentifier(): string {
    // Use a combination of factors for rate limiting
    return `${navigator.userAgent.slice(0, 50)}-${window.location.hostname}`
  }

  private validateRequestData(data: any): void {
    // Recursive validation of request data
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          const validation = InputValidator.validateCommand(value)
          if (!validation.isValid) {
            throw new Error(`Invalid data in field ${key}: ${validation.errors.join(', ')}`)
          }
        } else if (typeof value === 'object') {
          this.validateRequestData(value)
        }
      }
    }
  }
}

// CSRF protection
export const CSRFProtection = {
  tokenKey: 'csrf-token',

  generateToken: (): string => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const token = btoa(String.fromCharCode(...array))
    sessionStorage.setItem(CSRFProtection.tokenKey, token)
    return token
  },

  getToken: (): string | null => {
    return sessionStorage.getItem(CSRFProtection.tokenKey)
  },

  validateToken: (token: string): boolean => {
    const storedToken = sessionStorage.getItem(CSRFProtection.tokenKey)
    return storedToken === token
  },

  addTokenToRequest: (options: RequestInit): RequestInit => {
    const token = CSRFProtection.getToken()
    if (!token) {
      throw new Error('CSRF token not found')
    }

    return {
      ...options,
      headers: {
        ...options.headers,
        'X-CSRF-Token': token
      }
    }
  }
}

// Export singleton instances
export const rateLimiter = new RateLimiter()
export const sessionManager = new SessionManager()
export const securityLogger = new SecurityLogger()
export const secureApiClient = new SecureApiClient()

// Initialize CSRF token on module load
CSRFProtection.generateToken()