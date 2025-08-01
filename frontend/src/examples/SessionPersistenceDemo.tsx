import React, { useState, useEffect } from 'react'
import { useSessionPersistence } from '../hooks/useSessionPersistence'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useViewState } from '../hooks/useViewState'
import { DataManagementPanel } from '../components/DataManagementPanel'
import { SessionRestorationHandler } from '../components/SessionRestorationHandler'
import { CommandHistory } from '../types'

/**
 * Comprehensive demo component showcasing the session persistence system
 * Demonstrates all major features including data management, preferences, and view state
 */
export const SessionPersistenceDemo: React.FC = () => {
  const sessionPersistence = useSessionPersistence()
  const userPreferences = useUserPreferences()
  const viewState = useViewState()
  
  const [showDataPanel, setShowDataPanel] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([])
  const [message, setMessage] = useState<string>('')

  // Load command history on component mount
  useEffect(() => {
    if (sessionPersistence.isInitialized) {
      const history = sessionPersistence.loadCommandHistory()
      setCommandHistory(history)
    }
  }, [sessionPersistence.isInitialized])

  // Add a command to history
  const addCommand = () => {
    if (!commandInput.trim()) return

    const newCommand: CommandHistory = {
      id: Date.now().toString(),
      command: commandInput,
      timestamp: new Date(),
      status: 'completed',
      output: `Output for: ${commandInput}`,
      duration: Math.random() * 1000
    }

    const updatedHistory = [...commandHistory, newCommand]
    setCommandHistory(updatedHistory)
    sessionPersistence.saveCommandHistory(updatedHistory)
    setCommandInput('')
    setMessage('Command added to history')
    setTimeout(() => setMessage(''), 2000)
  }

  // Clear command history
  const clearHistory = () => {
    setCommandHistory([])
    sessionPersistence.saveCommandHistory([])
    setMessage('Command history cleared')
    setTimeout(() => setMessage(''), 2000)
  }

  // Demo theme toggle
  const toggleTheme = () => {
    const newTheme = userPreferences.preferences.theme === 'dark' ? 'light' : 'dark'
    userPreferences.setTheme(newTheme)
    setMessage(`Theme changed to ${newTheme}`)
    setTimeout(() => setMessage(''), 2000)
  }

  // Demo view toggle
  const toggleView = () => {
    const newView = viewState.viewState.activeView === 'terminal' ? 'tasks' : 'terminal'
    viewState.setActiveView(newView)
    setMessage(`Active view changed to ${newView}`)
    setTimeout(() => setMessage(''), 2000)
  }

  // Demo sidebar toggle
  const toggleSidebar = () => {
    viewState.toggleSidebar()
    setMessage(`Sidebar ${viewState.viewState.sidebarCollapsed ? 'collapsed' : 'expanded'}`)
    setTimeout(() => setMessage(''), 2000)
  }

  // Demo preferences update
  const toggleFeature = (feature: keyof typeof userPreferences.preferences) => {
    if (typeof userPreferences.preferences[feature] === 'boolean') {
      userPreferences.updatePreferences({
        [feature]: !userPreferences.preferences[feature]
      })
      setMessage(`${feature} toggled`)
      setTimeout(() => setMessage(''), 2000)
    }
  }

  const storageStats = sessionPersistence.getStorageStats()

  return (
    <SessionRestorationHandler
      onRestoreComplete={(data) => console.log('Session restored:', data)}
      onRestoreError={(error) => console.error('Restoration error:', error)}
    >
      <div className={`min-h-screen transition-colors ${
        userPreferences.preferences.theme === 'dark' 
          ? 'bg-gray-900 text-white' 
          : 'bg-gray-50 text-gray-900'
      }`}>
        <div className="container mx-auto p-6">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Session Persistence Demo</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Comprehensive demonstration of session persistence, user preferences, and view state management
            </p>
            
            {/* Status message */}
            {message && (
              <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-md">
                {message}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <button
              onClick={toggleTheme}
              className="p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Toggle Theme
              <div className="text-sm opacity-75 mt-1">
                Current: {userPreferences.preferences.theme}
              </div>
            </button>

            <button
              onClick={toggleView}
              className="p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Toggle View
              <div className="text-sm opacity-75 mt-1">
                Current: {viewState.viewState.activeView}
              </div>
            </button>

            <button
              onClick={toggleSidebar}
              className="p-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Toggle Sidebar
              <div className="text-sm opacity-75 mt-1">
                {viewState.viewState.sidebarCollapsed ? 'Collapsed' : 'Expanded'}
              </div>
            </button>

            <button
              onClick={() => setShowDataPanel(true)}
              className="p-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              Data Management
              <div className="text-sm opacity-75 mt-1">
                Backup & Settings
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Command History Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Command History Demo</h2>
              
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCommand()}
                    placeholder="Enter a command..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addCommand}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={clearHistory}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {commandHistory.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                    No commands in history. Add some commands to see them persist across sessions.
                  </p>
                ) : (
                  commandHistory.map((cmd) => (
                    <div key={cmd.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                      <div className="flex justify-between items-start">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                          {cmd.command}
                        </code>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {cmd.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      {cmd.output && (
                        <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                          {cmd.output}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Preferences Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">User Preferences</h2>
              
              <div className="space-y-4">
                {/* Theme Preference */}
                <div className="flex justify-between items-center">
                  <label className="font-medium">Theme</label>
                  <select
                    value={userPreferences.preferences.theme}
                    onChange={(e) => userPreferences.setTheme(e.target.value as 'light' | 'dark')}
                    className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>

                {/* Font Size Preference */}
                <div className="flex justify-between items-center">
                  <label className="font-medium">Font Size</label>
                  <select
                    value={userPreferences.preferences.fontSize}
                    onChange={(e) => userPreferences.setFontSize(e.target.value as any)}
                    className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                {/* Boolean Preferences */}
                {[
                  { key: 'commandSuggestions', label: 'Command Suggestions' },
                  { key: 'autoSave', label: 'Auto Save' },
                  { key: 'notifications', label: 'Notifications' },
                  { key: 'soundEnabled', label: 'Sound Effects' },
                  { key: 'animationsEnabled', label: 'Animations' },
                  { key: 'compactMode', label: 'Compact Mode' },
                  { key: 'showTimestamps', label: 'Show Timestamps' }
                ].map(({ key, label }) => (
                  <div key={key} className="flex justify-between items-center">
                    <label className="font-medium">{label}</label>
                    <button
                      onClick={() => toggleFeature(key as keyof typeof userPreferences.preferences)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        userPreferences.preferences[key as keyof typeof userPreferences.preferences]
                          ? 'bg-blue-600'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        userPreferences.preferences[key as keyof typeof userPreferences.preferences]
                          ? 'translate-x-7'
                          : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* View State Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">View State</h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Active View</label>
                    <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {viewState.viewState.activeView}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Sidebar</label>
                    <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {viewState.viewState.sidebarCollapsed ? 'Collapsed' : 'Expanded'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Terminal Height</label>
                    <input
                      type="range"
                      min="200"
                      max="800"
                      value={viewState.viewState.terminalHeight}
                      onChange={(e) => viewState.setTerminalHeight(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {viewState.viewState.terminalHeight}px
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Split View</label>
                    <button
                      onClick={() => viewState.toggleSplitView()}
                      className={`px-3 py-1 rounded-md text-sm ${
                        viewState.viewState.splitViewEnabled
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {viewState.viewState.splitViewEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* Layout Presets */}
                <div>
                  <label className="block text-sm font-medium mb-2">Layout Presets</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['default', 'compact', 'split', 'fullscreen'].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => viewState.applyLayoutPreset(preset as any)}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors capitalize text-sm"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Storage Statistics */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Storage Statistics</h2>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total Size:</span>
                  <span className="font-mono text-sm">
                    {storageStats ? Math.round(storageStats.totalSize / 1024) : 0} KB
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Items:</span>
                  <span className="font-mono text-sm">{storageStats?.itemCount || 0}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Commands:</span>
                  <span className="font-mono text-sm">{commandHistory.length}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Session ID:</span>
                  <span className="font-mono text-xs truncate max-w-32">
                    {sessionPersistence.loadSessionData()?.sessionId?.slice(-8) || 'N/A'}
                  </span>
                </div>

                {/* Progress bar for storage usage */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Storage Usage</span>
                    <span>
                      {storageStats ? Math.round((storageStats.totalSize / storageStats.maxSize) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${storageStats ? Math.min((storageStats.totalSize / storageStats.maxSize) * 100, 100) : 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Data Management Panel */}
          <DataManagementPanel
            isOpen={showDataPanel}
            onClose={() => setShowDataPanel(false)}
          />
        </div>
      </div>
    </SessionRestorationHandler>
  )
}

export default SessionPersistenceDemo