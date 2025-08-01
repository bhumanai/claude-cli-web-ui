import { useState, useEffect, useCallback, useRef } from 'react'
import { CommandHistory, Theme } from '../types'
import SessionStorageService, { UserPreferences, ViewState } from '../services/SessionStorageService'

// Enhanced session persistence hook with comprehensive data management
export const useSessionPersistence = () => {
  const [isRestoring, setIsRestoring] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const [restorationError, setRestorationError] = useState<string | null>(null)
  const storageService = useRef<SessionStorageService>()
  const autoSaveInterval = useRef<NodeJS.Timeout>()
  const crossTabSyncListener = useRef<(e: Event) => void>()

  // Initialize storage service
  useEffect(() => {
    const initializeStorage = async () => {
      try {
        setIsRestoring(true)
        setRestorationError(null)
        
        storageService.current = SessionStorageService.getInstance()
        await storageService.current.initialize()
        
        setIsInitialized(true)
        
        // Simulate brief loading period for better UX
        setTimeout(() => {
          setIsRestoring(false)
        }, 300)
        
      } catch (error) {
        console.error('Failed to initialize session storage:', error)
        setRestorationError(error instanceof Error ? error.message : 'Unknown error')
        setIsRestoring(false)
      }
    }

    initializeStorage()
    
    return () => {
      if (autoSaveInterval.current) {
        clearInterval(autoSaveInterval.current)
      }
      if (crossTabSyncListener.current) {
        window.removeEventListener('sessionStorageSync', crossTabSyncListener.current)
      }
      storageService.current?.destroy()
    }
  }, [])

  // Auto-save session activity
  useEffect(() => {
    if (!isInitialized || !storageService.current) return

    const updateActivity = () => {
      storageService.current?.saveSession({
        lastActivity: new Date().toISOString()
      })
    }

    // Save activity periodically
    autoSaveInterval.current = setInterval(updateActivity, 30000)

    // Save activity on user interaction
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart']
    const throttledUpdate = throttle(updateActivity, 60000) // Max once per minute

    activityEvents.forEach(event => {
      document.addEventListener(event, throttledUpdate, { passive: true })
    })

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, throttledUpdate)
      })
    }
  }, [isInitialized])

  // Setup cross-tab synchronization
  useEffect(() => {
    if (!isInitialized) return

    crossTabSyncListener.current = (e: Event) => {
      const customEvent = e as CustomEvent
      console.log('Cross-tab storage sync:', customEvent.detail)
      // Components can listen to this event to update their state
      window.dispatchEvent(new CustomEvent('claudeStorageUpdate', {
        detail: customEvent.detail
      }))
    }

    window.addEventListener('sessionStorageSync', crossTabSyncListener.current)
  }, [isInitialized])

  // Session data operations
  const saveSessionData = useCallback((data: Parameters<SessionStorageService['saveSession']>[0]) => {
    if (!storageService.current) return false
    return storageService.current.saveSession(data)
  }, [])

  const loadSessionData = useCallback(() => {
    if (!storageService.current) return null
    return storageService.current.getSession()
  }, [])

  const clearSessionData = useCallback(() => {
    if (!storageService.current) return
    storageService.current.clearSession()
  }, [])

  // Command history operations
  const saveCommandHistory = useCallback((history: CommandHistory[]) => {
    if (!storageService.current) return false
    return storageService.current.saveCommandHistory(history)
  }, [])

  const loadCommandHistory = useCallback((): CommandHistory[] => {
    if (!storageService.current) return []
    return storageService.current.getCommandHistory()
  }, [])

  const addCommandToHistory = useCallback((command: CommandHistory) => {
    if (!storageService.current) return false
    return storageService.current.addCommandToHistory(command)
  }, [])

  // User preferences operations
  const savePreferences = useCallback((preferences: Partial<UserPreferences>) => {
    if (!storageService.current) return false
    return storageService.current.savePreferences(preferences)
  }, [])

  const loadPreferences = useCallback((): UserPreferences => {
    if (!storageService.current) {
      // Return defaults if service not available
      return {
        theme: 'dark',
        fontSize: 'medium',
        commandSuggestions: true,
        autoSave: true,
        notifications: true,
        soundEnabled: false,
        animationsEnabled: true,
        compactMode: false,
        showTimestamps: true,
        maxHistoryItems: 100
      }
    }
    return storageService.current.getPreferences()
  }, [])

  // View state operations
  const saveViewState = useCallback((state: Partial<ViewState>) => {
    if (!storageService.current) return false
    return storageService.current.saveViewState(state)
  }, [])

  const loadViewState = useCallback((): ViewState => {
    if (!storageService.current) {
      // Return defaults if service not available
      return {
        activeView: 'terminal',
        sidebarCollapsed: false,
        terminalHeight: 400,
        splitViewEnabled: false,
        activeTab: 'terminal',
        scrollPosition: 0,
        filters: {},
        sortSettings: {}
      }
    }
    return storageService.current.getViewState()
  }, [])

  // Convenience methods for common operations
  const saveTheme = useCallback((theme: Theme) => {
    return savePreferences({ theme })
  }, [savePreferences])

  const saveActiveView = useCallback((activeView: 'terminal' | 'tasks') => {
    return saveViewState({ activeView })
  }, [saveViewState])

  // Backup and restore operations
  const createBackup = useCallback((): string | null => {
    if (!storageService.current) return null
    return storageService.current.createBackup()
  }, [])

  const restoreFromBackup = useCallback((backupData: string): boolean => {
    if (!storageService.current) return false
    return storageService.current.restoreFromBackup(backupData)
  }, [])

  // Storage statistics and management
  const getStorageStats = useCallback(() => {
    if (!storageService.current) return null
    return storageService.current.getStorageStats()
  }, [])

  const exportData = useCallback((): string | null => {
    if (!storageService.current) return null
    return storageService.current.exportData()
  }, [])

  const importData = useCallback((data: string): boolean => {
    if (!storageService.current) return false
    return storageService.current.importData(data)
  }, [])

  return {
    // State
    isRestoring,
    isInitialized,
    restorationError,
    
    // Session operations
    saveSessionData,
    loadSessionData,
    clearSessionData,
    
    // Command history operations
    saveCommandHistory,
    loadCommandHistory,
    addCommandToHistory,
    
    // User preferences operations
    savePreferences,
    loadPreferences,
    saveTheme,
    
    // View state operations
    saveViewState,
    loadViewState,
    saveActiveView,
    
    // Backup operations
    createBackup,
    restoreFromBackup,
    exportData,
    importData,
    
    // Storage management
    getStorageStats
  }
}

