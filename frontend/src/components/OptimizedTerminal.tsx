import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Terminal as TerminalIcon, Copy, Download, Maximize2, Minimize2 } from 'lucide-react'
import { OptimizedVirtualList } from './OptimizedVirtualList'
import { debounce, memoize, performanceOptimizer } from '../utils/performanceOptimizations'
import { cn } from '../utils/cn'
import type { UserProfile } from './ProfileSelector'

interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error' | 'system'
  content: string
  timestamp: Date
  profile?: UserProfile
}

interface OptimizedTerminalProps {
  lines: TerminalLine[]
  onExecuteCommand: (command: string) => Promise<any>
  isConnected: boolean
  profile: UserProfile
  maxLines?: number
  itemHeight?: number
  className?: string
}

// Memoized terminal line component
const TerminalLineComponent = React.memo<{
  line: TerminalLine
  index: number
}>(({ line, index }) => {
  const mark = performanceOptimizer.metrics.markTime(`terminal-line-render-${index}`)
  
  useEffect(() => {
    mark()
  })

  const getLineStyles = (type: TerminalLine['type']) => {
    switch (type) {
      case 'input':
        return 'text-green-400 font-mono'
      case 'output':
        return 'text-gray-100 font-mono'
      case 'error':
        return 'text-red-400 font-mono'
      case 'system':
        return 'text-blue-400 font-mono italic'
      default:
        return 'text-gray-300 font-mono'
    }
  }

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="flex items-start gap-3 px-4 py-1 hover:bg-gray-800/50 transition-colors">
      <span className="text-xs text-gray-500 font-mono w-16 flex-shrink-0 pt-0.5">
        {formatTimestamp(line.timestamp)}
      </span>
      <div className="flex-1 min-w-0">
        <div className={cn("break-words", getLineStyles(line.type))}>
          {line.type === 'input' && <span className="text-violet-400 mr-2">$</span>}
          {line.content}
        </div>
      </div>
      {line.profile && (
        <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-700 rounded flex-shrink-0">
          {line.profile}
        </span>
      )}
    </div>
  )
})

TerminalLineComponent.displayName = 'TerminalLineComponent'

