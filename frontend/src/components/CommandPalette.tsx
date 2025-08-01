import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Terminal, Zap, FileText, Folder, Settings, X, Sun, Moon, Home, List, Play, Code, Database, Network, GitBranch, Monitor } from 'lucide-react'
import { cn } from '../utils/cn'
import { CommandSuggestion } from '../types'
import { COMMAND_DEFINITIONS, fuzzySearch, CommandCategory } from '../utils/commandDefinitions'
import { useTheme } from '../hooks/useTheme'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onExecuteCommand: (command: string) => void
  onNavigate?: (view: 'terminal' | 'tasks') => void
  className?: string
}

interface PaletteCommand extends CommandSuggestion {
  shortcut?: string
  action?: () => void
  icon?: React.ReactNode
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onExecuteCommand,
  onNavigate,
  className
}) => {
  const { theme, toggleTheme } = useTheme()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | 'all'>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const commandsRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Helper function to get category icons - must be defined before useMemo
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'system':
        return <Terminal className="h-4 w-4" />
      case 'agents':
        return <Zap className="h-4 w-4" />
      case 'tasks':
        return <FileText className="h-4 w-4" />
      case 'projects':
        return <Folder className="h-4 w-4" />
      case 'filesystem':
        return <Home className="h-4 w-4" />
      case 'search':
        return <Search className="h-4 w-4" />
      case 'text':
        return <FileText className="h-4 w-4" />
      case 'network':
        return <Network className="h-4 w-4" />
      case 'process':
        return <Play className="h-4 w-4" />
      case 'git':
        return <GitBranch className="h-4 w-4" />
      case 'development':
        return <Code className="h-4 w-4" />
      case 'docker':
        return <Settings className="h-4 w-4" />
      case 'database':
        return <Database className="h-4 w-4" />
      case 'monitoring':
        return <Monitor className="h-4 w-4" />
      case 'ui':
        return <Settings className="h-4 w-4" />
      default:
        return <Terminal className="h-4 w-4" />
    }
  }

  // Generate enhanced command palette with all available commands plus UI actions
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const commandsFromDefinitions: PaletteCommand[] = COMMAND_DEFINITIONS.map(cmd => ({
      command: cmd.command,
      description: cmd.description,
      category: cmd.category,
      icon: getCategoryIcon(cmd.category)
    }))

    const uiActions: PaletteCommand[] = [
      {
        command: 'Toggle Theme',
        description: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
        category: 'ui',
        shortcut: 'Cmd+Shift+L',
        icon: theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        action: toggleTheme
      },
      {
        command: 'Go to Terminal',
        description: 'Switch to terminal view',
        category: 'ui',
        shortcut: 'Cmd+1',
        icon: <Terminal className="h-4 w-4" />,
        action: () => onNavigate?.('terminal')
      },
      {
        command: 'Go to Tasks',
        description: 'Switch to task management view', 
        category: 'ui',
        shortcut: 'Cmd+2',
        icon: <List className="h-4 w-4" />,
        action: () => onNavigate?.('tasks')
      },
      {
        command: 'Clear Terminal',
        description: 'Clear all terminal output',
        category: 'ui',
        shortcut: 'Cmd+K',
        icon: <X className="h-4 w-4" />,
        action: () => onExecuteCommand('/clear')
      }
    ]

    return [...commandsFromDefinitions, ...uiActions]
  }, [theme, toggleTheme, onNavigate, onExecuteCommand])

  // Enhanced filtering with fuzzy search and category filtering
  const filteredCommands = useMemo(() => {
    let commands = paletteCommands
    
    // Apply category filter
    if (selectedCategory !== 'all') {
      commands = commands.filter(cmd => cmd.category === selectedCategory)
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      // Use fuzzy search for better matching
      const searchResults = fuzzySearch(
        searchTerm,
        commands.map(cmd => ({
          command: cmd.command,
          description: cmd.description,
          category: cmd.category as CommandCategory
        })),
        20
      )
      
      // Map back to palette commands with actions preserved
      commands = searchResults.map(result => {
        const original = commands.find(cmd => cmd.command === result.command)
        return original || result
      }) as PaletteCommand[]
    }
    
    return commands
  }, [paletteCommands, searchTerm, selectedCategory])

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredCommands])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setSearchTerm('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        )
        break
        
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        )
        break
        
      case 'Enter':
        e.preventDefault()
        if (filteredCommands[selectedIndex]) {
          executeSelectedCommand()
        }
        break
        
      case 'Escape':
        onClose()
        break
    }
  }

  const executeSelectedCommand = () => {
    const selected = filteredCommands[selectedIndex]
    if (selected) {
      if (selected.action) {
        selected.action()
      } else {
        onExecuteCommand(selected.command)
      }
      onClose()
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'system':
        return 'text-blue-500'
      case 'agents':
        return 'text-purple-500'
      case 'tasks':
        return 'text-green-500'
      case 'projects':
        return 'text-orange-500'
      case 'filesystem':
        return 'text-yellow-500'
      case 'search':
        return 'text-red-500'
      case 'text':
        return 'text-cyan-500'
      case 'network':
        return 'text-teal-500'
      case 'process':
        return 'text-pink-500'
      case 'git':
        return 'text-emerald-500'
      case 'development':
        return 'text-violet-500'
      case 'docker':
        return 'text-sky-500'
      case 'database':
        return 'text-amber-500'
      case 'monitoring':
        return 'text-rose-500'
      case 'ui':
        return 'text-indigo-500'
      default:
        return 'text-gray-500'
    }
  }

  // Get unique categories for the filter tabs
  const categories = useMemo(() => {
    const cats = Array.from(new Set(paletteCommands.map(cmd => cmd.category).filter(Boolean)))
    return ['all', ...cats.sort()] as (CommandCategory | 'all')[]
  }, [paletteCommands])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Command Palette */}
      <div className={cn(
        'relative w-full max-w-2xl mx-4',
        'bg-white dark:bg-gray-900',
        'border border-gray-200 dark:border-gray-700',
        'rounded-xl shadow-2xl',
        'overflow-hidden',
        className
      )}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          {/* Search Bar */}
          <div className="flex items-center gap-3 p-4">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-500 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-3 w-3 text-gray-500" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          
          {/* Category Filter Tabs */}
          <div className="px-4 pb-3">
            <div className="flex gap-1 overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                    selectedCategory === category
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  {category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Commands List */}
        <div 
          ref={commandsRef}
          className="max-h-96 overflow-y-auto py-2"
        >
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              {searchTerm ? (
                <>
                  <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p>No commands found for "{searchTerm}"</p>
                  <p className="text-xs mt-1">Try a different search term or category</p>
                </>
              ) : (
                <>
                  <Terminal className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p>No commands in this category</p>
                </>
              )}
            </div>
          ) : (
            <div ref={listRef}>
              {filteredCommands.map((cmd, index) => (
                <button
                  key={`${cmd.command}-${index}`}
                  onClick={() => {
                    setSelectedIndex(index)
                    executeSelectedCommand()
                  }}
                  className={cn(
                    'w-full px-4 py-3 text-left flex items-center gap-3',
                    'hover:bg-gray-100 dark:hover:bg-gray-800',
                    'transition-colors duration-150',
                    'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-inset',
                    index === selectedIndex && 'bg-violet-50 dark:bg-violet-900/20 border-r-2 border-violet-500'
                  )}
                >
                  <div className={cn('flex-shrink-0', getCategoryColor(cmd.category || 'system'))}>
                    {cmd.icon || getCategoryIcon(cmd.category || 'system')}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'text-sm font-medium truncate',
                        cmd.command.startsWith('/') || cmd.action
                          ? 'text-gray-900 dark:text-white'
                          : 'font-mono text-gray-800 dark:text-gray-200'
                      )}>
                        {cmd.command}
                      </span>
                      {cmd.shortcut && (
                        <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded border">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                      {cmd.description}
                    </p>
                  </div>
                  
                  {cmd.category && selectedCategory === 'all' && (
                    <span className={cn(
                      'flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium',
                      'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    )}>
                      {cmd.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">Enter</kbd>
                Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">Esc</kbd>
                Close
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">⌘K</kbd>
                Clear search
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedCategory !== 'all' && (
                <span className="text-violet-600 dark:text-violet-400 font-medium">
                  {selectedCategory}
                </span>
              )}
              <span>
                {filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette