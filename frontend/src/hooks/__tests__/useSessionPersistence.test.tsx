import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSessionPersistence, useUIStateRestoration } from '../useSessionPersistence'

// Mock the SessionStorageService
vi.mock('../services/SessionStorageService', () => {
  const mockService = {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      saveSession: vi.fn().mockReturnValue(true),
      getSession: vi.fn().mockReturnValue({
        sessionId: 'test-session',
        lastActivity: new Date().toISOString(),
        version: '1.2.0',
        created: new Date().toISOString()
      }),
      clearSession: vi.fn(),
      saveCommandHistory: vi.fn().mockReturnValue(true),
      getCommandHistory: vi.fn().mockReturnValue([]),
      addCommandToHistory: vi.fn().mockReturnValue(true),
      savePreferences: vi.fn().mockReturnValue(true),
      getPreferences: vi.fn().mockReturnValue({
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
      }),
      saveViewState: vi.fn().mockReturnValue(true),
      getViewState: vi.fn().mockReturnValue({
        activeView: 'terminal',
        sidebarCollapsed: false,
        terminalHeight: 400,
        splitViewEnabled: false,
        activeTab: 'terminal',
        scrollPosition: 0,
        filters: {},
        sortSettings: {}
      }),
      createBackup: vi.fn().mockReturnValue('{"backup": "data"}'),
      restoreFromBackup: vi.fn().mockReturnValue(true),
      exportData: vi.fn().mockReturnValue('{"export": "data"}'),
      importData: vi.fn().mockReturnValue(true),
      getStorageStats: vi.fn().mockReturnValue({
        totalSize: 1024,
        maxSize: 10485760,
        itemCount: 5,
        metadata: {
          totalSize: 1024,
          lastCleanup: new Date().toISOString(),
          itemCounts: {},
          corruptionEvents: 0
        }
      })
    }))
  }

  return {
    default: mockService,
    SessionStorageService: mockService
  }
})

// Mock timers
vi.useFakeTimers()

describe('useSessionPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('should initialize successfully', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    // Initially restoring
    expect(result.current.isRestoring).toBe(true)
    expect(result.current.isInitialized).toBe(false)

    // Wait for initialization
    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    // Wait for restoration to complete
    act(() => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false)
    })
  })

  it('should handle initialization error', async () => {
    // Mock initialization error
    const SessionStorageService = await import('../services/SessionStorageService')
    const mockService = SessionStorageService.default.getInstance()
    mockService.initialize = vi.fn().mockRejectedValue(new Error('Init failed'))

    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.restorationError).toBe('Init failed')
      expect(result.current.isRestoring).toBe(false)
    })
  })

  it('should save session data', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    act(() => {
      const success = result.current.saveSessionData({ sessionId: 'new-session' })
      expect(success).toBe(true)
    })
  })

  it('should load session data', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    act(() => {
      const session = result.current.loadSessionData()
      expect(session?.sessionId).toBe('test-session')
    })
  })

  it('should save and load command history', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    const testCommand = {
      id: '1',
      command: 'test',
      timestamp: new Date(),
      status: 'completed' as const
    }

    act(() => {
      const success = result.current.saveCommandHistory([testCommand])
      expect(success).toBe(true)
    })

    act(() => {
      const history = result.current.loadCommandHistory()
      expect(Array.isArray(history)).toBe(true)
    })

    act(() => {
      const success = result.current.addCommandToHistory(testCommand)
      expect(success).toBe(true)
    })
  })

  it('should save and load preferences', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    act(() => {
      const success = result.current.savePreferences({ theme: 'light' })
      expect(success).toBe(true)
    })

    act(() => {
      const preferences = result.current.loadPreferences()
      expect(preferences.theme).toBe('dark') // Mocked return value
    })

    act(() => {
      const success = result.current.saveTheme('light')
      expect(success).toBe(true)
    })
  })

  it('should save and load view state', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    act(() => {
      const success = result.current.saveViewState({ activeView: 'tasks' })
      expect(success).toBe(true)
    })

    act(() => {
      const viewState = result.current.loadViewState()
      expect(viewState.activeView).toBe('terminal') // Mocked return value
    })

    act(() => {
      const success = result.current.saveActiveView('tasks')
      expect(success).toBe(true)
    })
  })

  it('should handle backup operations', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    act(() => {
      const backup = result.current.createBackup()
      expect(backup).toBe('{"backup": "data"}')
    })

    act(() => {
      const success = result.current.restoreFromBackup('{"test": "data"}')
      expect(success).toBe(true)
    })

    act(() => {
      const exportData = result.current.exportData()
      expect(exportData).toBe('{"export": "data"}')
    })

    act(() => {
      const success = result.current.importData('{"import": "data"}')
      expect(success).toBe(true)
    })
  })

  it('should get storage stats', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    act(() => {
      const stats = result.current.getStorageStats()
      expect(stats?.totalSize).toBe(1024)
      expect(stats?.itemCount).toBe(5)
    })
  })

  it('should clear session data', async () => {
    const { result } = renderHook(() => useSessionPersistence())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    act(() => {
      result.current.clearSessionData()
    })

    const SessionStorageService = await import('../services/SessionStorageService')
    const mockService = SessionStorageService.default.getInstance()
    expect(mockService.clearSession).toHaveBeenCalled()
  })

  it('should handle service not available gracefully', () => {
    const { result } = renderHook(() => useSessionPersistence())

    // Before initialization
    act(() => {
      const success = result.current.saveSessionData({ sessionId: 'test' })
      expect(success).toBe(false)
    })

    act(() => {
      const session = result.current.loadSessionData()
      expect(session).toBe(null)
    })

    act(() => {
      const history = result.current.loadCommandHistory()
      expect(history).toEqual([])
    })

    act(() => {
      const preferences = result.current.loadPreferences()
      expect(preferences.theme).toBe('dark') // Default values
    })
  })
})

describe('useUIStateRestoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should restore UI state', async () => {
    const { result } = renderHook(() => useUIStateRestoration())

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Wait for restoration
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.preferences).toBeDefined()
    expect(result.current.viewState).toBeDefined()
    expect(result.current.commandHistory).toBeDefined()
  })

  it('should handle restoration error', async () => {
    // Mock useSessionPersistence to return error state
    const mockHook = {
      isInitialized: true,
      loadPreferences: vi.fn().mockImplementation(() => {
        throw new Error('Load failed')
      }),
      loadViewState: vi.fn(),
      loadCommandHistory: vi.fn()
    }

    vi.doMock('../useSessionPersistence', () => ({
      useSessionPersistence: () => mockHook
    }))

    const { result } = renderHook(() => useUIStateRestoration())

    await waitFor(() => {
      expect(result.current.error).toBe('Load failed')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should listen for cross-tab updates', async () => {
    const { result } = renderHook(() => useUIStateRestoration())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Simulate storage update event
    act(() => {
      const event = new CustomEvent('claudeStorageUpdate', {
        detail: { key: 'test-key', newValue: 'test-value' }
      })
      window.dispatchEvent(event)
    })

    // Should trigger state refresh
    await waitFor(() => {
      expect(result.current.preferences).toBeDefined()
    })
  })
})