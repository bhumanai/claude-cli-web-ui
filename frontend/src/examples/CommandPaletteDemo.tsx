import React, { useState } from 'react'
import { CommandPalette } from '../components/CommandPalette'
import { Terminal, Zap, Keyboard } from 'lucide-react'

/**
 * Demonstration component showcasing the Command Palette features
 * This component can be used for testing and documentation purposes
 */
export const CommandPaletteDemo: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeView, setActiveView] = useState<'terminal' | 'tasks'>('terminal')
  const [executedCommands, setExecutedCommands] = useState<string[]>([])

  const handleExecuteCommand = (command: string) => {
    setExecutedCommands(prev => [...prev, command])
    console.log('Executed command:', command)
  }

  const handleNavigate = (view: 'terminal' | 'tasks') => {
    setActiveView(view)
    console.log('Navigated to:', view)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Command Palette Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Demonstration of the enhanced command palette system with fuzzy search,
            keyboard navigation, and category-based organization.
          </p>
        </header>

        {/* Demo Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Demo Controls
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setIsOpen(true)}
              className="flex items-center gap-2 px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Terminal className="h-5 w-5" />
              Open Command Palette
            </button>
            
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Keyboard className="h-5 w-5" />
              <span>Or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs">Cmd+K</kbd></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current View
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveView('terminal')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    activeView === 'terminal'
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Terminal
                </button>
                <button
                  onClick={() => setActiveView('tasks')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    activeView === 'tasks'
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Tasks
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                System Commands
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Core CLI commands like /help, /clear, /status
            </p>
            <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              Try: "/help"
            </code>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-5 w-5 text-purple-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Agent Operations
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              AI agent commands and task management
            </p>
            <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              Try: "/agents"
            </code>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-3">
              <Keyboard className="h-5 w-5 text-green-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Quick Actions
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              UI actions like theme toggle and navigation
            </p>
            <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              Try: "Toggle Theme"
            </code>
          </div>
        </div>

        {/* Keyboard Shortcuts Reference */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Keyboard Shortcuts
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                Command Palette
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Open palette</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                    Cmd+K
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Navigate</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                    ↑↓
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Execute</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                    Enter
                  </kbd>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                Quick Actions
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Toggle theme</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                    Cmd+Shift+L
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Terminal view</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                    Cmd+1
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tasks view</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                    Cmd+2
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Executed Commands Log */}
        {executedCommands.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Executed Commands
            </h2>
            <div className="space-y-2">
              {executedCommands.map((command, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded"
                >
                  <span className="text-gray-500 dark:text-gray-400">
                    {index + 1}.
                  </span>
                  <code className="font-mono text-gray-900 dark:text-white">
                    {command}
                  </code>
                </div>
              ))}
            </div>
            <button
              onClick={() => setExecutedCommands([])}
              className="mt-4 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Clear Log
            </button>
          </div>
        )}
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onExecuteCommand={handleExecuteCommand}
        onNavigate={handleNavigate}
      />
    </div>
  )
}

export default CommandPaletteDemo