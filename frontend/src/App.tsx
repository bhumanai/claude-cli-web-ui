import { useMemo, useState, useEffect, useCallback } from 'react'
import { Header } from './components/Header'
import { Terminal } from './components/Terminal'
import { TaskManagementPanel } from './components/TaskManagementPanel'
import { CommandPalette } from './components/CommandPalette'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ErrorNotification } from './components/ErrorNotification'
import { ConnectionStatus } from './components/ConnectionStatus'
import { ProfileSelector, type UserProfile } from './components/ProfileSelector'
import { ProfileDashboard } from './components/ProfileDashboard'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SimpleLogin } from './components/SimpleLogin'
import { SecurityProvider } from './components/SecurityProvider'
import { SecurityDashboard } from './components/SecurityDashboard'
import { AgentMonitor } from './components/AgentMonitor'
import { NotificationProvider, useNotifications } from './contexts/NotificationContext'
import { PageLoading } from './components/LoadingIndicator'
import { useTheme } from './hooks/useTheme'
import { useWebSocket } from './hooks/useWebSocket'
import { useSessionPersistence, useUIStateRestoration } from './hooks/useSessionPersistence'
import { useApiRetry } from './hooks/useRetry'
import { useProfileIntegration } from './hooks/useProfileIntegration'
import { generateSessionId } from './utils/helpers'
import { errorReporting } from './services/ErrorReportingService'

