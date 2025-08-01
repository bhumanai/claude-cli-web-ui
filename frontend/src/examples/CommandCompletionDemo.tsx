import React, { useState } from 'react'
import { CommandInput } from '../components/CommandInput'
import { cn } from '../utils/cn'

interface DemoCommand {
  command: string
  output: string
  timestamp: Date
}

/**
 * Demo component showcasing the advanced command completion features
 * This component demonstrates:
 * - Real-time syntax highlighting
 * - Intelligent autocomplete with fuzzy search
 * - Category-based filtering
 * - Keyboard navigation
 * - Command history persistence
 */
export const CommandCompletionDemo: React.FC = () => {
  const [executedCommands, setExecutedCommands] = useState<DemoCommand[]>([])
  const [isConnected, setIsConnected] = useState(true)

  const handleExecuteCommand = (command: string) => {
    // Simulate command execution
    const output = generateMockOutput(command)
    
    const newCommand: DemoCommand = {
      command,
      output,
      timestamp: new Date()
    }
    
    setExecutedCommands(prev => [...prev, newCommand])
  }

  const generateMockOutput = (command: string): string => {
    if (command.startsWith('/help')) {
      return 'Available commands: /status, /agents, /tasks, /projects, /clear, /history'
    } else if (command.startsWith('/status')) {
      return 'System Status: Connected ✓\nActive Sessions: 1\nUptime: 2h 34m'
    } else if (command.startsWith('/agents')) {
      return 'Available Agents:\n- python-pro: Python development expert\n- frontend-developer: React/TypeScript specialist\n- backend-architect: API design expert'
    } else if (command.startsWith('ls')) {
      return 'src/\npackage.json\nREADME.md\nnode_modules/\ndist/'
    } else if (command.startsWith('pwd')) {
      return '/Users/user/claude-cli-web-ui'
    } else if (command.startsWith('git status')) {
      return 'On branch main\nYour branch is up to date with \'origin/main\'.\n\nnothing to commit, working tree clean'
    } else if (command.startsWith('npm')) {
      return 'npm command executed successfully'
    } else {
      return `Command executed: ${command}\nOutput: [Mock output for demonstration]`
    }
  }

  const handleClearHistory = () => {
    setExecutedCommands([])
  }

  const toggleConnection = () => {
    setIsConnected(!isConnected)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Command Completion Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Experience advanced command completion with 50+ predefined commands, 
          fuzzy search, syntax highlighting, and intelligent suggestions.
        </p>
      </div>

      {/* Demo Controls */}
      <div className="flex items-center justify-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <button
          onClick={toggleConnection}
          className={cn(
            'px-4 py-2 rounded-lg font-medium transition-colors',
            isConnected
              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300'
              : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300'
          )}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
        
        <button
          onClick={handleClearHistory}
          className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
        >
          Clear History
        </button>
        
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Commands executed: {executedCommands.length}
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
            🚀 Try These Commands
          </h3>
          <div className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
            <div>Type: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">hel</code> (fuzzy search)</div>
            <div>Type: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">git st</code> (autocomplete)</div>
            <div>Type: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/agen</code> (slash commands)</div>
          </div>
        </div>

        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <h3 className="font-semibold text-green-900 dark:text-green-300 mb-2">
            ⌨️ Keyboard Shortcuts
          </h3>
          <div className="space-y-1 text-sm text-green-700 dark:text-green-400">
            <div><kbd className="bg-green-100 dark:bg-green-800 px-1 rounded">Tab</kbd> - Complete suggestion</div>
            <div><kbd className="bg-green-100 dark:bg-green-800 px-1 rounded">↑/↓</kbd> - Navigate</div>
            <div><kbd className="bg-green-100 dark:bg-green-800 px-1 rounded">F2</kbd> - Filter categories</div>
          </div>
        </div>

        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">
            🎨 Syntax Highlighting
          </h3>
          <div className="space-y-1 text-sm text-purple-700 dark:text-purple-400">
            <div><span className="text-purple-600">/commands</span> - Slash commands</div>
            <div><span className="text-blue-600">git status</span> - System commands</div>
            <div><span className="text-orange-600">--flags</span> - Command flags</div>
          </div>
        </div>
      </div>

      {/* Command Input */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Command Terminal
        </h2>
        
        <CommandInput
          onExecute={handleExecuteCommand}
          isConnected={isConnected}
          placeholder={isConnected ? "Try typing 'help', 'git', or '/agents'..." : "Disconnected - click Connect button"}
        />
      </div>

      {/* Command Output */}
      {executedCommands.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Command Output
          </h2>
          
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
            {executedCommands.map((cmd, index) => (
              <div key={index} className="mb-4 last:mb-0">
                <div className="text-gray-500">
                  [{cmd.timestamp.toLocaleTimeString()}] $ {cmd.command}
                </div>
                <div className="whitespace-pre-wrap ml-4 mt-1">
                  {cmd.output}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage Instructions */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          How to Use Advanced Command Completion
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-700 dark:text-gray-300">
          <div>
            <h3 className="font-semibold mb-2">🔍 Smart Search</h3>
            <ul className="space-y-1">
              <li>• Fuzzy matching finds commands even with typos</li>
              <li>• Search by command name or description</li>
              <li>• Results ranked by relevance</li>
              <li>• Support for command aliases</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">📂 Category Filtering</h3>
            <ul className="space-y-1">
              <li>• Press F2 to open category filter</li>
              <li>• Filter by: system, git, filesystem, etc.</li>
              <li>• Visual category indicators</li>
              <li>• Quick category switching</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">💾 Command History</h3>
            <ul className="space-y-1">
              <li>• Navigate with ↑/↓ arrow keys</li>
              <li>• Persistent across browser sessions</li>
              <li>• Automatic duplicate removal</li>
              <li>• Last 100 commands stored</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">🎨 Visual Feedback</h3>
            <ul className="space-y-1">
              <li>• Real-time syntax highlighting</li>
              <li>• Command validation indicators</li>
              <li>• Category-specific colors</li>
              <li>• Token-based parsing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CommandCompletionDemo