export const OptimizedTerminal: React.FC<OptimizedTerminalProps> = ({
  lines,
  onExecuteCommand,
  isConnected,
  profile,
  maxLines = 1000,
  itemHeight = 32,
  className
}) => {
  const [input, setInput] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const commandHistoryRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)

  // Memoize filtered lines for search
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines

    const query = searchQuery.toLowerCase()
    return lines.filter(line => 
      line.content.toLowerCase().includes(query)
    )
  }, [lines, searchQuery])

  // Limit lines for performance
  const displayLines = useMemo(() => {
    const linesToShow = filteredLines.slice(-maxLines)
    return linesToShow.map((line, index) => ({
      ...line,
      id: line.id || `line-${index}`
    }))
  }, [filteredLines, maxLines])

  // Memoized command suggestions
  const getCommandSuggestions = useMemo(() => 
    memoize((inputValue: string, userProfile: UserProfile) => {
      const suggestions: Record<UserProfile, string[]> = {
        developer: ['git status', 'npm run build', 'npm test', 'git commit', 'git push'],
        analyst: ['data query', 'data export', 'data visualize', 'data stats'],
        devops: ['logs tail', 'health check', 'deploy status', 'docker ps'],
        general: ['help', 'status', 'history', 'clear']
      }
      
      const profileSuggestions = suggestions[userProfile] || suggestions.general
      return profileSuggestions.filter(cmd => 
        cmd.toLowerCase().startsWith(inputValue.toLowerCase())
      )
    }), 
    [profile]
  )

  // Debounced search to improve performance
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setSearchQuery(query)
    }, 300),
    []
  )

  // Handle command execution
  const handleExecuteCommand = useCallback(async (command: string) => {
    if (!command.trim()) return

    const mark = performanceOptimizer.metrics.markTime('command-execution')
    
    // Add to history
    commandHistoryRef.current.unshift(command)
    if (commandHistoryRef.current.length > 50) {
      commandHistoryRef.current = commandHistoryRef.current.slice(0, 50)
    }
    historyIndexRef.current = -1

    try {
      await onExecuteCommand(command)
      mark()
    } catch (error) {
      mark()
      console.error('Command execution failed:', error)
    }
  }, [onExecuteCommand])

  // Handle input submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      handleExecuteCommand(input.trim())
      setInput('')
    }
  }, [input, handleExecuteCommand])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
          historyIndexRef.current++
          setInput(commandHistoryRef.current[historyIndexRef.current] || '')
        }
        break
        
      case 'ArrowDown':
        e.preventDefault()
        if (historyIndexRef.current > -1) {
          historyIndexRef.current--
          setInput(
            historyIndexRef.current === -1 
              ? '' 
              : commandHistoryRef.current[historyIndexRef.current] || ''
          )
        }
        break
        
      case 'Tab':
        e.preventDefault()
        const suggestions = getCommandSuggestions(input, profile)
        if (suggestions.length > 0) {
          setInput(suggestions[0])
        }
        break
    }
  }, [input, profile, getCommandSuggestions])

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      const container = terminalRef.current.querySelector('[data-virtualized-container]')
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    }
  }, [displayLines.length, autoScroll])

  // Copy terminal content
  const handleCopyAll = useCallback(() => {
    const content = displayLines
      .map(line => `[${line.timestamp.toLocaleTimeString()}] ${line.content}`)
      .join('\n')
    
    navigator.clipboard.writeText(content).then(() => {
      // Could show a toast notification here
    })
  }, [displayLines])

  // Export terminal log
  const handleExport = useCallback(() => {
    const content = displayLines
      .map(line => ({
        timestamp: line.timestamp.toISOString(),
        type: line.type,
        content: line.content,
        profile: line.profile
      }))
    
    const blob = new Blob([JSON.stringify(content, null, 2)], { 
      type: 'application/json' 
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `terminal-log-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [displayLines])

  const terminalHeight = isExpanded ? 600 : 400

  return (
    <div 
      ref={terminalRef}
      className={cn(
        "bg-gray-900 text-white rounded-lg border border-gray-700 overflow-hidden",
        className
      )}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Terminal</span>
          <div className="flex items-center gap-1">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-red-500"
            )} />
            <span className="text-xs text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded"
            onChange={(e) => debouncedSearch(e.target.value)}
          />
          
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              "px-2 py-1 text-xs rounded",
              autoScroll ? "bg-violet-600 text-white" : "bg-gray-600 text-gray-300"
            )}
          >
            Auto
          </button>
          
          {/* Copy button */}
          <button
            onClick={handleCopyAll}
            className="p-1 hover:bg-gray-700 rounded"
            title="Copy all"
          >
            <Copy className="w-4 h-4" />
          </button>
          
          {/* Export button */}
          <button
            onClick={handleExport}
            className="p-1 hover:bg-gray-700 rounded"
            title="Export log"
          >
            <Download className="w-4 h-4" />
          </button>
          
          {/* Expand/collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-700 rounded"
            title={isExpanded ? "Minimize" : "Maximize"}
          >
            {isExpanded ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="relative">
        <OptimizedVirtualList
          items={displayLines}
          itemHeight={itemHeight}
          height={terminalHeight - 80} // Subtract input area height
          renderItem={(line, index) => (
            <TerminalLineComponent line={line} index={index} />
          )}
          className="bg-gray-900"
          getItemKey={(line) => line.id}
        />
      </div>

      {/* Terminal Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-700 p-4">
        <div className="flex items-center gap-2">
          <span className="text-violet-400 font-mono">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-white font-mono"
            placeholder={`Enter command for ${profile} profile...`}
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="submit"
            disabled={!input.trim() || !isConnected}
            className={cn(
              "px-3 py-1 rounded text-sm font-medium transition-colors",
              input.trim() && isConnected
                ? "bg-violet-600 hover:bg-violet-700 text-white"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            )}
          >
            Execute
          </button>
        </div>
        
        {/* Command suggestions */}
        {input && (
          <div className="mt-2 flex flex-wrap gap-1">
            {getCommandSuggestions(input, profile).slice(0, 3).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setInput(suggestion)}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </form>
      
      {/* Performance info (dev mode) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 px-4 py-1 border-t border-gray-800">
          Lines: {displayLines.length} | Filtered: {filteredLines.length} | 
          Memory: {Math.round(performanceOptimizer.memory.getEstimatedUsage() / 1024)}KB
        </div>
      )}
    </div>
  )
}