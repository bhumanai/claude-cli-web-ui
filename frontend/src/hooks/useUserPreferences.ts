import { useState, useEffect, useCallback } from 'react'
import { Theme } from '../types'
import { useSessionPersistence } from './useSessionPersistence'
import { UserPreferences } from '../services/SessionStorageService'

/**
 * Hook for managing user preferences with automatic persistence
 * Provides type-safe access to user settings with real-time updates
 */
export const useUserPreferences = () => {
  const sessionPersistence = useSessionPersistence()
  const [preferences, setPreferences] = useState<UserPreferences>(() => 
    sessionPersistence.loadPreferences()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Load preferences once session persistence is initialized
  useEffect(() => {
    if (sessionPersistence.isInitialized) {
      const loaded = sessionPersistence.loadPreferences()
      setPreferences(loaded)
      setIsLoading(false)
    }
  }, [sessionPersistence.isInitialized])

  // Listen for cross-tab preference updates
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail.key?.includes('preferences')) {
        const updated = sessionPersistence.loadPreferences()
        setPreferences(updated)
      }
    }

    window.addEventListener('claudeStorageUpdate', handleStorageUpdate)
    return () => window.removeEventListener('claudeStorageUpdate', handleStorageUpdate)
  }, [sessionPersistence])

  // Update preferences with automatic persistence
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    setIsSaving(true)
    
    try {
      const updated = { ...preferences, ...updates }
      setPreferences(updated)
      
      const success = sessionPersistence.savePreferences(updates)
      if (!success) {
        console.error('Failed to save preferences')
        // Revert optimistic update on failure
        setPreferences(prev => prev)
        return false
      }
      
      return true
    } catch (error) {
      console.error('Error updating preferences:', error)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [preferences, sessionPersistence])

  // Specific preference updaters for common operations
  const setTheme = useCallback((theme: Theme) => {
    return updatePreferences({ theme })
  }, [updatePreferences])

  const setFontSize = useCallback((fontSize: UserPreferences['fontSize']) => {
    return updatePreferences({ fontSize })
  }, [updatePreferences])

  const toggleCommandSuggestions = useCallback(() => {
    return updatePreferences({ commandSuggestions: !preferences.commandSuggestions })
  }, [preferences.commandSuggestions, updatePreferences])

  const toggleAutoSave = useCallback(() => {
    return updatePreferences({ autoSave: !preferences.autoSave })
  }, [preferences.autoSave, updatePreferences])

  const toggleNotifications = useCallback(() => {
    return updatePreferences({ notifications: !preferences.notifications })
  }, [preferences.notifications, updatePreferences])

  const toggleSoundEnabled = useCallback(() => {
    return updatePreferences({ soundEnabled: !preferences.soundEnabled })
  }, [preferences.soundEnabled, updatePreferences])

  const toggleAnimations = useCallback(() => {
    return updatePreferences({ animationsEnabled: !preferences.animationsEnabled })
  }, [preferences.animationsEnabled, updatePreferences])

  const toggleCompactMode = useCallback(() => {
    return updatePreferences({ compactMode: !preferences.compactMode })
  }, [preferences.compactMode, updatePreferences])

  const toggleTimestamps = useCallback(() => {
    return updatePreferences({ showTimestamps: !preferences.showTimestamps })
  }, [preferences.showTimestamps, updatePreferences])

  const setMaxHistoryItems = useCallback((maxHistoryItems: number) => {
    return updatePreferences({ maxHistoryItems })
  }, [updatePreferences])

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    const defaults: UserPreferences = {
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
    
    return updatePreferences(defaults)
  }, [updatePreferences])

  // Bulk update with validation
  const updateMultiplePreferences = useCallback((updates: Partial<UserPreferences>) => {
    // Validate updates before applying
    const validUpdates: Partial<UserPreferences> = {}
    
    if (updates.theme && ['light', 'dark'].includes(updates.theme)) {
      validUpdates.theme = updates.theme
    }
    
    if (updates.fontSize && ['small', 'medium', 'large'].includes(updates.fontSize)) {
      validUpdates.fontSize = updates.fontSize
    }
    
    if (typeof updates.commandSuggestions === 'boolean') {
      validUpdates.commandSuggestions = updates.commandSuggestions
    }
    
    if (typeof updates.autoSave === 'boolean') {
      validUpdates.autoSave = updates.autoSave
    }
    
    if (typeof updates.notifications === 'boolean') {
      validUpdates.notifications = updates.notifications
    }
    
    if (typeof updates.soundEnabled === 'boolean') {
      validUpdates.soundEnabled = updates.soundEnabled
    }
    
    if (typeof updates.animationsEnabled === 'boolean') {
      validUpdates.animationsEnabled = updates.animationsEnabled
    }
    
    if (typeof updates.compactMode === 'boolean') {
      validUpdates.compactMode = updates.compactMode
    }
    
    if (typeof updates.showTimestamps === 'boolean') {
      validUpdates.showTimestamps = updates.showTimestamps
    }
    
    if (typeof updates.maxHistoryItems === 'number' && updates.maxHistoryItems > 0) {
      validUpdates.maxHistoryItems = updates.maxHistoryItems
    }
    
    return updatePreferences(validUpdates)
  }, [updatePreferences])

  // Export/import preferences
  const exportPreferences = useCallback((): string => {
    return JSON.stringify(preferences, null, 2)
  }, [preferences])

  const importPreferences = useCallback((data: string): boolean => {
    try {
      const imported = JSON.parse(data) as Partial<UserPreferences>
      return updateMultiplePreferences(imported)
    } catch (error) {
      console.error('Failed to import preferences:', error)
      return false
    }
  }, [updateMultiplePreferences])

  return {
    // State
    preferences,
    isLoading,
    isSaving,
    
    // Core operations
    updatePreferences,
    resetToDefaults,
    updateMultiplePreferences,
    
    // Specific updaters
    setTheme,
    setFontSize,
    setMaxHistoryItems,
    
    // Toggle functions
    toggleCommandSuggestions,
    toggleAutoSave,
    toggleNotifications,
    toggleSoundEnabled,
    toggleAnimations,
    toggleCompactMode,
    toggleTimestamps,
    
    // Import/export
    exportPreferences,
    importPreferences
  }
}

export default useUserPreferences