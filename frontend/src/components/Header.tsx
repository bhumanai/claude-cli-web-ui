import React from 'react'
import { Sun, Moon, Terminal, Wifi, WifiOff, ListTodo, User, LogOut } from 'lucide-react'
import { User as UserType } from '../types'

interface HeaderProps {
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  isConnected: boolean
  sessionId: string
  activeView?: 'terminal' | 'tasks' | 'queue' | 'agents' | 'github'
  user?: UserType | null
  onLogout?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onThemeToggle,
  isConnected,
  sessionId,
  activeView = 'terminal',
  user,
  onLogout
}) => {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeView === 'terminal' ? (
            <Terminal className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          ) : (
            <ListTodo className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          )}
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Claude CLI
          </h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Session: {sessionId.slice(-8)}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400">Disconnected</span>
              </>
            )}
          </div>
          
          {user && (
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {user.username}
              </span>
            </div>
          )}
          
          <button
            onClick={onThemeToggle}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 text-gray-600" />
            ) : (
              <Sun className="w-5 h-5 text-gray-400" />
            )}
          </button>
          
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}