/** @type {import('next').NextConfig} */
const { nextjsSecurityHeaders } = require('./src/utils/securityHeaders')

const isDev = process.env.NODE_ENV === 'development'

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Security headers
  async headers() {
    const environment = isDev ? 'development' : 'production'
    const securityHeaders = nextjsSecurityHeaders(environment)
    
    return [
      {
        source: '/(.*)',
        headers: securityHeaders
      },
      // Security.txt
      {
        source: '/.well-known/security.txt',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/plain; charset=utf-8'
          }
        ]
      }
    ]
  },
  
  // Security redirects
  async redirects() {
    return [
      // Redirect HTTP to HTTPS in production
      ...(!isDev ? [{
        source: '/(.*)',
        has: [
          {
            type: 'header',
            key: 'x-forwarded-proto',
            value: 'http'
          }
        ],
        destination: 'https://claude-cli.app/$1',
        permanent: true
      }] : [])
    ]
  },
  
  // Webpack configuration for security
  webpack: (config, { dev, isServer }) => {
    // Security-related webpack plugins
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          security: {
            name: 'security',
            test: /[\\/]src[\\/](utils|components)[\\/](security|auth)/,
            chunks: 'all',
            priority: 10
          }
        }
      }
    }
    
    return config
  },
  
  // Environment variables
  env: {
    NEXT_PUBLIC_APP_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SECURITY_MONITORING: process.env.SECURITY_MONITORING || 'true',
    NEXT_PUBLIC_CSP_NONCE: process.env.CSP_NONCE,
  },
  
  // Output configuration
  output: 'standalone',
  
  // Image optimization
  images: {
    domains: [],
    unoptimized: true // For static export
  },
  
  // Experimental features
  experimental: {
    // Enable security-related experimental features
    serverComponentsExternalPackages: ['crypto'],
  }
}

module.exports = nextConfig