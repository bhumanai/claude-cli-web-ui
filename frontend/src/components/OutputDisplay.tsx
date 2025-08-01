import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Clock, CheckCircle, XCircle, Loader2, Copy, Trash2, Pause, Play, Download } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatTimestamp, parseCommandOutput } from '@/utils/helpers'
import { CommandHistory } from '@/types'

interface OutputDisplayProps {
  commandHistory: CommandHistory[]
  onClear: () => void
  maxBufferSize?: number
  autoScroll?: boolean
}

interface StreamingOutput {
  id: string
  chunks: string[]
  isComplete: boolean
  lastUpdate: number
}

export const OutputDisplay: React.FC<OutputDisplayProps> = ({
  commandHistory,
  onClear,
  maxBufferSize = 1000,
  autoScroll = true
}) => {
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Real-time streaming state
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(autoScroll)
  const [streamingOutputs, setStreamingOutputs] = useState<Map<string, StreamingOutput>>(new Map())
  const [isPaused, setIsPaused] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  
  // Performance optimization: virtualize large command histories
  const displayedHistory = useMemo(() => {
    if (commandHistory.length <= maxBufferSize) {
      return commandHistory
    }
    
    // Keep recent commands and ensure we don't lose pending commands
    const pendingCommands = commandHistory.filter(cmd => cmd.status === 'pending')
    const recentCommands = commandHistory.slice(-maxBufferSize + pendingCommands.length)
    
    // Merge pending and recent, removing duplicates
    const uniqueCommands = new Map()
    ;[...pendingCommands, ...recentCommands].forEach(cmd => {
      uniqueCommands.set(cmd.id, cmd)
    })
    
    return Array.from(uniqueCommands.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }, [commandHistory, maxBufferSize])

  // Scroll handling
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const newIsAtBottom = scrollTop + clientHeight >= scrollHeight - 50 // 50px threshold
    
    if (newIsAtBottom !== isAtBottom) {
      setIsAtBottom(newIsAtBottom)
    }
  }, [isAtBottom])

  // Auto-scroll management
  useEffect(() => {
    if (isAutoScrollEnabled && isAtBottom && !isPaused && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [displayedHistory, isAutoScrollEnabled, isAtBottom, isPaused])

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true })
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  // Utility functions
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  const handleExportHistory = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      commandCount: displayedHistory.length,
      commands: displayedHistory.map(cmd => ({
        command: cmd.command,
        timestamp: cmd.timestamp,
        status: cmd.status,
        output: cmd.output,
        error: cmd.error
      }))
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `claude-cli-history-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [displayedHistory])

  const toggleAutoScroll = useCallback(() => {
    setIsAutoScrollEnabled(prev => !prev)
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
      setIsAtBottom(true)
    }
  }, [])

  const getStatusIcon = (status: CommandHistory['status']) => {
    switch (status) {
      case 'pending':
        return <Loader2 size={16} className="animate-spin text-yellow-500" />
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />
      case 'error':
        return <XCircle size={16} className="text-red-500" />
      default:
        return null
    }
  }

  const renderOutput = (entry: CommandHistory) => {
    if (entry.status === 'pending') {
      const streamingOutput = streamingOutputs.get(entry.id)
      
      if (streamingOutput && streamingOutput.chunks.length > 0) {
        // Show streaming content as it arrives
        const content = streamingOutput.chunks.join('')
        const { type } = parseCommandOutput(content)
        
        return (
          <div className="group relative">
            <div className="flex items-center gap-2 mb-2 text-yellow-600 dark:text-yellow-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Streaming output...</span>
              <span className="text-xs">({streamingOutput.chunks.length} chunks)</span>
            </div>
            
            <pre
              className={cn(
                'whitespace-pre-wrap font-mono text-sm max-h-96 overflow-y-auto',
                'p-3 rounded-lg border',
                type === 'error' 
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
              )}
            >
              {content}
              <span className="animate-pulse">▋</span> {/* Cursor indicator */}
            </pre>
            
            <button
              onClick={() => handleCopy(content)}
              className={cn(
                'absolute top-12 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100',
                'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600',
                'text-gray-600 dark:text-gray-400',
                'transition-opacity duration-200'
              )}
              title="Copy streaming output"
            >
              <Copy size={14} />
            </button>
          </div>
        )
      }
      
      return (
        <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Executing...</span>
        </div>
      )
    }

    const output = entry.output || entry.error || ''
    if (!output) return null

    const { type, content } = parseCommandOutput(output)

    return (
      <div className="group relative">
        <pre
          className={cn(
            'whitespace-pre-wrap font-mono text-sm',
            'p-3 rounded-lg border max-h-96 overflow-y-auto',
            type === 'error' 
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
              : type === 'json'
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
              : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
          )}
        >
          {content}
        </pre>
        
        {/* Copy button */}
        <button
          onClick={() => handleCopy(content)}
          className={cn(
            'absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100',
            'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600',
            'text-gray-600 dark:text-gray-400',
            'transition-opacity duration-200'
          )}
          title="Copy output"
        >
          <Copy size={14} />
        </button>
      </div>
    )
  }

  if (commandHistory.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="text-6xl mb-4">💻</div>
          <h3 className="text-lg font-medium mb-2">Welcome to Claude CLI</h3>
          <p className="text-sm">Enter a command below to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Command History ({displayedHistory.length})
          </h2>
          
          {/* Buffer status */}
          {commandHistory.length > maxBufferSize && (
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
              Showing {displayedHistory.length} of {commandHistory.length} commands
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle */}
          <button
            onClick={toggleAutoScroll}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded text-xs',
              isAutoScrollEnabled
                ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
              'hover:opacity-80 transition-opacity'
            )}
            title={`Auto-scroll: ${isAutoScrollEnabled ? 'ON' : 'OFF'}`}
          >
            {isAutoScrollEnabled ? '📜' : '⏸️'} Auto
          </button>
          
          {/* Pause toggle */}
          <button
            onClick={togglePause}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded text-xs',
              isPaused
                ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
              'hover:opacity-80 transition-opacity'
            )}
            title={`Output: ${isPaused ? 'PAUSED' : 'LIVE'}`}
          >
            {isPaused ? <Pause size={12} /> : <Play size={12} />}
            {isPaused ? 'Paused' : 'Live'}
          </button>
          
          {/* Scroll to bottom */}
          {!isAtBottom && (
            <button
              onClick={scrollToBottom}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 rounded text-xs',
                'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
                'hover:opacity-80 transition-opacity animate-pulse'
              )}
              title="Scroll to bottom"
            >
              ⬇️ Bottom
            </button>
          )}
          
          {/* Export button */}
          <button
            onClick={handleExportHistory}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded text-xs',
              'text-gray-600 dark:text-gray-400',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              'transition-colors duration-200'
            )}
            title="Export command history"
          >
            <Download size={12} />
            Export
          </button>
          
          {/* Clear button */}
          <button
            onClick={onClear}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded text-xs',
              'text-gray-600 dark:text-gray-400',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              'transition-colors duration-200'
            )}
            title="Clear history"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Output container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {displayedHistory.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              'border rounded-lg p-4',
              'bg-white dark:bg-gray-800/50',
              'border-gray-200 dark:border-gray-700',
              'transition-colors duration-200',
              entry.status === 'pending' && 'ring-2 ring-yellow-500/20'
            )}
          >
            {/* Command header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {getStatusIcon(entry.status)}
                <span className="font-mono text-sm font-medium text-violet-600 dark:text-violet-400">
                  $ {entry.command}
                </span>
                
                {/* Streaming indicator */}
                {entry.status === 'pending' && streamingOutputs.has(entry.id) && (
                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full">
                    Streaming
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Clock size={12} />
                {formatTimestamp(entry.timestamp)}
              </div>
            </div>

            {/* Command output */}
            {!isPaused && renderOutput(entry)}
            {isPaused && entry.status === 'pending' && (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Pause size={16} />
                <span className="text-sm">Output paused</span>
              </div>
            )}
          </div>
        ))}
        
        <div ref={endRef} />
      </div>
    </div>
  )
}