/**
 * React hook for Service Worker integration
 * Provides caching, offline functionality, and performance monitoring
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { registerServiceWorker } from '../utils/performanceOptimizations'

interface ServiceWorkerState {
  isSupported: boolean
  isRegistered: boolean
  isOnline: boolean
  updateAvailable: boolean
  cacheMetrics: {
    cacheHits: number
    cacheMisses: number
    networkRequests: number
    offlineRequests: number
  }
}

interface UseServiceWorkerOptions {
  swPath?: string
  enableUpdateCheck?: boolean
  enableOfflineSupport?: boolean
  enablePerformanceMonitoring?: boolean
}

export const useServiceWorker = (options: UseServiceWorkerOptions = {}) => {
  const {
    swPath = '/sw.js',
    enableUpdateCheck = true,
    enableOfflineSupport = true,
    enablePerformanceMonitoring = true
  } = options

  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: 'serviceWorker' in navigator,
    isRegistered: false,
    isOnline: navigator.onLine,
    updateAvailable: false,
    cacheMetrics: {
      cacheHits: 0,
      cacheMisses: 0,
      networkRequests: 0,
      offlineRequests: 0
    }
  })

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const metricsIntervalRef = useRef<NodeJS.Timeout>()

  // Register service worker
  const registerSW = useCallback(async () => {
    if (!state.isSupported) return

    try {
      const registration = await registerServiceWorker(swPath)
      
      if (registration) {
        registrationRef.current = registration
        setState(prev => ({ ...prev, isRegistered: true }))

        // Check for updates
        if (enableUpdateCheck) {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setState(prev => ({ ...prev, updateAvailable: true }))
                }
              })
            }
          })
        }

        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', handleSWMessage)
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error)
    }
  }, [state.isSupported, swPath, enableUpdateCheck])

  // Handle service worker messages
  const handleSWMessage = useCallback((event: MessageEvent) => {
    const { type, payload } = event.data

    switch (type) {
      case 'SYNC_OFFLINE_COMMANDS':
        // Handle offline command sync
        console.log('Syncing offline commands:', payload)
        break

      case 'CACHE_UPDATED':
        // Refresh cache metrics
        if (enablePerformanceMonitoring) {
          getPerformanceMetrics()
        }
        break
    }
  }, [enablePerformanceMonitoring])

  // Get performance metrics from service worker
  const getPerformanceMetrics = useCallback(async () => {
    if (!registrationRef.current?.active) return

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel()
      
      messageChannel.port1.onmessage = (event) => {
        const metrics = event.data
        setState(prev => ({ ...prev, cacheMetrics: metrics }))
        resolve(metrics)
      }

      registrationRef.current!.active!.postMessage(
        { type: 'GET_PERFORMANCE_METRICS' },
        [messageChannel.port2]
      )
    })
  }, [])

  // Update service worker
  const updateServiceWorker = useCallback(async () => {
    if (!registrationRef.current) return

    const registration = registrationRef.current
    
    if (registration.waiting) {
      // Tell the waiting service worker to skip waiting
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      
      // Reload the page to use the new service worker
      window.location.reload()
    }
  }, [])

  // Clear cache
  const clearCache = useCallback(async (cacheType = 'all') => {
    if (!registrationRef.current?.active) return

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel()
      
      messageChannel.port1.onmessage = (event) => {
        const { success, error } = event.data
        if (success) {
          resolve(true)
        } else {
          reject(new Error(error))
        }
      }

      registrationRef.current!.active!.postMessage(
        { type: 'CLEAR_CACHE', payload: { cacheType } },
        [messageChannel.port2]
      )
    })
  }, [])

  // Preload resources
  const preloadResources = useCallback((urls: string[]) => {
    if (!registrationRef.current?.active) return

    registrationRef.current.active.postMessage({
      type: 'PRELOAD_RESOURCES',
      payload: { urls }
    })
  }, [])

  // Cache API response
  const cacheApiResponse = useCallback((url: string, response: any) => {
    if (!registrationRef.current?.active || !enableOfflineSupport) return

    registrationRef.current.active.postMessage({
      type: 'CACHE_API_RESPONSE',
      payload: { url, response }
    })
  }, [enableOfflineSupport])

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setState(prev => ({ ...prev, isOnline: true }))
    const handleOffline = () => setState(prev => ({ ...prev, isOnline: false }))

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Performance metrics polling
  useEffect(() => {
    if (enablePerformanceMonitoring && state.isRegistered) {
      metricsIntervalRef.current = setInterval(() => {
        getPerformanceMetrics()
      }, 30000) // Update every 30 seconds
    }

    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current)
      }
    }
  }, [enablePerformanceMonitoring, state.isRegistered, getPerformanceMetrics])

  // Register service worker on mount
  useEffect(() => {
    registerSW()
  }, [registerSW])

  // Cleanup
  useEffect(() => {
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage)
      
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current)
      }
    }
  }, [handleSWMessage])

  return {
    ...state,
    
    // Actions
    updateServiceWorker,
    clearCache,
    preloadResources,
    cacheApiResponse,
    getPerformanceMetrics,
    
    // Utilities
    isOffline: !state.isOnline,
    canUseCache: state.isSupported && state.isRegistered,
    
    // Performance data
    cacheHitRate: state.cacheMetrics.cacheHits > 0 
      ? (state.cacheMetrics.cacheHits / (state.cacheMetrics.cacheHits + state.cacheMetrics.cacheMisses)) * 100
      : 0
  }
}

// Hook for offline-first data fetching
export const useOfflineFirst = <T>(
  fetcher: () => Promise<T>,
  key: string,
  options: {
    enabled?: boolean
    cacheTime?: number
    staleTime?: number
  } = {}
) => {
  const { enabled = true, cacheTime = 5 * 60 * 1000, staleTime = 30 * 1000 } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isStale, setIsStale] = useState(false)
  
  const { cacheApiResponse, isOnline } = useServiceWorker()
  const cacheKeyRef = useRef(`offline-first-${key}`)
  const lastFetchRef = useRef<number>(0)

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return

    const now = Date.now()
    const isStaleData = now - lastFetchRef.current > staleTime
    
    // Return cached data if not stale and not forcing refresh
    if (!forceRefresh && !isStaleData && data) {
      return data
    }

    setLoading(true)
    setError(null)
    
    try {
      // Try to fetch fresh data
      const freshData = await fetcher()
      
      // Cache the response
      cacheApiResponse(cacheKeyRef.current, freshData)
      
      setData(freshData)
      setIsStale(false)
      lastFetchRef.current = now
      
      return freshData
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Fetch failed')
      
      // If we have cached data and we're offline, use it
      if (data && !isOnline) {
        setIsStale(true)
        setError(fetchError)
        return data
      }
      
      setError(fetchError)
      throw fetchError
    } finally {
      setLoading(false)
    }
  }, [enabled, data, staleTime, fetcher, cacheApiResponse, isOnline])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Refetch when coming back online
  useEffect(() => {
    if (isOnline && data && isStale) {
      fetchData()
    }
  }, [isOnline, data, isStale, fetchData])

  return {
    data,
    loading,
    error,
    isStale,
    refetch: () => fetchData(true),
    isOffline: !isOnline
  }
}