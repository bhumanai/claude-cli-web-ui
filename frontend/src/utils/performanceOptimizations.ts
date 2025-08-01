/**
 * Advanced Performance Optimizations for Claude CLI Web UI
 * Implements various performance enhancement techniques
 */

// Memoization utilities
export const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map()
  
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args)
    
    if (cache.has(key)) {
      return cache.get(key)
    }
    
    const result = fn(...args)
    cache.set(key, result)
    
    // Limit cache size to prevent memory leaks
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value
      cache.delete(firstKey)
    }
    
    return result
  }) as T
}

// Debounce for expensive operations
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): T => {
  let timeout: NodeJS.Timeout | null = null
  
  return ((...args: Parameters<T>) => {
    const later = () => {
      timeout = null
      if (!immediate) func(...args)
    }
    
    const callNow = immediate && !timeout
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    
    if (callNow) func(...args)
  }) as T
}

// Throttle for high-frequency operations
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T => {
  let inThrottle = false
  
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }) as T
}

// Virtual scrolling helper
export const calculateVisibleItems = (
  containerHeight: number,
  itemHeight: number,
  scrollTop: number,
  totalItems: number,
  overscan = 5
) => {
  const visibleStart = Math.floor(scrollTop / itemHeight)
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight),
    totalItems - 1
  )
  
  return {
    start: Math.max(0, visibleStart - overscan),
    end: Math.min(totalItems - 1, visibleEnd + overscan),
    offsetY: Math.max(0, visibleStart - overscan) * itemHeight
  }
}

// Image lazy loading optimization
export const createImageLazyLoader = (threshold = 0.1) => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement
          const src = img.dataset.src
          
          if (src) {
            img.src = src
            img.removeAttribute('data-src')
            observer.unobserve(img)
          }
        }
      })
    },
    { threshold }
  )
  
  return {
    observe: (img: HTMLImageElement) => observer.observe(img),
    disconnect: () => observer.disconnect()
  }
}

// Bundle splitting and code loading
export const loadChunkWithRetry = async (
  importFn: () => Promise<any>,
  maxRetries = 3,
  delay = 1000
): Promise<any> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await importFn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
}

// Memory management utilities
export class MemoryManager {
  private static instance: MemoryManager
  private observers: FinalizationRegistry<string>
  private memoryUsage = new Map<string, number>()
  
  private constructor() {
    this.observers = new FinalizationRegistry((key) => {
      this.memoryUsage.delete(key)
    })
  }
  
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager()
    }
    return MemoryManager.instance
  }
  
  track(obj: object, key: string, estimatedSize: number) {
    this.observers.register(obj, key)
    this.memoryUsage.set(key, estimatedSize)
  }
  
  getEstimatedUsage(): number {
    return Array.from(this.memoryUsage.values()).reduce((sum, size) => sum + size, 0)
  }
  
  cleanup() {
    this.memoryUsage.clear()
  }
}

// DOM batch operations
export class DOMBatcher {
  private operations: (() => void)[] = []
  private scheduled = false
  
  add(operation: () => void) {
    this.operations.push(operation)
    this.schedule()
  }
  
  private schedule() {
    if (!this.scheduled) {
      this.scheduled = true
      requestAnimationFrame(() => {
        const ops = [...this.operations]
        this.operations.length = 0
        this.scheduled = false
        
        ops.forEach(op => op())
      })
    }
  }
}

