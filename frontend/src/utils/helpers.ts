import { getApiUrl, getWsUrl } from '@/config/backend'

export const formatTimestamp = (date: Date): string => {
  return date.toLocaleTimeString()
}

export const parseCommandOutput = (output: string): { type: string; content: string } => {
  // Simple parser - just return stdout for now
  return {
    type: 'stdout',
    content: output
  }
}

export const generateSessionId = (): string => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 12)
  return `session_${timestamp}_${random}`
}

/**
 * Get the API base URL from environment variables with fallback
 * Centralizes URL configuration for consistency across the application
 */
export const getApiBaseUrl = (): string => {
  return getApiUrl()
}

/**
 * Get the WebSocket URL from API URL
 * Converts HTTP(S) URLs to WebSocket URLs
 */
export const getWebSocketUrl = (apiUrl?: string): string => {
  const baseUrl = apiUrl || getApiBaseUrl()
  
  if (baseUrl.startsWith('https://')) {
    return baseUrl.replace('https://', 'wss://')
  } else if (baseUrl.startsWith('http://')) {
    return baseUrl.replace('http://', 'ws://')
  }
  
  // Handle cases where URL doesn't have protocol
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    return `ws://${baseUrl}`
  }
  
  // Default to secure WebSocket for production
  return `wss://${baseUrl}`
}

/**
 * Get fallback URLs from environment variables
 */
export const getFallbackUrls = (): string[] => {
  const fallbackUrls = import.meta.env.VITE_FALLBACK_API_URLS?.split(',') || []
  return fallbackUrls.map(url => url.trim()).filter(Boolean)
}