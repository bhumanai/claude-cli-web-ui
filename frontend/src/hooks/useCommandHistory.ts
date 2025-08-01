import { useState, useEffect, useCallback } from 'react'
import { useSessionPersistence } from './useSessionPersistence'
import { CommandHistory } from '../types'

/**
 * Enhanced command history hook that provides navigation and persistence
 * Integrates with the session persistence system while maintaining backward compatibility
 */
export const useCommandHistory = () => {
  const sessionPersistence = useSessionPersistence()
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(true)

  // Load history from session persistence or legacy localStorage
  useEffect(() => {
    const loadHistory = () => {
      if (sessionPersistence.isInitialized) {
        // Try to load from new session persistence system first
        const fullHistory = sessionPersistence.loadCommandHistory()
        if (fullHistory.length > 0) {
          const commandStrings = fullHistory.map(cmd => cmd.command)
          setHistory(commandStrings)
        } else {
          // Fall back to legacy localStorage for backward compatibility
          const savedHistory = localStorage.getItem('claude-cli-command-history')
          if (savedHistory) {
            try {
              const parsed = JSON.parse(savedHistory)
              setHistory(Array.isArray(parsed) ? parsed : [])
              
              // Migrate to new system
              const migrated: CommandHistory[] = parsed.map((cmd: string, index: number) => ({
                id: `migrated_${Date.now()}_${index}`,
                command: cmd,
                timestamp: new Date(),
                status: 'completed' as const
              }))
              sessionPersistence.saveCommandHistory(migrated)
            } catch (error) {
              console.error('Failed to parse legacy command history:', error)
            }
          }
        }
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [sessionPersistence.isInitialized])

  // Listen for cross-tab history updates
  useEffect(() => {
    const handleStorageUpdate = () => {
      if (sessionPersistence.isInitialized) {
        const fullHistory = sessionPersistence.loadCommandHistory()
        const commandStrings = fullHistory.map(cmd => cmd.command)
        setHistory(commandStrings)
      }
    }

    window.addEventListener('claudeStorageUpdate', handleStorageUpdate)
    return () => window.removeEventListener('claudeStorageUpdate', handleStorageUpdate)
  }, [sessionPersistence])

  const addCommand = useCallback((command: string) => {
    if (command.trim()) {
      const trimmedCommand = command.trim()
      
      setHistory(prev => {
        // Remove duplicates and add to end
        const filtered = prev.filter(cmd => cmd !== trimmedCommand)
        const newHistory = [...filtered, trimmedCommand]
        
        // Keep only last 100 commands
        const trimmed = newHistory.slice(-100)
        
        // Save to both new system and legacy localStorage for compatibility
        if (sessionPersistence.isInitialized) {
          const fullHistory = sessionPersistence.loadCommandHistory()
          const newFullCommand: CommandHistory = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            command: trimmedCommand,
            timestamp: new Date(),
            status: 'completed'
          }
          
          // Remove duplicates from full history and add new command
          const filteredFullHistory = fullHistory.filter(cmd => cmd.command !== trimmedCommand)
          const updatedFullHistory = [...filteredFullHistory, newFullCommand].slice(-100)
          
          sessionPersistence.saveCommandHistory(updatedFullHistory)
        }
        
        // Maintain legacy localStorage for backward compatibility
        localStorage.setItem('claude-cli-command-history', JSON.stringify(trimmed))
        
        return trimmed
      })
      setHistoryIndex(-1)
    }
  }, [sessionPersistence])

  const getPreviousCommand = useCallback(() => {
    if (history.length === 0) return ''
    
    const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
    setHistoryIndex(newIndex)
    return history[newIndex] || ''
  }, [history, historyIndex])

  const getNextCommand = useCallback(() => {
    if (historyIndex === -1) return ''
    
    const newIndex = Math.min(history.length - 1, historyIndex + 1)
    setHistoryIndex(newIndex)
    
    if (newIndex === history.length - 1) {
      setHistoryIndex(-1)
      return ''
    }
    
    return history[newIndex] || ''
  }, [history, historyIndex])

  const resetIndex = useCallback(() => {
    setHistoryIndex(-1)
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    setHistoryIndex(-1)
    
    // Clear from both systems
    if (sessionPersistence.isInitialized) {
      sessionPersistence.saveCommandHistory([])
    }
    localStorage.removeItem('claude-cli-command-history')
  }, [sessionPersistence])

  // Additional utility methods for enhanced functionality
  const searchHistory = useCallback((query: string) => {
    if (!query.trim()) return history
    
    const lowerQuery = query.toLowerCase()
    return history.filter(cmd => cmd.toLowerCase().includes(lowerQuery))
  }, [history])

  const getRecentCommands = useCallback((limit: number = 10) => {
    return history.slice(-limit).reverse()
  }, [history])

  const getPopularCommands = useCallback((limit: number = 10) => {
    const commandCounts = history.reduce((acc, cmd) => {
      acc[cmd] = (acc[cmd] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(commandCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([command, count]) => ({ command, count }))
  }, [history])

  const hasCommand = useCallback((command: string) => {
    return history.includes(command.trim())
  }, [history])

  const removeCommand = useCallback((command: string) => {
    const trimmedCommand = command.trim()
    setHistory(prev => {
      const filtered = prev.filter(cmd => cmd !== trimmedCommand)
      
      // Update both systems
      if (sessionPersistence.isInitialized) {
        const fullHistory = sessionPersistence.loadCommandHistory()
        const filteredFullHistory = fullHistory.filter(cmd => cmd.command !== trimmedCommand)
        sessionPersistence.saveCommandHistory(filteredFullHistory)
      }
      
      localStorage.setItem('claude-cli-command-history', JSON.stringify(filtered))
      return filtered
    })
    
    // Reset index if we're currently on the removed command
    setHistoryIndex(-1)
  }, [sessionPersistence])

  const exportHistory = useCallback(() => {
    return JSON.stringify(history, null, 2)
  }, [history])

  const importHistory = useCallback((data: string) => {
    try {
      const imported = JSON.parse(data)
      if (Array.isArray(imported)) {
        const validCommands = imported.filter(cmd => typeof cmd === 'string' && cmd.trim())
        setHistory(validCommands)
        
        // Update both systems
        if (sessionPersistence.isInitialized) {
          const fullHistory: CommandHistory[] = validCommands.map((cmd, index) => ({
            id: `imported_${Date.now()}_${index}`,
            command: cmd,
            timestamp: new Date(),
            status: 'completed'
          }))
          sessionPersistence.saveCommandHistory(fullHistory)
        }
        
        localStorage.setItem('claude-cli-command-history', JSON.stringify(validCommands))
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to import history:', error)
      return false
    }
  }, [sessionPersistence])

  return {
    // Core functionality (backward compatible)
    history,
    addCommand,
    getPreviousCommand,
    getNextCommand,
    resetIndex,
    clearHistory,
    
    // Enhanced functionality
    searchHistory,
    getRecentCommands,
    getPopularCommands,
    hasCommand,
    removeCommand,
    exportHistory,
    importHistory,
    
    // State information
    isLoading,
    currentIndex: historyIndex,
    totalCommands: history.length,
    hasNext: historyIndex > 0,
    hasPrevious: historyIndex < history.length - 1
  }
}