// Performance monitoring
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map()
  private observers: PerformanceObserver[] = []
  
  constructor() {
    this.setupObservers()
  }
  
  private setupObservers() {
    // Long task observer
    if ('PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.addMetric('longTask', entry.duration)
        }
      })
      
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] })
        this.observers.push(longTaskObserver)
      } catch (e) {
        console.warn('Long task observer not supported')
      }
    }
  }
  
  markTime(name: string): () => void {
    const start = performance.now()
    
    return () => {
      const end = performance.now()
      this.addMetric(name, end - start)
    }
  }
  
  private addMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    
    const values = this.metrics.get(name)!
    values.push(value)
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift()
    }
  }
  
  getMetrics(name: string) {
    const values = this.metrics.get(name) || []
    
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0 }
    }
    
    const sum = values.reduce((a, b) => a + b, 0)
    
    return {
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length
    }
  }
  
  getAllMetrics() {
    const result: Record<string, any> = {}
    
    for (const [name] of this.metrics) {
      result[name] = this.getMetrics(name)
    }
    
    return result
  }
  
  cleanup() {
    this.observers.forEach(observer => observer.disconnect())
    this.observers.length = 0
    this.metrics.clear()
  }
}

// Resource loading optimization
export const preloadResource = (
  url: string,
  type: 'script' | 'style' | 'image' | 'fetch' = 'fetch'
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.href = url
    
    switch (type) {
      case 'script':
        link.as = 'script'
        break
      case 'style':
        link.as = 'style'
        break
      case 'image':
        link.as = 'image'
        break
      case 'fetch':
        link.as = 'fetch'
        link.crossOrigin = 'anonymous'
        break
    }
    
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`Failed to preload ${url}`))
    
    document.head.appendChild(link)
  })
}

// Service Worker registration for caching
export const registerServiceWorker = async (swPath = '/sw.js'): Promise<ServiceWorkerRegistration | null> => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(swPath)
      console.log('Service Worker registered:', registration)
      return registration
    } catch (error) {
      console.error('Service Worker registration failed:', error)
      return null
    }
  }
  return null
}

// Global performance optimization singleton
export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer
  private monitor: PerformanceMonitor
  private memoryManager: MemoryManager
  private domBatcher: DOMBatcher
  private lazyLoader: ReturnType<typeof createImageLazyLoader>
  
  private constructor() {
    this.monitor = new PerformanceMonitor()
    this.memoryManager = MemoryManager.getInstance()
    this.domBatcher = new DOMBatcher()
    this.lazyLoader = createImageLazyLoader()
  }
  
  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer()
    }
    return PerformanceOptimizer.instance
  }
  
  get metrics() {
    return this.monitor
  }
  
  get memory() {
    return this.memoryManager
  }
  
  get dom() {
    return this.domBatcher
  }
  
  get images() {
    return this.lazyLoader
  }
  
  cleanup() {
    this.monitor.cleanup()
    this.memoryManager.cleanup()
    this.lazyLoader.disconnect()
  }
}

// Export singleton instance
export const performanceOptimizer = PerformanceOptimizer.getInstance()

// React-specific optimizations
export const shouldComponentUpdate = <T extends Record<string, any>>(
  prevProps: T,
  nextProps: T,
  ignoreKeys: (keyof T)[] = []
): boolean => {
  const prevKeys = Object.keys(prevProps) as (keyof T)[]
  const nextKeys = Object.keys(nextProps) as (keyof T)[]
  
  if (prevKeys.length !== nextKeys.length) return true
  
  for (const key of prevKeys) {
    if (ignoreKeys.includes(key)) continue
    
    if (prevProps[key] !== nextProps[key]) {
      // Deep comparison for objects and arrays
      if (typeof prevProps[key] === 'object' && prevProps[key] !== null) {
        if (JSON.stringify(prevProps[key]) !== JSON.stringify(nextProps[key])) {
          return true
        }
      } else {
        return true
      }
    }
  }
  
  return false
}

// CSS-in-JS optimization
export const createStyleSheet = () => {
  const sheet = new CSSStyleSheet()
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  return sheet
}

// Bundle analysis helper
export const analyzeBundleSize = async () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    const navigation = entries[0]
    
    if (navigation) {
      return {
        transferSize: navigation.transferSize,
        decodedBodySize: navigation.decodedBodySize,
        encodedBodySize: navigation.encodedBodySize,
        compressionRatio: navigation.encodedBodySize / navigation.decodedBodySize
      }
    }
  }
  
  return null
}