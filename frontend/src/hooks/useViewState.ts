import { useState, useEffect, useCallback } from 'react'
import { useSessionPersistence } from './useSessionPersistence'
import { ViewState } from '../services/SessionStorageService'

/**
 * Hook for managing application view state with automatic persistence
 * Handles layout settings, active views, and UI state persistence
 */
export const useViewState = () => {
  const sessionPersistence = useSessionPersistence()
  const [viewState, setViewState] = useState<ViewState>(() => 
    sessionPersistence.loadViewState()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Load view state once session persistence is initialized
  useEffect(() => {
    if (sessionPersistence.isInitialized) {
      const loaded = sessionPersistence.loadViewState()
      setViewState(loaded)
      setIsLoading(false)
    }
  }, [sessionPersistence.isInitialized])

  // Listen for cross-tab view state updates
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail.key?.includes('view-state')) {
        const updated = sessionPersistence.loadViewState()
        setViewState(updated)
      }
    }

    window.addEventListener('claudeStorageUpdate', handleStorageUpdate)
    return () => window.removeEventListener('claudeStorageUpdate', handleStorageUpdate)
  }, [sessionPersistence])

  // Update view state with automatic persistence
  const updateViewState = useCallback(async (updates: Partial<ViewState>) => {
    setIsSaving(true)
    
    try {
      const updated = { ...viewState, ...updates }
      setViewState(updated)
      
      const success = sessionPersistence.saveViewState(updates)
      if (!success) {
        console.error('Failed to save view state')
        // Revert optimistic update on failure
        setViewState(prev => prev)
        return false
      }
      
      return true
    } catch (error) {
      console.error('Error updating view state:', error)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [viewState, sessionPersistence])

  // Specific view state updaters
  const setActiveView = useCallback((activeView: ViewState['activeView']) => {
    return updateViewState({ activeView })
  }, [updateViewState])

  const toggleSidebar = useCallback(() => {
    return updateViewState({ sidebarCollapsed: !viewState.sidebarCollapsed })
  }, [viewState.sidebarCollapsed, updateViewState])

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    return updateViewState({ sidebarCollapsed: collapsed })
  }, [updateViewState])

  const setTerminalHeight = useCallback((height: number) => {
    // Validate height within reasonable bounds
    const clampedHeight = Math.max(200, Math.min(800, height))
    return updateViewState({ terminalHeight: clampedHeight })
  }, [updateViewState])

  const toggleSplitView = useCallback(() => {
    return updateViewState({ splitViewEnabled: !viewState.splitViewEnabled })
  }, [viewState.splitViewEnabled, updateViewState])

  const setSplitViewEnabled = useCallback((enabled: boolean) => {
    return updateViewState({ splitViewEnabled: enabled })
  }, [updateViewState])

  const setActiveTab = useCallback((tab: string) => {
    return updateViewState({ activeTab: tab })
  }, [updateViewState])

  const setScrollPosition = useCallback((position: number) => {
    // Throttle scroll position updates to avoid excessive saves
    return updateViewState({ scrollPosition: Math.max(0, position) })
  }, [updateViewState])

  // Filter management
  const setFilter = useCallback((key: string, value: any) => {
    const updatedFilters = { ...viewState.filters, [key]: value }
    return updateViewState({ filters: updatedFilters })
  }, [viewState.filters, updateViewState])

  const removeFilter = useCallback((key: string) => {
    const updatedFilters = { ...viewState.filters }
    delete updatedFilters[key]
    return updateViewState({ filters: updatedFilters })
  }, [viewState.filters, updateViewState])

  const clearFilters = useCallback(() => {
    return updateViewState({ filters: {} })
  }, [updateViewState])

  // Sort settings management
  const setSortSetting = useCallback((key: string, value: any) => {
    const updatedSortSettings = { ...viewState.sortSettings, [key]: value }
    return updateViewState({ sortSettings: updatedSortSettings })
  }, [viewState.sortSettings, updateViewState])

  const removeSortSetting = useCallback((key: string) => {
    const updatedSortSettings = { ...viewState.sortSettings }
    delete updatedSortSettings[key]
    return updateViewState({ sortSettings: updatedSortSettings })
  }, [viewState.sortSettings, updateViewState])

  const clearSortSettings = useCallback(() => {
    return updateViewState({ sortSettings: {} })
  }, [updateViewState])

  // Layout presets
  const applyLayoutPreset = useCallback((preset: 'default' | 'compact' | 'split' | 'fullscreen') => {
    switch (preset) {
      case 'default':
        return updateViewState({
          sidebarCollapsed: false,
          splitViewEnabled: false,
          terminalHeight: 400,
          activeView: 'terminal'
        })
      
      case 'compact':
        return updateViewState({
          sidebarCollapsed: true,
          splitViewEnabled: false,
          terminalHeight: 300,
          activeView: 'terminal'
        })
      
      case 'split':
        return updateViewState({
          sidebarCollapsed: false,
          splitViewEnabled: true,
          terminalHeight: 400,
          activeView: 'terminal'
        })
      
      case 'fullscreen':
        return updateViewState({
          sidebarCollapsed: true,
          splitViewEnabled: false,
          terminalHeight: 600,
          activeView: 'terminal'
        })
      
      default:
        return false
    }
  }, [updateViewState])

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    const defaults: ViewState = {
      activeView: 'terminal',
      sidebarCollapsed: false,
      terminalHeight: 400,
      splitViewEnabled: false,
      activeTab: 'terminal',
      scrollPosition: 0,
      filters: {},
      sortSettings: {}
    }
    
    return updateViewState(defaults)
  }, [updateViewState])

  // Bulk update with validation
  const updateMultipleViewSettings = useCallback((updates: Partial<ViewState>) => {
    // Validate updates before applying
    const validUpdates: Partial<ViewState> = {}
    
    if (updates.activeView && ['terminal', 'tasks'].includes(updates.activeView)) {
      validUpdates.activeView = updates.activeView
    }
    
    if (typeof updates.sidebarCollapsed === 'boolean') {
      validUpdates.sidebarCollapsed = updates.sidebarCollapsed
    }
    
    if (typeof updates.terminalHeight === 'number' && updates.terminalHeight > 0) {
      validUpdates.terminalHeight = Math.max(200, Math.min(800, updates.terminalHeight))
    }
    
    if (typeof updates.splitViewEnabled === 'boolean') {
      validUpdates.splitViewEnabled = updates.splitViewEnabled
    }
    
    if (typeof updates.activeTab === 'string') {
      validUpdates.activeTab = updates.activeTab
    }
    
    if (typeof updates.scrollPosition === 'number' && updates.scrollPosition >= 0) {
      validUpdates.scrollPosition = updates.scrollPosition
    }
    
    if (updates.filters && typeof updates.filters === 'object') {
      validUpdates.filters = updates.filters
    }
    
    if (updates.sortSettings && typeof updates.sortSettings === 'object') {
      validUpdates.sortSettings = updates.sortSettings
    }
    
    return updateViewState(validUpdates)
  }, [updateViewState])

  // Export/import view state
  const exportViewState = useCallback((): string => {
    return JSON.stringify(viewState, null, 2)
  }, [viewState])

  const importViewState = useCallback((data: string): boolean => {
    try {
      const imported = JSON.parse(data) as Partial<ViewState>
      return updateMultipleViewSettings(imported)
    } catch (error) {
      console.error('Failed to import view state:', error)
      return false
    }
  }, [updateMultipleViewSettings])

  // Computed properties for easier access
  const isTerminalActive = viewState.activeView === 'terminal'
  const isTasksActive = viewState.activeView === 'tasks'
  const isSidebarVisible = !viewState.sidebarCollapsed
  const isSplitViewActive = viewState.splitViewEnabled

  return {
    // State
    viewState,
    isLoading,
    isSaving,
    
    // Computed properties
    isTerminalActive,
    isTasksActive,
    isSidebarVisible,
    isSplitViewActive,
    
    // Core operations
    updateViewState,
    resetToDefaults,
    updateMultipleViewSettings,
    
    // View control
    setActiveView,
    setActiveTab,
    
    // Layout control
    toggleSidebar,
    setSidebarCollapsed,
    setTerminalHeight,
    toggleSplitView,
    setSplitViewEnabled,
    setScrollPosition,
    
    // Filter management
    setFilter,
    removeFilter,
    clearFilters,
    
    // Sort management
    setSortSetting,
    removeSortSetting,
    clearSortSettings,
    
    // Layout presets
    applyLayoutPreset,
    
    // Import/export
    exportViewState,
    importViewState
  }
}

export default useViewState