// Throttle utility function
function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
  let inThrottle: boolean
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(null, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }) as T
}

// Hook for restoring UI state on app mount with comprehensive state management
export const useUIStateRestoration = () => {
  const [restoredState, setRestoredState] = useState<{
    preferences?: UserPreferences
    viewState?: ViewState
    commandHistory?: CommandHistory[]
    isLoading: boolean
    error?: string
  }>({ isLoading: true })

  const sessionPersistence = useSessionPersistence()

  useEffect(() => {
    const restoreState = async () => {
      try {
        if (!sessionPersistence.isInitialized) {
          return // Wait for initialization
        }

        const preferences = sessionPersistence.loadPreferences()
        const viewState = sessionPersistence.loadViewState()
        const commandHistory = sessionPersistence.loadCommandHistory()

        setRestoredState({
          preferences,
          viewState,
          commandHistory,
          isLoading: false
        })
      } catch (error) {
        console.error('Failed to restore UI state:', error)
        setRestoredState({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    restoreState()
  }, [sessionPersistence.isInitialized])

  // Listen for cross-tab storage updates
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent
      console.log('Received storage update:', customEvent.detail)
      
      // Refresh state when storage is updated from another tab
      if (sessionPersistence.isInitialized) {
        const preferences = sessionPersistence.loadPreferences()
        const viewState = sessionPersistence.loadViewState()
        const commandHistory = sessionPersistence.loadCommandHistory()
        
        setRestoredState(prev => ({
          ...prev,
          preferences,
          viewState,
          commandHistory
        }))
      }
    }

    window.addEventListener('claudeStorageUpdate', handleStorageUpdate)
    return () => window.removeEventListener('claudeStorageUpdate', handleStorageUpdate)
  }, [sessionPersistence.isInitialized])

  return restoredState
}

export default useSessionPersistence