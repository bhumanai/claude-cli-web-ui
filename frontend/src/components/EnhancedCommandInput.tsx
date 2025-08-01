import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal, ArrowUp, ArrowDown, Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'

interface EnhancedCommandInputProps {
  onExecute: (command: string) => void
  isExecuting?: boolean
  disabled?: boolean
  placeholder?: string
  commandHistory?: string[]
  className?: string
}

export const EnhancedCommandInput: React.FC<EnhancedCommandInputProps> = ({
  onExecute,
  isExecuting = false,
  disabled = false,
  placeholder = "Enter a command...",
  commandHistory = [],
  className
}) => {
  const [command, setCommand] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showHint, setShowHint] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isComposing, setIsComposing] = useState(false)

  // Command shortcuts
  const shortcuts = [
    { key: '↑↓', description: 'Navigate history' },
    { key: 'Tab', description: 'Autocomplete' },
    { key: 'Ctrl+L', description: 'Clear' },
    { key: 'Ctrl+C', description: 'Cancel' }
  ]

  // Handle command execution
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || isExecuting || disabled || isComposing) return
    
    onExecute(command)
    setCommand('')
    setHistoryIndex(-1)
  }, [command, isExecuting, disabled, isComposing, onExecute])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Don't handle special keys during composition
    if (isComposing) return

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (commandHistory.length > 0) {
          const newIndex = historyIndex < commandHistory.length - 1 
            ? historyIndex + 1 
            : commandHistory.length - 1
          setHistoryIndex(newIndex)
          setCommand(commandHistory[commandHistory.length - 1 - newIndex])
        }
        break

      case 'ArrowDown':
        e.preventDefault()
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1
          setHistoryIndex(newIndex)
          setCommand(commandHistory[commandHistory.length - 1 - newIndex])
        } else if (historyIndex === 0) {
          setHistoryIndex(-1)
          setCommand('')
        }
        break

      case 'Tab':
        e.preventDefault()
        // Implement autocomplete logic here
        break

      case 'l':
        if (e.ctrlKey) {
          e.preventDefault()
          setCommand('')
        }
        break

      case 'c':
        if (e.ctrlKey && command.trim()) {
          e.preventDefault()
          setCommand('')
        }
        break
    }
  }, [commandHistory, historyIndex, isComposing])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Show/hide hints based on focus
  useEffect(() => {
    const input = inputRef.current
    if (!input) return

    const handleFocus = () => setShowHint(true)
    const handleBlur = () => setShowHint(false)

    input.addEventListener('focus', handleFocus)
    input.addEventListener('blur', handleBlur)

    return () => {
      input.removeEventListener('focus', handleFocus)
      input.removeEventListener('blur', handleBlur)
    }
  }, [])

  return (
    <div className={cn("relative", className)}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
              {isExecuting ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <Terminal className="h-5 w-5 text-gray-400" />
              )}
            </div>
            
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder={placeholder}
              disabled={disabled || isExecuting}
              className={cn(
                "w-full pl-12 pr-4 py-3 font-mono text-sm",
                "border border-gray-300 dark:border-gray-600 rounded-lg",
                "bg-white dark:bg-gray-800",
                "text-gray-900 dark:text-gray-100",
                "placeholder-gray-500 dark:placeholder-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-all duration-200"
              )}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />

            {/* History navigation indicator */}
            {historyIndex >= 0 && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <ArrowUp className="w-3 h-3" />
                  <span>{historyIndex + 1}/{commandHistory.length}</span>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!command.trim() || isExecuting || disabled}
            className={cn(
              "px-6 py-3 rounded-lg font-medium transition-all duration-200",
              "bg-violet-600 hover:bg-violet-700 text-white",
              "disabled:bg-gray-300 dark:disabled:bg-gray-700",
              "disabled:text-gray-500 dark:disabled:text-gray-400",
              "disabled:cursor-not-allowed",
              "focus:outline-none focus:ring-2 focus:ring-violet-500"
            )}
          >
            {isExecuting ? 'Executing...' : 'Execute'}
          </button>
        </div>
      </form>

      {/* Keyboard shortcuts hint */}
      {showHint && shortcuts.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 flex items-center gap-4 px-3 py-2 bg-gray-900/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg">
          {shortcuts.map((shortcut, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <kbd className="px-2 py-1 bg-gray-800 dark:bg-gray-700 rounded text-gray-300">
                {shortcut.key}
              </kbd>
              <span className="text-gray-400">{shortcut.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}