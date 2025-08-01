/**
 * Service Worker for Claude CLI Web UI
 * Provides caching, offline functionality, and performance optimizations
 */

const CACHE_NAME = 'claude-cli-v2'
const STATIC_CACHE = 'claude-cli-static-v2'
const DYNAMIC_CACHE = 'claude-cli-dynamic-v2'
const API_CACHE = 'claude-cli-api-v2'

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
]

// API endpoints to cache
const CACHED_API_PATTERNS = [
  /\/api\/status/,
  /\/api\/health/,
  /\/api\/user\/preferences/,
  /\/api\/commands\/templates/
]

// Assets to never cache
const NEVER_CACHE = [
  /\/api\/commands\/execute/,
  /\/api\/logs/,
  /\/ws/,
  /hot-update/
]

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
}

// Performance monitoring
let performanceMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  networkRequests: 0,
  offlineRequests: 0
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...')
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then(cache => {
        return cache.addAll(STATIC_ASSETS)
      }),
      
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  )
})

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...')
  
  event.waitUntil(
    Promise.all([
      // Cleanup old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== API_CACHE) {
              console.log('Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      }),
      
      // Claim all clients
      self.clients.claim()
    ])
  )
})

// Fetch event - handle all network requests
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // Skip non-GET requests and certain URLs
  if (request.method !== 'GET' || shouldNeverCache(request)) {
    return
  }
  
  // Determine cache strategy based on request type
  const strategy = getCacheStrategy(request)
  
  event.respondWith(
    handleRequest(request, strategy)
  )
})

// Message event - handle commands from main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data
  
  switch (type) {
    case 'CACHE_API_RESPONSE':
      cacheApiResponse(payload.url, payload.response)
      break
      
    case 'GET_PERFORMANCE_METRICS':
      event.ports[0].postMessage(performanceMetrics)
      break
      
    case 'CLEAR_CACHE':
      clearCache(payload.cacheType)
        .then(() => event.ports[0].postMessage({ success: true }))
        .catch(error => event.ports[0].postMessage({ success: false, error: error.message }))
      break
      
    case 'PRELOAD_RESOURCES':
      preloadResources(payload.urls)
      break
  }
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-commands') {
    event.waitUntil(syncOfflineCommands())
  }
})

// Push notifications (future enhancement)
self.addEventListener('push', (event) => {
  if (!event.data) return
  
  const data = event.data.json()
  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: data.data
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Helper Functions

function shouldNeverCache(request) {
  return NEVER_CACHE.some(pattern => pattern.test(request.url))
}

function getCacheStrategy(request) {
  const url = new URL(request.url)
  
  // API requests
  if (url.pathname.startsWith('/api/')) {
    if (CACHED_API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
      return CACHE_STRATEGIES.STALE_WHILE_REVALIDATE
    }
    return CACHE_STRATEGIES.NETWORK_FIRST
  }
  
  // Static assets
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$/)) {
    return CACHE_STRATEGIES.CACHE_FIRST
  }
  
  // HTML pages
  if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    return CACHE_STRATEGIES.STALE_WHILE_REVALIDATE
  }
  
  return CACHE_STRATEGIES.NETWORK_FIRST
}

async function handleRequest(request, strategy) {
  const url = new URL(request.url)
  
  switch (strategy) {
    case CACHE_STRATEGIES.CACHE_FIRST:
      return cacheFirst(request)
      
    case CACHE_STRATEGIES.NETWORK_FIRST:
      return networkFirst(request)
      
    case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
      return staleWhileRevalidate(request)
      
    case CACHE_STRATEGIES.NETWORK_ONLY:
      return networkOnly(request)
      
    case CACHE_STRATEGIES.CACHE_ONLY:
      return cacheOnly(request)
      
    default:
      return networkFirst(request)
  }
}

async function cacheFirst(request) {
  const cacheName = getCacheName(request)
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)
  
  if (cachedResponse) {
    performanceMetrics.cacheHits++
    return cachedResponse
  }
  
  try {
    performanceMetrics.networkRequests++
    const networkResponse = await fetch(request)
    
    if (networkResponse.status === 200) {
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    performanceMetrics.cacheMisses++
    
    // Return offline fallback if available
    return getOfflineFallback(request)
  }
}

