// Backend configuration
export const BACKEND_CONFIG = {
  // Production backend URL - YOUR ACTUAL WORKING BACKEND
  API_URL: 'https://backend-vercel-ruby.vercel.app',
  WS_URL: 'wss://backend-vercel-ruby.vercel.app',
  
  // Bypass token for Vercel authentication (not needed for this backend)
  BYPASS_TOKEN: 'LvOUwvNP10GZfL3aVQTEV9hJWEcHpSK7'
}

// Helper to get API URL with fallback
export function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || BACKEND_CONFIG.API_URL
}

// Helper to get WebSocket URL with fallback
export function getWsUrl(): string {
  return import.meta.env.VITE_WS_URL || BACKEND_CONFIG.WS_URL
}

// Helper to get bypass headers if needed
export function getBypassHeaders(): Record<string, string> {
  // Only add bypass header if we're using the production backend
  if (getApiUrl().includes('vercel.app')) {
    return {
      'x-vercel-protection-bypass': BACKEND_CONFIG.BYPASS_TOKEN
    }
  }
  return {}
}