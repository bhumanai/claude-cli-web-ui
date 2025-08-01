import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { calculateVisibleItems, throttle } from '../utils/performanceOptimizations'
import { cn } from '../utils/cn'

interface VirtualListItem {
  id: string
  height?: number
  data: any
}

interface OptimizedVirtualListProps<T extends VirtualListItem> {
  items: T[]
  itemHeight: number
  height: number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number
  className?: string
  onScroll?: (scrollTop: number) => void
  getItemKey?: (item: T, index: number) => string
}

export const OptimizedVirtualList = <T extends VirtualListItem>({
  items,
  itemHeight,
  height,
  renderItem,
  overscan = 5,
  className,
  onScroll,
  getItemKey = (item, index) => item.id || index.toString()
}: OptimizedVirtualListProps<T>) => {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout>()

  // Memoize visible items calculation
  const visibleItems = useMemo(() => {
    return calculateVisibleItems(height, itemHeight, scrollTop, items.length, overscan)
  }, [height, itemHeight, scrollTop, items.length, overscan])

  // Throttled scroll handler for performance
  const handleScroll = useCallback(
    throttle((e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop
      setScrollTop(newScrollTop)
      onScroll?.(newScrollTop)
      
      // Track scrolling state
      scrollingRef.current = true
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      
      // Set timeout to detect scroll end
      scrollTimeoutRef.current = setTimeout(() => {
        scrollingRef.current = false
      }, 150)
    }, 16), // ~60fps
    [onScroll, itemHeight]
  )

  // Memoize rendered items to prevent unnecessary re-renders
  const renderedItems = useMemo(() => {
    const items_slice = items.slice(visibleItems.start, visibleItems.end + 1)
    
    return items_slice.map((item, index) => {
      const actualIndex = visibleItems.start + index
      const key = getItemKey(item, actualIndex)
      
      return (
        <div
          key={key}
          style={{
            position: 'absolute',
            top: actualIndex * itemHeight,
            left: 0,
            right: 0,
            height: itemHeight
          }}
          className="flex items-center"
        >
          {renderItem(item, actualIndex)}
        </div>
      )
    })
  }, [items, visibleItems.start, visibleItems.end, itemHeight, renderItem, getItemKey])

  // Scroll to item method
  const scrollToItem = useCallback((index: number, align: 'start' | 'center' | 'end' = 'start') => {
    if (!containerRef.current) return
    
    const container = containerRef.current
    let targetScrollTop: number
    
    switch (align) {
      case 'center':
        targetScrollTop = index * itemHeight - (height / 2) + (itemHeight / 2)
        break
      case 'end':
        targetScrollTop = index * itemHeight - height + itemHeight
        break
      default:
        targetScrollTop = index * itemHeight
        break
    }
    
    // Clamp to valid range
    targetScrollTop = Math.max(0, Math.min(targetScrollTop, items.length * itemHeight - height))
    
    container.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    })
  }, [itemHeight, height, items.length])

  // Expose scroll methods via ref
  React.useImperativeHandle(containerRef, () => ({
    scrollToItem,
    scrollToTop: () => scrollToItem(0),
    scrollToBottom: () => scrollToItem(items.length - 1, 'end')
  }))

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  const totalHeight = items.length * itemHeight

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-auto",
        scrollingRef.current && "scrolling", // Add scrolling class for CSS optimizations
        className
      )}
      style={{ height }}
      onScroll={handleScroll}
    >
      {/* Virtual spacer for total height */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Rendered visible items */}
        {renderedItems}
      </div>
      
      {/* Scroll indicators */}
      <div className="absolute top-2 right-2 pointer-events-none">
        <div className="bg-black/20 dark:bg-white/20 rounded px-2 py-1 text-xs text-white dark:text-black">
          {Math.round((scrollTop / Math.max(1, totalHeight - height)) * 100)}%
        </div>
      </div>
    </div>
  )
}

// Memoized item wrapper to prevent unnecessary re-renders
export const VirtualListItem = React.memo<{
  children: React.ReactNode
  className?: string
}>(({ children, className }) => (
  <div className={cn("w-full", className)}>
    {children}
  </div>
))

VirtualListItem.displayName = 'VirtualListItem'

// Hook for virtual list state management
export const useVirtualList = <T extends VirtualListItem>(
  items: T[],
  options: {
    itemHeight: number
    containerHeight: number
    overscan?: number
  }
) => {
  const [scrollTop, setScrollTop] = useState(0)
  
  const visibleRange = useMemo(() => {
    return calculateVisibleItems(
      options.containerHeight,
      options.itemHeight,
      scrollTop,
      items.length,
      options.overscan
    )
  }, [options.containerHeight, options.itemHeight, scrollTop, items.length, options.overscan])
  
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end + 1)
  }, [items, visibleRange.start, visibleRange.end])
  
  return {
    visibleItems,
    visibleRange,
    scrollTop,
    setScrollTop,
    totalHeight: items.length * options.itemHeight
  }
}