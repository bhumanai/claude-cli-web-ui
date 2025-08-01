import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Theme } from '@/types'
import { useUserPreferences } from './useUserPreferences'

// Theme context
interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  isLoading: boolean
  isSaving: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/**
 * Theme Provider component
 */
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const userPreferences = useUserPreferences()
  const [theme, setThemeState] = useState<Theme>('dark')
  const [isLoading, setIsLoading] = useState(true)

  // Initialize theme from preferences or system
  useEffect(() => {
    if (!userPreferences.isLoading) {
      const preferenceTheme = userPreferences.preferences.theme
      
      if (preferenceTheme) {
        setThemeState(preferenceTheme)
      } else {
        // Fall back to system preference for new users
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const systemTheme = prefersDark ? 'dark' : 'light'
        setThemeState(systemTheme)
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
          setThemeState(currentTheme)
        }
      }
    }

    window.addEventListener('claudeStorageUpdate', handleStorageUpdate)
    return () => window.removeEventListener('claudeStorageUpdate', handleStorageUpdate)
  }, [userPreferences.isLoading, userPreferences.preferences.theme, theme])

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setThemeState(newTheme)
    await userPreferences.setTheme(newTheme)
  }

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme)
    await userPreferences.setTheme(newTheme)
  }

  const value = {
    theme,
    toggleTheme,
    setTheme,
    isLoading: isLoading || userPreferences.isLoading,
    isSaving: userPreferences.isSaving
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Enhanced theme hook that integrates with the session persistence system
 * Maintains backward compatibility while using the new preference system
 */
export const useTheme = () => {
  const context = useContext(ThemeContext)
  
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  
  return context
}