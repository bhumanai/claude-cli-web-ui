import { useState, useEffect } from 'react'
import { Theme } from '@/types'
import { useUserPreferences } from './useUserPreferences'

/**
 * Enhanced theme hook that integrates with the session persistence system
 * Maintains backward compatibility while using the new preference system
 */
export const useTheme = () => {
  const userPreferences = useUserPreferences()
  const [theme, setTheme] = useState<Theme>('dark')
  const [isLoading, setIsLoading] = useState(true)

  // Initialize theme from preferences or system
  useEffect(() => {
    if (!userPreferences.isLoading) {
      const preferenceTheme = userPreferences.preferences.theme
      
      if (preferenceTheme) {
        setTheme(preferenceTheme)
      } else {
        // Fall back to system preference for new users
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const systemTheme = prefersDark ? 'dark' : 'light'
        setTheme(systemTheme)
        // Save system preference
        userPreferences.setTheme(systemTheme)
      }
      
      setIsLoading(false)
    }
  }, [userPreferences.isLoading, userPreferences.preferences.theme])

  // Apply theme to document
  useEffect(() => {
    if (!isLoading) {
      const root = window.document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
      
      // Also maintain legacy localStorage for backward compatibility
      localStorage.setItem('claude-cli-theme', theme)
    }
  }, [theme, isLoading])

  // Listen for preference changes from other tabs/components
  useEffect(() => {
    const handleStorageUpdate = () => {
      if (!userPreferences.isLoading) {
        const currentTheme = userPreferences.preferences.theme
        if (currentTheme !== theme) {
          setTheme(currentTheme)
        }
      }
    }

    window.addEventListener('claudeStorageUpdate', handleStorageUpdate)
    return () => window.removeEventListener('claudeStorageUpdate', handleStorageUpdate)
  }, [userPreferences.isLoading, userPreferences.preferences.theme, theme])

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    await userPreferences.setTheme(newTheme)
  }

  const setThemeDirectly = async (newTheme: Theme) => {
    setTheme(newTheme)
    await userPreferences.setTheme(newTheme)
  }

  return { 
    theme, 
    toggleTheme, 
    setTheme: setThemeDirectly,
    isLoading: isLoading || userPreferences.isLoading,
    isSaving: userPreferences.isSaving
  }
}