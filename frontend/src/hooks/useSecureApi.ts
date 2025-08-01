/**
 * Secure API Hook
 * Provides secure API communication with built-in protection
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { secureApiClient, InputValidator, CSRFProtection } from '../utils/security'
import { useSecurity } from '../components/SecurityProvider'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface UseSecureApiOptions {
  validateInput?: boolean
  requireAuth?: boolean
  enableRetry?: boolean
  maxRetries?: number
  retryDelay?: number
  timeout?: number
}

interface ApiResponse<T> {
  data: T
  error: string | null
  success: boolean
}

export const useSecureApi = <T = any>(
  endpoint: string,
  options: UseSecureApiOptions = {}
) => {
  const {
    validateInput = true,
    requireAuth = true,
    enableRetry = true,
    maxRetries = 3,
    retryDelay = 1000,
    timeout = 30000
  } = options

  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null
  })

  const { 
    isAuthenticated, 
    checkRateLimit, 
    logSecurityEvent, 
    csrfToken 
  } = useSecurity()

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)

  // Reset state
  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
    retryCountRef.current = 0
  }, [])

  // Validate request data
  const validateRequestData = useCallback((data: any): boolean => {
    if (!validateInput) return true

    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          const validation = InputValidator.validateCommand(value)
          if (!validation.isValid) {
            logSecurityEvent('api_input_validation_failed', {
              endpoint,
              field: key,
              errors: validation.errors
            }, 'medium')
            setState(prev => ({ 
              ...prev, 
              error: `Invalid input in ${key}: ${validation.errors.join(', ')}` 
            }))
            return false
          }
        }
      }
    }

    return true
  }, [validateInput, endpoint, logSecurityEvent])

  // Make API request
  const makeRequest = useCallback(async (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
    data?: any,
    customEndpoint?: string
  ): Promise<T | null> => {
    const requestEndpoint = customEndpoint || endpoint

    // Security checks
    if (requireAuth && !isAuthenticated) {
      logSecurityEvent('api_unauthorized_access', { endpoint: requestEndpoint }, 'high')
      setState(prev => ({ ...prev, error: 'Authentication required' }))
      return null
    }

    if (!checkRateLimit()) {
      setState(prev => ({ ...prev, error: 'Rate limit exceeded. Please try again later.' }))
      return null
    }

    if (data && !validateRequestData(data)) {
      return null
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const requestOptions: RequestInit = {
        method,
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken })
        }
      }

      if (data && method !== 'GET') {
        requestOptions.body = JSON.stringify(data)
      }

      // Add timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      })

      const requestPromise = secureApiClient.request(requestEndpoint, requestOptions)
      const response = await Promise.race([requestPromise, timeoutPromise])

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const responseData: ApiResponse<T> = await response.json()

      if (!responseData.success) {
        throw new Error(responseData.error || 'API request failed')
      }

      setState({
        data: responseData.data,
        loading: false,
        error: null
      })

      logSecurityEvent('api_request_success', {
        endpoint: requestEndpoint,
        method,
        status: response.status
      }, 'low')

      retryCountRef.current = 0
      return responseData.data

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return null // Request was aborted, don't update state
      }

      const errorMessage = error.message || 'Network error occurred'
      
      logSecurityEvent('api_request_failed', {
        endpoint: requestEndpoint,
        method,
        error: errorMessage,
        attempt: retryCountRef.current + 1
      }, 'medium')

      // Retry logic
      if (enableRetry && retryCountRef.current < maxRetries) {
        retryCountRef.current++
        
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, retryCountRef.current - 1)
        
        setTimeout(() => {
          makeRequest(method, data, customEndpoint)
        }, delay)

        return null
      }

      setState({
        data: null,
        loading: false,
        error: errorMessage
      })

      return null
    }
  }, [
    endpoint,
    requireAuth,
    isAuthenticated,
    checkRateLimit,
    validateRequestData,
    csrfToken,
    enableRetry,
    maxRetries,
    retryDelay,
    timeout,
    logSecurityEvent
  ])

  // Specific HTTP methods
  const get = useCallback((customEndpoint?: string) => 
    makeRequest('GET', undefined, customEndpoint), [makeRequest]
  )

  const post = useCallback((data: any, customEndpoint?: string) => 
    makeRequest('POST', data, customEndpoint), [makeRequest]
  )

  const put = useCallback((data: any, customEndpoint?: string) => 
    makeRequest('PUT', data, customEndpoint), [makeRequest]
  )

  const patch = useCallback((data: any, customEndpoint?: string) => 
    makeRequest('PATCH', data, customEndpoint), [makeRequest]
  )

  const del = useCallback((customEndpoint?: string) => 
    makeRequest('DELETE', undefined, customEndpoint), [makeRequest]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    ...state,
    get,
    post,
    put,
    patch,
    delete: del,
    reset,
    isRetrying: retryCountRef.current > 0,
    retryCount: retryCountRef.current
  }
}

// Hook for secure file uploads
export const useSecureFileUpload = (endpoint: string) => {
  const [uploadState, setUploadState] = useState({
    uploading: false,
    progress: 0,
    error: null as string | null,
    result: null as any
  })

  const { 
    isAuthenticated, 
    checkRateLimit, 
    logSecurityEvent, 
    csrfToken 
  } = useSecurity()

  const upload = useCallback(async (
    file: File,
    additionalData?: Record<string, string>
  ) => {
    if (!isAuthenticated) {
      logSecurityEvent('file_upload_unauthorized', { filename: file.name }, 'high')
      setUploadState(prev => ({ ...prev, error: 'Authentication required' }))
      return null
    }

    if (!checkRateLimit()) {
      setUploadState(prev => ({ ...prev, error: 'Rate limit exceeded' }))
      return null
    }

    // File validation
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      logSecurityEvent('file_upload_size_exceeded', { 
        filename: file.name, 
        size: file.size 
      }, 'medium')
      setUploadState(prev => ({ ...prev, error: 'File too large (max 10MB)' }))
      return null
    }

    // Check file type
    const allowedTypes = ['text/plain', 'application/json', 'text/csv']
    if (!allowedTypes.includes(file.type)) {
      logSecurityEvent('file_upload_invalid_type', { 
        filename: file.name, 
        type: file.type 
      }, 'medium')
      setUploadState(prev => ({ ...prev, error: 'Invalid file type' }))
      return null
    }

    setUploadState({
      uploading: true,
      progress: 0,
      error: null,
      result: null
    })

    try {
      const formData = new FormData()
      formData.append('file', file)
      
      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          formData.append(key, value)
        })
      }

      const xhr = new XMLHttpRequest()

      // Progress tracking
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setUploadState(prev => ({ ...prev, progress }))
        }
      })

      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve(response)
            } catch {
              reject(new Error('Invalid response format'))
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`))
          }
        }

        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.onabort = () => reject(new Error('Upload aborted'))
      })

      xhr.open('POST', endpoint)
      
      if (csrfToken) {
        xhr.setRequestHeader('X-CSRF-Token', csrfToken)
      }

      xhr.send(formData)

      const result = await uploadPromise

      setUploadState({
        uploading: false,
        progress: 100,
        error: null,
        result
      })

      logSecurityEvent('file_upload_success', { 
        filename: file.name, 
        size: file.size 
      }, 'low')

      return result

    } catch (error: any) {
      const errorMessage = error.message || 'Upload failed'
      
      logSecurityEvent('file_upload_failed', { 
        filename: file.name, 
        error: errorMessage 
      }, 'medium')

      setUploadState({
        uploading: false,
        progress: 0,
        error: errorMessage,
        result: null
      })

      return null
    }
  }, [endpoint, isAuthenticated, checkRateLimit, logSecurityEvent, csrfToken])

  return {
    ...uploadState,
    upload
  }
}

// Hook for real-time secure WebSocket connections
export const useSecureWebSocket = (url: string) => {
  const [connectionState, setConnectionState] = useState({
    connected: false,
    connecting: false,
    error: null as string | null,
    lastMessage: null as any
  })

  const { 
    isAuthenticated, 
    logSecurityEvent, 
    csrfToken 
  } = useSecurity()

  const wsRef = useRef<WebSocket | null>(null)
  const messageHandlersRef = useRef<((message: any) => void)[]>([])

  const connect = useCallback(() => {
    if (!isAuthenticated) {
      logSecurityEvent('websocket_unauthorized', { url }, 'high')
      setConnectionState(prev => ({ ...prev, error: 'Authentication required' }))
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return // Already connected
    }

    setConnectionState(prev => ({ ...prev, connecting: true, error: null }))

    try {
      const wsUrl = new URL(url)
      if (csrfToken) {
        wsUrl.searchParams.set('token', csrfToken)
      }

      const ws = new WebSocket(wsUrl.toString())
      wsRef.current = ws

      ws.onopen = () => {
        setConnectionState({
          connected: true,
          connecting: false,
          error: null,
          lastMessage: null
        })
        logSecurityEvent('websocket_connected', { url }, 'low')
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          setConnectionState(prev => ({ ...prev, lastMessage: message }))
          
          // Call message handlers
          messageHandlersRef.current.forEach(handler => handler(message))
          
        } catch (error) {
          logSecurityEvent('websocket_invalid_message', { url, error }, 'medium')
        }
      }

      ws.onerror = () => {
        logSecurityEvent('websocket_error', { url }, 'medium')
        setConnectionState(prev => ({ 
          ...prev, 
          connecting: false, 
          error: 'WebSocket connection error' 
        }))
      }

      ws.onclose = () => {
        setConnectionState(prev => ({ 
          ...prev, 
          connected: false, 
          connecting: false 
        }))
        logSecurityEvent('websocket_disconnected', { url }, 'low')
      }

    } catch (error: any) {
      logSecurityEvent('websocket_connection_failed', { url, error: error.message }, 'medium')
      setConnectionState({
        connected: false,
        connecting: false,
        error: error.message,
        lastMessage: null
      })
    }
  }, [url, isAuthenticated, csrfToken, logSecurityEvent])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      logSecurityEvent('websocket_send_failed', { url, message }, 'medium')
    }
  }, [url, logSecurityEvent])

  const onMessage = useCallback((handler: (message: any) => void) => {
    messageHandlersRef.current.push(handler)
    
    return () => {
      messageHandlersRef.current = messageHandlersRef.current.filter(h => h !== handler)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    ...connectionState,
    connect,
    disconnect,
    sendMessage,
    onMessage
  }
}