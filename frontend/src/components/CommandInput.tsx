import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Send, ArrowUp, ArrowDown, Terminal, Search, Filter } from 'lucide-react'
import { cn } from '../utils/cn'
import { COMMAND_DEFINITIONS, fuzzySearch, getAllCategories, CommandDefinition, CommandCategory } from '../utils/commandDefinitions'
import { highlightSyntax, getCategoryColor, getCategoryIconEmoji, SyntaxToken } from '../utils/syntaxHighlighting'
import { useCommandHistory } from '../hooks/useCommandHistory'

interface CommandInputProps {
  onExecute: (command: string) => void
  isConnected: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
}

interface CategoryFilter {
  category: CommandCategory | 'all'
  label: string
  icon: string
}

export const CommandInput: React.FC<CommandInputProps> = ({
  onExecute,
  isConnected,
  disabled = false,
  placeholder = 'Enter command...',
  className
}) => {
  const [command, setCommand] = useState('')
  const [suggestions, setSuggestions] = useState<CommandDefinition[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1)
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | 'all'>('all')
  const [showCategoryFilter, setShowCategoryFilter] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  
  // Use the command history hook
  const { history, addCommand, getPreviousCommand, getNextCommand, resetIndex } = useCommandHistory()

  // Syntax highlighting for current command
  const syntaxHighlight = useMemo(() => {
    return highlightSyntax(command)
  }, [command])
  
  // Category filters
  const categoryFilters = useMemo((): CategoryFilter[] => {
    const categories = getAllCategories()
    return [
      { category: 'all', label: 'All Commands', icon: '📋' },
      ...categories.map(cat => ({
        category: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        icon: getCategoryIconEmoji(cat)
      }))
    ]
  }, [])
  
  // Filter commands by selected category
  const filteredCommands = useMemo(() => {
    if (selectedCategory === 'all') {
      return COMMAND_DEFINITIONS
    }
    return COMMAND_DEFINITIONS.filter(cmd => cmd.category === selectedCategory)
  }, [selectedCategory])

  // Generate intelligent command suggestions with fuzzy search
  useEffect(() => {
    const generateSuggestions = () => {
      if (command.trim().length < 1) {
        // Show popular commands when empty
        const popularCommands = filteredCommands.slice(0, 8)
        setSuggestions(popularCommands)
        setShowSuggestions(command.trim().length === 0 && inputRef.current === document.activeElement)
        return
      }

      try {
        // Use fuzzy search for intelligent matching
        const fuzzyResults = fuzzySearch(command.trim(), filteredCommands, 12)
        setSuggestions(fuzzyResults)
        setShowSuggestions(fuzzyResults.length > 0)
        setSelectedSuggestion(-1)
      } catch (error) {
        console.error('Failed to generate command suggestions:', error)
      }
    }

    const debounceTimer = setTimeout(generateSuggestions, 150)
    return () => clearTimeout(debounceTimer)
  }, [command, filteredCommands])

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Click outside handler to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          !inputRef.current?.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setShowCategoryFilter(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (command.trim() && isConnected && !disabled) {
      addCommand(command.trim())
      onExecute(command.trim())
      setCommand('')
      setShowSuggestions(false)
      setSelectedSuggestion(-1)
      resetIndex()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (showSuggestions && suggestions.length > 0) {
          setSelectedSuggestion(prev => 
            prev <= 0 ? suggestions.length - 1 : prev - 1
          )
        } else {
          const prevCommand = getPreviousCommand()
          if (prevCommand !== '') {
            setCommand(prevCommand)
          }
        }
        break
        
      case 'ArrowDown':
        e.preventDefault()
        if (showSuggestions && suggestions.length > 0) {
          setSelectedSuggestion(prev => 
            prev >= suggestions.length - 1 ? 0 : prev + 1
          )
        } else {
          const nextCommand = getNextCommand()
          setCommand(nextCommand)
        }
        break
        
      case 'Tab':
        e.preventDefault()
        if (showSuggestions && selectedSuggestion >= 0) {
          const selectedCmd = suggestions[selectedSuggestion]
          setCommand(selectedCmd.command + (selectedCmd.args && selectedCmd.args.length > 0 ? ' ' : ''))
          setShowSuggestions(false)
          setSelectedSuggestion(-1)
        } else if (suggestions.length > 0) {
          const firstCmd = suggestions[0]
          setCommand(firstCmd.command + (firstCmd.args && firstCmd.args.length > 0 ? ' ' : ''))
          setShowSuggestions(false)
        }
        break
        
      case 'Escape':
        setShowSuggestions(false)
        setShowCategoryFilter(false)
        setSelectedSuggestion(-1)
        resetIndex()
        if (!command) {
          inputRef.current?.blur()
        }
        break
        
      case 'Enter':
        if (showSuggestions && selectedSuggestion >= 0) {
          e.preventDefault()
          const selectedCmd = suggestions[selectedSuggestion]
          setCommand(selectedCmd.command + (selectedCmd.args && selectedCmd.args.length > 0 ? ' ' : ''))
          setShowSuggestions(false)
          setSelectedSuggestion(-1)
        }
        break
        
      case 'F2': // Toggle category filter
        e.preventDefault()
        setShowCategoryFilter(!showCategoryFilter)
        break
    }
  }

  const handleSuggestionClick = (suggestion: CommandDefinition) => {
    setCommand(suggestion.command + (suggestion.args && suggestion.args.length > 0 ? ' ' : ''))
    setShowSuggestions(false)
    setSelectedSuggestion(-1)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }
  
  const handleCategorySelect = (category: CommandCategory | 'all') => {
    setSelectedCategory(category)
    setShowCategoryFilter(false)
    setShowSuggestions(true) // Show suggestions for new category
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }
  
  const handleInputFocus = () => {
    if (command.trim() === '' && suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  // Render syntax highlighted tokens
  const renderSyntaxHighlight = (tokens: SyntaxToken[]) => {
    return tokens.map((token, index) => (
      <span key={index} className={token.className}>
        {token.text}
        {index < tokens.length - 1 ? ' ' : ''}
      </span>
    ))
  }

  return (
    <div className={cn('relative', className)}>
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
            <Terminal className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Advanced syntax highlighting overlay */}
          <div 
            className={cn(
              'absolute left-10 top-3 pr-12 py-3 pointer-events-none font-mono text-sm',
              'overflow-hidden whitespace-nowrap',
              'leading-6' // Match input line height
            )}
            style={{ width: 'calc(100% - 8rem)' }}
          >
            {command ? renderSyntaxHighlight(syntaxHighlight.tokens) : <span className="text-transparent">placeholder</span>}
          </div>
          
          {/* Category filter button */}
          <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
            <button
              type="button"
              onClick={() => setShowCategoryFilter(!showCategoryFilter)}
              className={cn(
                'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700',
                'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                'transition-colors duration-200',
                showCategoryFilter && 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              )}
              title="Filter by category (F2)"
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>
          
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || !isConnected}
            className={cn(
              'w-full pl-12 pr-16 py-3 font-mono text-sm leading-6',
              'border border-gray-300 dark:border-gray-600 rounded-lg',
              'bg-white dark:bg-gray-800',
              'text-transparent', // Hide actual text to show overlay
              'placeholder-gray-500 dark:placeholder-gray-400',
              'focus:outline-none focus:ring-2 transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'caret-gray-900 dark:caret-gray-100', // Keep cursor visible
              syntaxHighlight.isValid 
                ? 'focus:ring-blue-500 focus:border-blue-500'
                : 'focus:ring-red-500 focus:border-red-500 border-red-300 dark:border-red-600'
            )}
            onFocus={handleInputFocus}
          />
          
          {/* Connection status and syntax validation */}
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
            {/* Syntax validation indicator */}
            {command.trim() && (
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  syntaxHighlight.isValid ? 'bg-green-500' : 'bg-yellow-500'
                )}
                title={syntaxHighlight.isValid ? 'Valid syntax' : 'Unknown command'}
              />
            )}
            
            {/* Connection status indicator */}
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              )}
              title={isConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </div>
        
        <button
          type="submit"
          disabled={disabled || !isConnected || !command.trim()}
          className={cn(
            'px-4 py-3 rounded-lg font-medium flex items-center gap-2',
            'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
            'text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          )}
        >
          <Send className="h-4 w-4" />
          Execute
        </button>
      </form>

      {/* Category filter dropdown */}
      {showCategoryFilter && (
        <div
          ref={categoryRef}
          className={cn(
            'absolute top-full left-0 mt-2 z-40',
            'bg-white dark:bg-gray-800',
            'border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg',
            'w-64 max-h-48 overflow-y-auto'
          )}
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Filter className="h-3 w-3" />
              Filter by Category
            </div>
          </div>
          {categoryFilters.map((filter) => (
            <button
              key={filter.category}
              onClick={() => handleCategorySelect(filter.category)}
              className={cn(
                'w-full px-3 py-2 text-left flex items-center gap-3',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                'transition-colors duration-150',
                'text-sm',
                selectedCategory === filter.category && 'bg-blue-50 dark:bg-blue-900/30 border-r-2 border-blue-500'
              )}
            >
              <span className="text-base">{filter.icon}</span>
              <span className="text-gray-900 dark:text-white">{filter.label}</span>
              {filter.category !== 'all' && (
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {COMMAND_DEFINITIONS.filter(cmd => cmd.category === filter.category).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Enhanced auto-complete suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className={cn(
            'absolute top-full left-0 right-0 mt-2 z-50',
            'bg-white dark:bg-gray-800',
            'border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg',
            'max-h-80 overflow-y-auto'
          )}
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Search className="h-3 w-3" />
                {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
                {selectedCategory !== 'all' && (
                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                    {selectedCategory}
                  </span>
                )}
              </div>
              <span>Tab to complete</span>
            </div>
          </div>
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.command}-${index}`}
              onClick={() => handleSuggestionClick(suggestion)}
              className={cn(
                'w-full px-4 py-3 text-left flex items-start gap-3',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                'transition-colors duration-150',
                'border-b border-gray-100 dark:border-gray-700 last:border-b-0',
                index === selectedSuggestion && 'bg-blue-50 dark:bg-blue-900/30 border-r-2 border-blue-500'
              )}
            >
              <div className={cn('mt-0.5 text-lg')}>
                {getCategoryIconEmoji(suggestion.category)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {suggestion.command}
                  </code>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    'bg-gray-100 dark:bg-gray-700',
                    getCategoryColor(suggestion.category)
                  )}>
                    {suggestion.category}
                  </span>
                  {suggestion.aliases && suggestion.aliases.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      aka {suggestion.aliases.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {suggestion.description}
                </p>
                {suggestion.args && suggestion.args.length > 0 && (
                  <div className="text-xs text-blue-600 dark:text-blue-400">
                    Args: {suggestion.args.join(', ')}
                  </div>
                )}
                {suggestion.examples && suggestion.examples.length > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Example: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
                      {suggestion.examples[0]}
                    </code>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Enhanced keyboard shortcuts and status */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            <ArrowDown className="h-3 w-3" />
            History
          </span>
          <span>Tab: Complete</span>
          <span>F2: Filter</span>
          <span>Esc: Cancel</span>
        </div>
        
        <div className="flex items-center gap-3">
          {selectedCategory !== 'all' && (
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
              {selectedCategory} mode
            </span>
          )}
          {history.length > 0 && (
            <span>
              {history.length} command{history.length !== 1 ? 's' : ''} in history
            </span>
          )}
          {syntaxHighlight.category && (
            <span className={cn('flex items-center gap-1', getCategoryColor(syntaxHighlight.category))}>
              {getCategoryIconEmoji(syntaxHighlight.category)}
              {syntaxHighlight.category}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default CommandInput