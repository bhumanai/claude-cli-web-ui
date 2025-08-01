/**
 * Security Headers Configuration
 * Configures security headers for production deployment
 */

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string
  strictTransportSecurity?: string
  xFrameOptions?: string
  xContentTypeOptions?: string
  xXSSProtection?: string
  referrerPolicy?: string
  permissionsPolicy?: string
  crossOriginEmbedderPolicy?: string
  crossOriginOpenerPolicy?: string
  crossOriginResourcePolicy?: string
}

// Security headers for different environments
export const securityHeaders = {
  development: {
    contentSecurityPolicy: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' localhost:* 127.0.0.1:*",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: localhost:* 127.0.0.1:*",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    xXSSProtection: '1; mode=block',
    referrerPolicy: 'strict-origin-when-cross-origin'
  },

  production: {
    contentSecurityPolicy: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // Allow inline styles for dynamic theming
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; '),
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    xXSSProtection: '1; mode=block',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'fullscreen=(self)'
    ].join(', '),
    crossOriginEmbedderPolicy: 'require-corp',
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'same-origin'
  }
}

// Function to get security headers based on environment
export const getSecurityHeaders = (
  environment: 'development' | 'production' = 'production'
): SecurityHeadersConfig => {
  return securityHeaders[environment]
}

// Function to apply security headers to fetch requests
export const applySecurityHeaders = (
  headers: HeadersInit = {},
  environment: 'development' | 'production' = 'production'
): HeadersInit => {
  const secHeaders = getSecurityHeaders(environment)
  
  return {
    ...headers,
    'X-Content-Type-Options': secHeaders.xContentTypeOptions || 'nosniff',
    'X-Frame-Options': secHeaders.xFrameOptions || 'DENY',
    'X-XSS-Protection': secHeaders.xXSSProtection || '1; mode=block',
    'Referrer-Policy': secHeaders.referrerPolicy || 'strict-origin-when-cross-origin',
    'Cross-Origin-Resource-Policy': secHeaders.crossOriginResourcePolicy || 'same-origin'
  }
}

// Next.js/Vercel headers configuration
export const nextjsSecurityHeaders = (environment: 'development' | 'production' = 'production') => {
  const headers = getSecurityHeaders(environment)
  
  return [
    {
      key: 'Content-Security-Policy',
      value: headers.contentSecurityPolicy
    },
    {
      key: 'Strict-Transport-Security',
      value: headers.strictTransportSecurity || 'max-age=31536000; includeSubDomains'
    },
    {
      key: 'X-Frame-Options',
      value: headers.xFrameOptions || 'DENY'
    },
    {
      key: 'X-Content-Type-Options',
      value: headers.xContentTypeOptions || 'nosniff'
    },
    {
      key: 'X-XSS-Protection',
      value: headers.xXSSProtection || '1; mode=block'
    },
    {
      key: 'Referrer-Policy',
      value: headers.referrerPolicy || 'strict-origin-when-cross-origin'
    },
    {
      key: 'Permissions-Policy',
      value: headers.permissionsPolicy || 'camera=(), microphone=(), geolocation=()'
    },
    {
      key: 'Cross-Origin-Embedder-Policy',
      value: headers.crossOriginEmbedderPolicy || 'require-corp'
    },
    {
      key: 'Cross-Origin-Opener-Policy',
      value: headers.crossOriginOpenerPolicy || 'same-origin'
    },
    {
      key: 'Cross-Origin-Resource-Policy',
      value: headers.crossOriginResourcePolicy || 'same-origin'
    }
  ].filter(header => header.value) // Remove undefined values
}

// Helmet.js configuration for React apps
export const helmetConfig = (environment: 'development' | 'production' = 'production') => {
  const headers = getSecurityHeaders(environment)
  
  return {
    contentSecurityPolicy: {
      directives: parseCSP(headers.contentSecurityPolicy || '')
    },
    hsts: environment === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false,
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permissionsPolicy: headers.permissionsPolicy ? 
      parsePermissionsPolicy(headers.permissionsPolicy) : undefined
  }
}

// Parse CSP string into object
const parseCSP = (csp: string): Record<string, string[]> => {
  const directives: Record<string, string[]> = {}
  
  csp.split(';').forEach(directive => {
    const [key, ...values] = directive.trim().split(' ')
    if (key) {
      directives[key.replace(/-/g, '')] = values
    }
  })
  
  return directives
}

// Parse Permissions Policy string into object
const parsePermissionsPolicy = (policy: string): Record<string, string[]> => {
  const permissions: Record<string, string[]> = {}
  
  policy.split(',').forEach(permission => {
    const match = permission.trim().match(/^([^=]+)=\(([^)]*)\)$/)
    if (match) {
      const [, feature, allowlist] = match
      permissions[feature] = allowlist ? allowlist.split(' ').filter(Boolean) : []
    }
  })
  
  return permissions
}

// Validate security headers
export const validateSecurityHeaders = (headers: Headers): {
  isSecure: boolean
  issues: string[]
  recommendations: string[]
} => {
  const issues: string[] = []
  const recommendations: string[] = []
  
  // Check for essential security headers
  if (!headers.get('Content-Security-Policy')) {
    issues.push('Missing Content-Security-Policy header')
  }
  
  if (!headers.get('X-Frame-Options') && !headers.get('Content-Security-Policy')?.includes('frame-ancestors')) {
    issues.push('Missing X-Frame-Options or frame-ancestors directive')
  }
  
  if (!headers.get('X-Content-Type-Options')) {
    issues.push('Missing X-Content-Type-Options header')
  }
  
  if (!headers.get('Strict-Transport-Security') && location.protocol === 'https:') {
    recommendations.push('Consider adding Strict-Transport-Security header for HTTPS')
  }
  
  if (!headers.get('Referrer-Policy')) {
    recommendations.push('Consider adding Referrer-Policy header')
  }
  
  // Check CSP strength
  const csp = headers.get('Content-Security-Policy')
  if (csp) {
    if (csp.includes("'unsafe-eval'")) {
      recommendations.push("Consider removing 'unsafe-eval' from CSP for better security")
    }
    
    if (csp.includes("'unsafe-inline'") && !csp.includes('nonce-')) {
      recommendations.push("Consider using nonces instead of 'unsafe-inline' in CSP")
    }
  }
  
  return {
    isSecure: issues.length === 0,
    issues,
    recommendations
  }
}

// Security header middleware for development
export const securityMiddleware = (environment: 'development' | 'production' = 'production') => {
  return (req: Request, res: Response, next: () => void) => {
    const headers = getSecurityHeaders(environment)
    
    Object.entries(headers).forEach(([key, value]) => {
      if (value) {
        // Convert camelCase to kebab-case
        const headerName = key.replace(/([A-Z])/g, '-$1').toLowerCase()
        res.setHeader(headerName, value)
      }
    })
    
    next()
  }
}

// Generate security.txt file content
export const generateSecurityTxt = (config: {
  contact: string
  expires: Date
  encryption?: string
  acknowledgments?: string
  policy?: string
  hiring?: string
}) => {
  const lines = [
    `Contact: ${config.contact}`,
    `Expires: ${config.expires.toISOString()}`,
    ...(config.encryption ? [`Encryption: ${config.encryption}`] : []),
    ...(config.acknowledgments ? [`Acknowledgments: ${config.acknowledgments}`] : []),
    ...(config.policy ? [`Policy: ${config.policy}`] : []),
    ...(config.hiring ? [`Hiring: ${config.hiring}`] : [])
  ]
  
  return lines.join('\n')
}