function AppContent() {
  // Restore UI state from localStorage
  const restoredState = useUIStateRestoration()
  
  const { theme, toggleTheme } = useTheme()
  const [activeView, setActiveView] = useState<'terminal' | 'tasks' | 'profile' | 'dashboard' | 'agents'>(
    restoredState.activeView || 'dashboard'
  )
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(!localStorage.getItem('claude-cli-welcomed'))
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('claude-cli-auth'))
  const [loginError, setLoginError] = useState<string | null>(null)

  // Profile integration
  const {
    currentProfile,
    switchProfile,
    executeCommand,
    isApiAvailable,
    isLoading: profileLoading,
    error: profileError,
    getCommandHistory,
    getCommandSuggestions
  } = useProfileIntegration()
  
  // Enhanced notification system from context
  const {
    notifications,
    dismissNotification,
    clearNotificationsByType,
    clearConnectionErrors,
    notifyError,
    notifySuccess,
    notifyConnectionError,
    notifyConnectionRestored,
    notifyApiError
  } = useNotifications()
  
  // Generate session ID once on app mount
  const sessionId = useMemo(() => {
    const id = generateSessionId()
    // Set session ID for error reporting
    errorReporting.setSession(id)
    errorReporting.addTag('claude-cli-web-ui')
    errorReporting.addTag(`profile-${currentProfile}`)
    return id
  }, [currentProfile])
  
  // Session persistence with profile awareness
  const { saveSession, loadSession } = useSessionPersistence(sessionId, currentProfile)
  
  // WebSocket connection with profile context
  const { 
    isConnected, 
    sendCommand,
    connectionMode,
    connectionError,
    forceReconnect 
  } = useWebSocket(sessionId)
  
  // API retry hook for resilient backend communication
  const { executeWithRetry } = useApiRetry({
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffFactor: 1.5,
    onRetry: (attempt, error) => {
      console.log(`API retry attempt ${attempt}:`, error.message)
      notifyError(`Connection attempt ${attempt} failed`, {
        autoClose: true,
        duration: 2000
      })
    }
  })

  // Enhanced command execution with profile context
  const handleExecuteCommand = useCallback(async (command: string) => {
    try {
      const result = await executeCommand(command, { 
        useApi: isApiAvailable,
        saveToHistory: true 
      })
      
      if (result.success) {
        notifySuccess(`Command executed successfully in ${result.duration}ms`)
      } else {
        notifyError(`Command failed: ${result.output}`)
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      notifyError(`Command execution failed: ${errorMessage}`)
      throw error
    }
  }, [executeCommand, isApiAvailable, notifyError, notifySuccess])

  // Profile change handler
  const handleProfileChange = useCallback(async (profile: UserProfile) => {
    try {
      await switchProfile(profile)
      notifySuccess(`Switched to ${profile} profile`)
      errorReporting.addTag(`profile-${profile}`)
      
      // Update view based on profile
      if (profile === 'general' && activeView === 'dashboard') {
        // Stay on dashboard for general users to see tutorials
      } else if (activeView === 'dashboard') {
        // Keep dashboard view for other profiles
      }
    } catch (error) {
      notifyError(`Failed to switch profile: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [switchProfile, notifySuccess, notifyError, activeView])

  // View change handler with persistence
  const handleViewChange = useCallback((view: typeof activeView) => {
    setActiveView(view)
    saveSession({ activeView: view })
  }, [saveSession])

  // Command palette toggle
  const toggleCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(prev => !prev)
  }, [])

  // Global keyboard shortcuts with profile awareness
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K for command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }
      
      // Ctrl/Cmd + 1-4 for quick profile switching
      if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        const profiles: UserProfile[] = ['developer', 'analyst', 'devops', 'general']
        const profileIndex = parseInt(e.key) - 1
        if (profiles[profileIndex]) {
          handleProfileChange(profiles[profileIndex])
        }
      }
      
      // Ctrl/Cmd + T for terminal view
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        handleViewChange('terminal')
      }
      
      // Ctrl/Cmd + D for dashboard view
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        handleViewChange('dashboard')
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [toggleCommandPalette, handleProfileChange, handleViewChange])

  // Initialize connection without aggressive retry
  useEffect(() => {
    let mounted = true
    let connectionAttempt = 0
    const maxAttempts = 3
    
    const initializeConnection = async () => {
      if (!mounted || connectionAttempt >= maxAttempts) return
      
      connectionAttempt++
      
      try {
        // Only try to connect once, don't retry aggressively
        if (!isConnected && connectionAttempt === 1) {
          forceReconnect()
        }
      } catch (error) {
        console.error(`Connection attempt ${connectionAttempt} failed:`, error)
        
        if (connectionAttempt < maxAttempts) {
          // Wait before retrying with exponential backoff
          setTimeout(() => {
            if (mounted) initializeConnection()
          }, connectionAttempt * 2000)
        } else {
          notifyConnectionError('Unable to establish connection after multiple attempts')
        }
      }
    }

    // Only initialize once on mount
    initializeConnection()
    
    return () => {
      mounted = false
    }
  }, []) // Remove dependencies to prevent re-running

  // Simple login handler
  const handleSimpleLogin = useCallback(async (password: string) => {
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/auth/simple-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Invalid password')
      }
      
      const data = await response.json()
      
      // Store the authentication token
      const authToken = data.token || data.access_token
      localStorage.setItem('claude-cli-auth', authToken)
      
      // Store user data if provided
      if (data.user) {
        localStorage.setItem('claude-cli-user', JSON.stringify(data.user))
      }
      
      setIsAuthenticated(true)
      setLoginError(null)
      notifySuccess('Login successful!')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setLoginError('Connection timeout - please try again')
        notifyError('Login failed', 'Connection timeout')
      } else {
        setLoginError(error instanceof Error ? error.message : 'Login failed')
        notifyError('Login failed', error instanceof Error ? error.message : 'Invalid password')
      }
    }
  }, [notifySuccess, notifyError])

  // Welcome screen handler
  const handleWelcomeComplete = useCallback(() => {
    localStorage.setItem('claude-cli-welcomed', 'true')
    setShowWelcome(false)
  }, [])

  // Show login screen first if not authenticated
  if (!isAuthenticated) {
    return <SimpleLogin onLogin={handleSimpleLogin} error={loginError} />
  }

  if (showWelcome) {
    return (
      <WelcomeScreen 
        onComplete={handleWelcomeComplete}
        onProfileSelect={handleProfileChange}
        currentProfile={currentProfile}
      />
    )
  }

  if (profileLoading) {
    return <PageLoading message="Initializing profile system..." />
  }

  return (
    <ErrorBoundary 
      level="app"
      enableReporting={true}
      onError={(error, errorInfo) => {
        errorReporting.captureError(error, {
          component: 'App',
          action: 'render_error',
          metadata: { errorInfo, profile: currentProfile }
        })
      }}
    >
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header
          theme={theme}
          onThemeToggle={toggleTheme}
          isConnected={isConnected}
          sessionId={sessionId}
          activeView={activeView}
          profile={currentProfile}
        />
        
        {/* Profile Selector */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <ProfileSelector
              currentProfile={currentProfile}
              onProfileChange={handleProfileChange}
            />
            <div className="flex items-center space-x-3">
              <SecurityDashboard />
              <ConnectionStatus 
                isConnected={isConnected}
                isApiAvailable={isApiAvailable}
              />
            </div>
          </div>
        </div>
        
        <main className="flex-1 px-2 sm:px-4 py-4 overflow-hidden">
          {/* View Toggle */}
          <div className="mb-4 flex gap-2 px-2">
            <button
              onClick={() => handleViewChange('dashboard')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeView === 'dashboard'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => handleViewChange('terminal')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeView === 'terminal'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Terminal
            </button>
            <button
              onClick={() => handleViewChange('tasks')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeView === 'tasks'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => handleViewChange('agents')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeView === 'agents'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Agents
            </button>
          </div>

          {/* Content Area */}
          <div className="h-[calc(100%-3.5rem)]">
            {activeView === 'dashboard' ? (
              <ErrorBoundary 
                level="section" 
                enableReporting={true}
                onError={(error) => {
                  errorReporting.captureError(error, {
                    component: 'ProfileDashboard',
                    profile: currentProfile
                  })
                }}
              >
                <ProfileDashboard
                  profile={currentProfile}
                  onExecuteCommand={handleExecuteCommand}
                />
              </ErrorBoundary>
            ) : activeView === 'terminal' ? (
              <ErrorBoundary 
                level="section" 
                enableReporting={true}
                onError={(error) => {
                  errorReporting.captureError(error, {
                    component: 'Terminal',
                    profile: currentProfile
                  })
                }}
              >
                <Terminal
                  isConnected={isConnected}
                  onSendMessage={sendCommand}
                  sessionId={sessionId}
                  profile={currentProfile}
                  onExecuteCommand={handleExecuteCommand}
                  commandHistory={getCommandHistory(50) || []}
                  commandSuggestions={getCommandSuggestions() || []}
                />
              </ErrorBoundary>
            ) : activeView === 'agents' ? (
              <ErrorBoundary 
                level="section" 
                enableReporting={true}
                onError={(error) => {
                  errorReporting.captureError(error, {
                    component: 'AgentMonitor',
                    profile: currentProfile
                  })
                }}
              >
                <AgentMonitor />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary 
                level="section" 
                enableReporting={true}
                onError={(error) => {
                  errorReporting.captureError(error, {
                    component: 'TaskManagementPanel'
                  })
                }}
              >
                <TaskManagementPanel />
              </ErrorBoundary>
            )}
          </div>
        </main>

        {/* Global Components */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onExecuteCommand={handleExecuteCommand}
          profile={currentProfile}
          commandHistory={getCommandHistory(20) || []}
          suggestions={getCommandSuggestions() || []}
        />

        {/* Notifications */}
        {(notifications || []).map((notification) => (
          <ErrorNotification
            key={notification.id}
            {...notification}
            onDismiss={() => dismissNotification(notification.id)}
          />
        ))}
      </div>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <SecurityProvider
      enableSessionTimeout={true}
      enableSecurityMonitoring={true}
      enableRateLimit={true}
    >
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </SecurityProvider>
    )
  }