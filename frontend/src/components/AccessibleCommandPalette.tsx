import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Command, ArrowUp, ArrowDown, Enter as EnterIcon } from 'lucide-react'
import { ariaUtils, screenReader, KeyboardNavigationManager } from '../utils/accessibility'
import { debounce } from '../utils/performanceOptimizations'
import { cn } from '../utils/cn'
import type { UserProfile } from './ProfileSelector'

interface CommandItem {
  id: string
  title: string
  description: string
  category: string
  profile?: UserProfile
  shortcut?: string
  action: () => void
}

interface AccessibleCommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: CommandItem[]
  recentCommands?: CommandItem[]
  profile?: UserProfile
  placeholder?: string
  className?: string
}

export const AccessibleCommandPalette: React.FC<AccessibleCommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
  recentCommands = [],
  profile,
  placeholder = "Type a command or search...",
  className
}) => {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // Debounced search to improve performance
  const debouncedSearch = useCallback(
    debounce((searchQuery: string) => {
      // Reset active index when search changes
      setActiveIndex(0)
      
      // Announce search results to screen readers
      const resultCount = filteredCommands.length
      screenReader.announce.polite(
        `${resultCount} command${resultCount !== 1 ? 's' : ''} found`
      )
    }, 300),
    []
  )

  // Filter commands based on query and profile
  const filteredCommands = useMemo(() => {
    let filtered = commands

    // Filter by profile if specified
    if (profile) {
      filtered = filtered.filter(cmd => !cmd.profile || cmd.profile === profile)
    }

    // Filter by category if selected
    if (selectedCategory) {
      filtered = filtered.filter(cmd => cmd.category === selectedCategory)
    }

    // Filter by search query
    if (query.trim()) {
      const searchTerm = query.toLowerCase()
      filtered = filtered.filter(cmd =>
        cmd.title.toLowerCase().includes(searchTerm) ||
        cmd.description.toLowerCase().includes(searchTerm) ||
        cmd.category.toLowerCase().includes(searchTerm)
      )
    }

    return filtered
  }, [commands, profile, selectedCategory, query])

  // Get categories for filtering
  const categories = useMemo(() => {
    const cats = new Set(commands.map(cmd => cmd.category))
    return Array.from(cats).sort()
  }, [commands])

  // Display commands (recent + filtered)
  const displayCommands = useMemo(() => {
    if (!query.trim() && recentCommands.length > 0) {
      return [
        ...recentCommands.slice(0, 3),
        ...filteredCommands.filter(cmd => !recentCommands.some(recent => recent.id === cmd.id))
      ]
    }
    return filteredCommands
  }, [query, recentCommands, filteredCommands])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(prev => 
          prev < displayCommands.length - 1 ? prev + 1 : 0
        )
        break
        
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(prev => 
          prev > 0 ? prev - 1 : displayCommands.length - 1
        )
        break
        
      case 'Enter':
        e.preventDefault()
        if (displayCommands[activeIndex]) {
          executeCommand(displayCommands[activeIndex])
        }
        break
        
      case 'Escape':
        e.preventDefault()
        onClose()
        break
        
      case 'Tab':
        // Allow tab navigation through categories
        if (e.shiftKey) {
          // Handle reverse tab if needed
        }
        break
    }
  }, [displayCommands, activeIndex, onClose])

  const executeCommand = useCallback((command: CommandItem) => {
    try {
      command.action()
      screenReader.announce.assertive(`Executed: ${command.title}`)
      onClose()
    } catch (error) {
      screenReader.announce.assertive(`Failed to execute: ${command.title}`)
      console.error('Command execution failed:', error)
    }
  }, [onClose])

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    debouncedSearch(value)
  }, [debouncedSearch])

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previouslyFocusedRef.current = document.activeElement as HTMLElement
      
      // Focus input
      setTimeout(() => {
        inputRef.current?.focus()
        
        // Set up combobox ARIA attributes
        if (inputRef.current && listboxRef.current) {
          ariaUtils.combobox.setup(inputRef.current, listboxRef.current)
          ariaUtils.combobox.updateExpanded(inputRef.current, true)
        }
      }, 10)

      // Announce opening
      screenReader.announce.assertive('Command palette opened')
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden'

      return () => {
        document.body.style.overflow = ''
        
        // Restore focus
        if (previouslyFocusedRef.current) {
          previouslyFocusedRef.current.focus()
        }
        
        // Announce closing
        screenReader.announce.polite('Command palette closed')
      }
    }
  }, [isOpen])

  // Update ARIA active descendant
  useEffect(() => {
    if (inputRef.current && displayCommands[activeIndex]) {
      ariaUtils.combobox.setActiveDescendant(
        inputRef.current,
        `command-${displayCommands[activeIndex].id}`
      )
    }
  }, [activeIndex, displayCommands])

  // Scroll active item into view
  useEffect(() => {
    if (listboxRef.current && activeIndex >= 0) {
      const activeElement = listboxRef.current.children[activeIndex] as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        })
      }
    }
  }, [activeIndex])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Command palette */}
      <div className="flex min-h-full items-start justify-center p-4 pt-16">
        <div
          ref={modalRef}  
          className={cn(
            "relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-xl",
            "border border-gray-200 dark:border-gray-700 overflow-hidden",
            className
          )}
        >
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 p-4">
            <h2 id="command-palette-title" className="sr-only">
              Command Palette
            </h2>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={cn(
                  "w-full pl-10 pr-4 py-3 text-lg",
                  "bg-transparent border-none outline-none",
                  "text-gray-900 dark:text-gray-100",
                  "placeholder-gray-500 dark:placeholder-gray-400"
                )}
                aria-label="Search commands"
                aria-expanded="true"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </div>

          {/* Categories */}
          {categories.length > 1 && (
            <div className="border-b border-gray-200 dark:border-gray-700 p-2">
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "px-3 py-1 text-sm rounded-full transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-violet-500",
                    !selectedCategory
                      ? "bg-violet-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  )}
                  aria-pressed={!selectedCategory}
                >
                  All
                </button>
                {categories.map(category => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      "px-3 py-1 text-sm rounded-full transition-colors capitalize",
                      "focus:outline-none focus:ring-2 focus:ring-violet-500",
                      selectedCategory === category
                        ? "bg-violet-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    )}
                    aria-pressed={selectedCategory === category}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Commands list */}
          <div className="max-h-96 overflow-y-auto">
            {displayCommands.length > 0 ? (
              <ul
                ref={listboxRef}
                role="listbox"
                aria-label="Commands"
                className="py-2"
              >
                {displayCommands.map((command, index) => (
                  <li
                    key={command.id}
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "px-4 py-3 cursor-pointer transition-colors",
                      "hover:bg-gray-50 dark:hover:bg-gray-700",
                      index === activeIndex && "bg-violet-50 dark:bg-violet-900/20"
                    )}
                    onClick={() => executeCommand(command)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {command.title}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {command.description}
                            </div>
                          </div>
                          {command.shortcut && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              {command.shortcut.split('+').map((key, i) => (
                                <React.Fragment key={key}>
                                  {i > 0 && <span>+</span>}
                                  <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                    {key}
                                  </kbd>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Category badge */}
                    <div className="mt-1">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                        {command.category}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                <Command className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No commands found</p>
                {query && (
                  <p className="text-sm mt-1">
                    Try adjusting your search or selecting a different category
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />
                  <ArrowDown className="w-3 h-3" />
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-1">
                  <EnterIcon className="w-3 h-3" />
                  <span>Execute</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
                    Esc
                  </kbd>
                  <span>Close</span>
                </div>
              </div>
              
              {displayCommands.length > 0 && (
                <div>
                  {activeIndex + 1} of {displayCommands.length}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}