async function networkFirst(request) {
  const cacheName = getCacheName(request)
  
  try {
    performanceMetrics.networkRequests++
    const networkResponse = await fetch(request)
    
    if (networkResponse.status === 200) {
      const cache = await caches.open(cacheName)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    const cache = await caches.open(cacheName)
    const cachedResponse = await cache.match(request)
    
    if (cachedResponse) {
      performanceMetrics.cacheHits++
      return cachedResponse
    }
    
    performanceMetrics.offlineRequests++
    return getOfflineFallback(request)
  }
}

async function staleWhileRevalidate(request) {
  const cacheName = getCacheName(request)
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)
  
  // Fetch fresh version in background
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.status === 200) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  }).catch(() => null)
  
  // Return cached version immediately if available
  if (cachedResponse) {
    performanceMetrics.cacheHits++
    return cachedResponse
  }
  
  // Wait for network if no cache
  performanceMetrics.networkRequests++
  return fetchPromise || getOfflineFallback(request)
}

async function networkOnly(request) {
  performanceMetrics.networkRequests++
  return fetch(request)
}

async function cacheOnly(request) {
  const cacheName = getCacheName(request)
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)
  
  if (cachedResponse) {
    performanceMetrics.cacheHits++
    return cachedResponse
  }
  
  performanceMetrics.cacheMisses++
  return new Response('Not found in cache', { status: 404 })
}

function getCacheName(request) {
  const url = new URL(request.url)
  
  if (url.pathname.startsWith('/api/')) {
    return API_CACHE
  }
  
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$/)) {
    return STATIC_CACHE
  }
  
  return DYNAMIC_CACHE
}

async function getOfflineFallback(request) {
  const url = new URL(request.url)
  
  // Return offline page for navigation requests
  if (request.mode === 'navigate') {
    const cache = await caches.open(STATIC_CACHE)
    return cache.match('/') || new Response('Offline', { status: 503 })
  }
  
  // Return placeholder for API requests
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'This request requires an internet connection',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  return new Response('Resource not available offline', { status: 503 })
}

async function cacheApiResponse(url, responseData) {
  const cache = await caches.open(API_CACHE)
  const response = new Response(JSON.stringify(responseData), {
    headers: { 'Content-Type': 'application/json' }
  })
  
  await cache.put(url, response)
}

async function clearCache(cacheType = 'all') {
  if (cacheType === 'all') {
    const cacheNames = await caches.keys()
    return Promise.all(cacheNames.map(name => caches.delete(name)))
  }
  
  return caches.delete(cacheType)
}

async function preloadResources(urls) {
  const cache = await caches.open(DYNAMIC_CACHE)
  
  return Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url)
        if (response.status === 200) {
          await cache.put(url, response)
        }
      } catch (error) {
        console.warn('Failed to preload:', url, error)
      }
    })
  )
}

async function syncOfflineCommands() {
  // Get offline commands from IndexedDB and sync when online
  // This would integrate with the command history service
  try {
    const registration = await self.registration
    const clients = await registration.clients.matchAll()
    
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_OFFLINE_COMMANDS',
        payload: { status: 'syncing' }
      })
    })
  } catch (error) {
    console.error('Sync failed:', error)
  }
}

// Periodic cleanup of old cache entries
setInterval(async () => {
  const caches_list = await caches.keys()
  
  for (const cacheName of caches_list) {
    const cache = await caches.open(cacheName)
    const requests = await cache.keys()
    
    // Remove entries older than 7 days
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
    
    for (const request of requests) {
      const response = await cache.match(request)
      const dateHeader = response?.headers.get('date')
      
      if (dateHeader && new Date(dateHeader).getTime() < oneWeekAgo) {
        await cache.delete(request)
      }
    }
  }
}, 24 * 60 * 60 * 1000) // Run daily