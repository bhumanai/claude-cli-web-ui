/**
 * useProfileIntegration - React hook for profile-specific functionality
 * Integrates API service, config service, and command history for seamless profile experience
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { UserProfile } from '../components/ProfileSelector'
import { profileApiService } from '../services/ProfileApiService'
import { profileConfigService, type ProfileConfig } from '../services/ProfileConfigService'
import { commandHistoryService, type CommandEntry, type CommandSuggestion } from '../services/CommandHistoryService'

interface ProfileState {
  currentProfile: UserProfile
  config: ProfileConfig
  isApiAvailable: boolean
  isLoading: boolean
  error: string | null
}

interface CommandExecutionResult {
  output: string
  exitCode: number
  duration: number
  success: boolean
}

export const useProfileIntegration = () => {
  const [state, setState] = useState<ProfileState>({
    currentProfile: 'general',
    config: profileConfigService.getConfig(),
    isApiAvailable: false,
    isLoading: false,
    error: null
  })

  const wsRef = useRef<WebSocket | null>(null)
  const [realtimeData, setRealtimeData] = useState<any>(null)

  // Initialize profile system
  useEffect(() => {
    const initializeProfile = async () => {
      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        // Load saved profile
        const savedProfile = profileConfigService.getSelectedProfile()
        
        // Check API availability
        const apiAvailable = await profileApiService.healthCheck()
        
        setState(prev => ({
          ...prev,
          currentProfile: savedProfile,
          isApiAvailable: apiAvailable,
          isLoading: false
        }))

        // Setup WebSocket for real-time data if API is available
        if (apiAvailable) {
          setupWebSocket()
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to initialize profile',
          isLoading: false
        }))
      }
    }

    initializeProfile()

    // Subscribe to config changes
    const unsubscribe = profileConfigService.subscribe((config) => {
      setState(prev => ({ ...prev, config }))
    })

    return () => {
      unsubscribe()
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const setupWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    wsRef.current = profileApiService.connectWebSocket(
      (data) => setRealtimeData(data),
      (error) => console.error('WebSocket error:', error)
    )
  }, [])

  // Profile management
  const switchProfile = useCallback(async (profile: UserProfile) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      profileConfigService.setSelectedProfile(profile)
      setState(prev => ({
        ...prev,
        currentProfile: profile,
        isLoading: false
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to switch profile',
        isLoading: false
      }))
    }
  }, [])

  // Command execution with profile context
  const executeCommand = useCallback(async (
    command: string,
    options: { useApi?: boolean; saveToHistory?: boolean } = {}
  ): Promise<CommandExecutionResult> => {
    const { useApi = true, saveToHistory = true } = options
    const startTime = Date.now()

    try {
      let result: CommandExecutionResult

      if (useApi && state.isApiAvailable) {
        // Execute via API
        const response = await profileApiService.executeCommand(command, state.currentProfile)
        
        if (response.success && response.data) {
          result = {
            output: response.data.output,
            exitCode: response.data.exitCode,
            duration: response.data.duration,
            success: response.data.exitCode === 0
          }
        } else {
          throw new Error(response.error || 'Command execution failed')
        }
      } else {
        // Fallback to mock execution
        result = await executeCommandMock(command, state.currentProfile)
      }

      // Save to history if requested
      if (saveToHistory) {
        commandHistoryService.addCommand(command, state.currentProfile, {
          duration: result.duration,
          exitCode: result.exitCode,
          output: result.output
        })
      }

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      const errorResult: CommandExecutionResult = {
        output: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        duration,
        success: false
      }

      if (saveToHistory) {
        commandHistoryService.addCommand(command, state.currentProfile, {
          duration: errorResult.duration,
          exitCode: errorResult.exitCode,
          output: errorResult.output
        })
      }

      return errorResult
    }
  }, [state.currentProfile, state.isApiAvailable])

  // Mock command execution for offline mode
  const executeCommandMock = async (
    command: string, 
    profile: UserProfile
  ): Promise<CommandExecutionResult> => {
    const delay = Math.random() * 1000 + 200 // 200-1200ms delay
    await new Promise(resolve => setTimeout(resolve, delay))

    const mockResponses: Record<UserProfile, Record<string, string>> = {
      developer: {
        'git status': 'On branch main\nYour branch is up to date with \'origin/main\'.\n\nnothing to commit, working tree clean',
        'npm run build': 'Build completed successfully in 2.3s\nBundle size: 344KB (98KB gzipped)',
        'npm test': 'Test Suites: 5 passed, 5 total\nTests: 42 passed, 42 total',
        'git log': 'commit a2f3b8c (HEAD -> main)\nAuthor: Developer\nDate: Today\n\n    feat: add profile features'
      },
      analyst: {
        'data query': 'Query executed successfully\nRows returned: 1,245\nExecution time: 156ms',
        'data export': 'Data exported to data_export_2025.csv\nRecords: 1,245 rows',
        'data stats': 'Dataset Statistics:\nTotal records: 1,245\nColumns: 8\nLast updated: 2 hours ago'
      },
      devops: {
        'logs tail': 'Streaming logs from production...\n[INFO] Service healthy\n[INFO] Processing requests',
        'health check': 'All services operational\nAPI Gateway: ✓ Healthy\nDatabase: ✓ Healthy\nCache: ✓ Healthy',
        'deploy status': 'Latest deployment: SUCCESS\nVersion: v1.2.3\nDeployed: 15 minutes ago'
      },
      general: {
        'help': 'Available commands:\n  help - Show this help\n  status - System status\n  history - Command history',
        'status': 'System Status: ✓ Operational\nUptime: 2d 4h 23m\nMemory: 45% used',
        'history': 'Recent commands:\n  1. help\n  2. status\n  3. git status'
      }
    }

    const profileCommands = mockResponses[profile] || mockResponses.general
    const output = profileCommands[command] || profileCommands[Object.keys(profileCommands)[0]] || `Executed: ${command}`

    return {
      output,
      exitCode: 0,
      duration: Math.round(delay),
      success: true
    }
  }

  // Profile-specific data fetching
  const fetchProfileData = useCallback(async (dataType: string) => {
    if (!state.isApiAvailable) return null

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      let response
      
      switch (state.currentProfile) {
        case 'developer':
          if (dataType === 'git') {
            response = await profileApiService.getGitData()
          } else if (dataType === 'builds') {
            response = await profileApiService.getBuildData()
          }
          break
          
        case 'analyst':
          if (dataType === 'datasets') {
            response = await profileApiService.getDatasets()
          }
          break
          
        case 'devops':
          if (dataType === 'logs') {
            response = await profileApiService.getLogs()
          } else if (dataType === 'metrics') {
            response = await profileApiService.getSystemMetrics()
          }
          break
          
        case 'general':
          if (dataType === 'tutorials') {
            response = await profileApiService.getTutorials()
          }
          break
      }

      setState(prev => ({ ...prev, isLoading: false }))
      return response?.data || null
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch data',
        isLoading: false
      }))
      return null
    }
  }, [state.currentProfile, state.isApiAvailable])

  // Command suggestions and autocomplete
  const getCommandSuggestions = useCallback((partial?: string): CommandSuggestion[] => {
    if (partial) {
      return commandHistoryService.getAutocompleteSuggestions(partial, state.currentProfile)
        .map(command => ({
          command,
          description: `Execute: ${command}`,
          category: 'History',
          frequency: 1,
          lastUsed: new Date(),
          profile: state.currentProfile
        }))
    }
    
    return commandHistoryService.getSuggestions(state.currentProfile, 10)
  }, [state.currentProfile])

  // Command history management
  const getCommandHistory = useCallback((limit = 50): CommandEntry[] => {
    return commandHistoryService.getHistory(state.currentProfile, limit)
  }, [state.currentProfile])

  const searchCommandHistory = useCallback((query: string): CommandEntry[] => {
    return commandHistoryService.searchHistory(query, state.currentProfile)
  }, [state.currentProfile])

  // Profile preferences
  const updateProfilePreferences = useCallback((updates: any) => {
    const profileKey = state.currentProfile as keyof ProfileConfig['preferences']
    profileConfigService.updateProfilePreferences(profileKey, updates)
  }, [state.currentProfile])

  const getProfilePreferences = useCallback(() => {
    const profileKey = state.currentProfile as keyof ProfileConfig['preferences']
    return profileConfigService.getProfilePreferences(profileKey)
  }, [state.currentProfile])

  // Bookmarks and favorites
  const addBookmark = useCallback((name: string, command: string) => {
    profileConfigService.addBookmark(name, command, state.currentProfile)
  }, [state.currentProfile])

  const getBookmarks = useCallback(() => {
    return profileConfigService.getBookmarks(state.currentProfile)
  }, [state.currentProfile])

  // Tutorial progress (for general profile)
  const markTutorialComplete = useCallback((tutorialId: string, stepId: string) => {
    profileConfigService.markTutorialStepComplete(tutorialId, stepId)
  }, [])

  const isTutorialComplete = useCallback((tutorialId: string, stepId: string): boolean => {
    return profileConfigService.isTutorialStepComplete(tutorialId, stepId)
  }, [])

  // Export current state and config
  const exportProfileData = useCallback(() => {
    return {
      config: profileConfigService.exportConfig(),
      history: commandHistoryService.exportHistory(),
      profile: state.currentProfile,
      timestamp: new Date().toISOString()
    }
  }, [state.currentProfile])

  return {
    // State
    currentProfile: state.currentProfile,
    config: state.config,
    isApiAvailable: state.isApiAvailable,
    isLoading: state.isLoading,
    error: state.error,
    realtimeData,

    // Profile management
    switchProfile,
    
    // Command execution
    executeCommand,
    
    // Data fetching
    fetchProfileData,
    
    // Command suggestions and history
    getCommandSuggestions,
    getCommandHistory,
    searchCommandHistory,
    
    // Preferences
    updateProfilePreferences,
    getProfilePreferences,
    
    // Bookmarks and favorites
    addBookmark,
    getBookmarks,
    
    // Tutorial progress
    markTutorialComplete,
    isTutorialComplete,
    
    // Export/backup
    exportProfileData,
    
    // Direct service access for advanced use cases
    services: {
      api: profileApiService,
      config: profileConfigService,
      history: commandHistoryService
    }
  }
}