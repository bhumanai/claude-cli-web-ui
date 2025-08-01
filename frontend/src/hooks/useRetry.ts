import { useState, useCallback, useRef } from 'react'

export interface RetryConfig {
  maxAttempts?: number
  delayMs?: number
  exponentialBackoff?: boolean
  onRetry?: (attempt: number, error: Error) => void
  onMaxAttemptsReached?: (error: Error) => void
  retryCondition?: (error: Error) => boolean
}

interface RetryState {
  isRetrying: boolean
  attempt: number
  lastError: Error | null
  canRetry: boolean
}

export const useRetry = (config: RetryConfig = {}) => {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    exponentialBackoff = true,
    onRetry,
    onMaxAttemptsReached,
    retryCondition = () => true
  } = config

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    attempt: 0,
    lastError: null,
    canRetry: true
  })

  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const calculateDelay = (attempt: number): number => {
    if (!exponentialBackoff) return delayMs
    return delayMs * Math.pow(2, attempt - 1)
  }

  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<T>
  ): Promise<T> => {
    let lastError: Error

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        setState(prev => ({
          ...prev,
          isRetrying: attempt > 1,
          attempt,
          canRetry: attempt < maxAttempts
        }))

        const result = await operation()
        
        // Success - reset state
        setState({
          isRetrying: false,
          attempt: 0,
          lastError: null,
          canRetry: true
        })

        return result
      } catch (error) {
        lastError = error as Error
        
        setState(prev => ({
          ...prev,
          lastError,
          canRetry: attempt < maxAttempts && retryCondition(lastError)
        }))

        // Check if we should retry
        if (attempt < maxAttempts && retryCondition(lastError)) {
          onRetry?.(attempt, lastError)
          
          // Wait before retrying
          const delay = calculateDelay(attempt)
          await new Promise(resolve => {
            timeoutRef.current = setTimeout(resolve, delay)
          })
        } else {
          // Max attempts reached or retry condition failed
          setState(prev => ({
            ...prev,
            isRetrying: false,
            canRetry: false
          }))

          onMaxAttemptsReached?.(lastError)
          break
        }
      }
    }

    throw lastError
  }, [maxAttempts, delayMs, exponentialBackoff, onRetry, onMaxAttemptsReached, retryCondition])

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    setState({
      isRetrying: false,
      attempt: 0,
      lastError: null,
      canRetry: true
    })
  }, [])

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    setState(prev => ({
      ...prev,
      isRetrying: false,
      canRetry: false
    }))
  }, [])

  return {
    ...state,
    executeWithRetry,
    reset,
    cancel
  }
}

// Specialized hook for API calls
export const useApiRetry = (config: RetryConfig = {}) => {
  const defaultRetryCondition = (error: Error) => {
    // Retry on network errors, timeouts, and 5xx server errors
    if (error.name === 'NetworkError' || error.message.includes('fetch')) {
      return true
    }
    
    // Check for HTTP status codes if available
    if ('status' in error) {
      const status = (error as any).status
      return status >= 500 || status === 408 || status === 429
    }
    
    return false
  }

  return useRetry({
    retryCondition: defaultRetryCondition,
    ...config
  })
}

// Specialized hook for WebSocket operations
export const useWebSocketRetry = (config: RetryConfig = {}) => {
  const defaultRetryCondition = (error: Error) => {
    // Retry on connection errors but not on authentication or permission errors
    return !error.message.includes('authentication') && 
           !error.message.includes('permission') &&
           !error.message.includes('unauthorized')
  }

  return useRetry({
    maxAttempts: 5,
    delayMs: 2000,
    exponentialBackoff: true,
    retryCondition: defaultRetryCondition,
    ...config
  })
}

// Helper function to create retryable functions
export const createRetryableFunction = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  config: RetryConfig = {}
) => {
  const { executeWithRetry } = useRetry(config)
  
  return (...args: T) => executeWithRetry(() => fn(...args))
}

export default useRetry