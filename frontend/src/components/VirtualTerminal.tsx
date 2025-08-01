import React, { useRef, useEffect, useState, useCallback } from 'react'
import { FixedSizeList as List } from 'react-window'
import { CommandHistory } from '../types/command'
import { formatTimestamp } from '../utils/helpers'
import { ChevronRight } from 'lucide-react'

interface VirtualTerminalProps {
  commandHistory: CommandHistory[]
  className?: string
}

interface RowData {
  items: Array<{
    type: 'command' | 'output'
    content: string
    timestamp?: Date
    id: string
  }>
}

const ROW_HEIGHT = 24 // Height of each line in pixels
const MAX_VISIBLE_ROWS = 30 // Maximum rows to show at once

export const VirtualTerminal: React.FC<VirtualTerminalProps> = ({
  commandHistory,
  className
}) => {
  const listRef = useRef<List>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Convert command history to flat list of rows
  const rowData: RowData = {
    items: commandHistory.flatMap(cmd => {
      const rows = []
      
      // Add command row
      rows.push({
        type: 'command' as const,
        content: cmd.command,
        timestamp: cmd.timestamp,
        id: `${cmd.id}-cmd`
      })
      
      // Add output rows
      if (cmd.output) {
        const outputLines = cmd.output.split('\n')
        outputLines.forEach((line, idx) => {
          rows.push({
            type: 'output' as const,
            content: line,
            id: `${cmd.id}-out-${idx}`
          })
        })
      }
      
      return rows
    })
  }

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (listRef.current && rowData.items.length > 0) {
      listRef.current.scrollToItem(rowData.items.length - 1, 'end')
    }
  }, [rowData.items.length])

  const Row = useCallback(({ index, style, data }: {
    index: number
    style: React.CSSProperties
    data: RowData
  }) => {
    const item = data.items[index]
    
    if (item.type === 'command') {
      return (
        <div style={style} className="flex items-center gap-2 font-mono text-sm">
          <span className="text-violet-500 dark:text-violet-400">$</span>
          <span className="text-gray-900 dark:text-gray-100">{item.content}</span>
          {item.timestamp && (
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              {formatTimestamp(item.timestamp)}
            </span>
          )}
        </div>
      )
    }
    
    return (
      <div style={style} className="font-mono text-sm text-gray-700 dark:text-gray-300 pl-6">
        {item.content || '\u00A0' /* Non-breaking space for empty lines */}
      </div>
    )
  }, [])

  const itemCount = rowData.items.length
  const listHeight = Math.min(dimensions.height, itemCount * ROW_HEIGHT)

  return (
    <div ref={containerRef} className={className}>
      {itemCount === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <div className="text-6xl mb-4">💻</div>
            <h3 className="text-lg font-medium mb-2">Welcome to Claude CLI</h3>
            <p className="text-sm">Enter a command below to get started</p>
          </div>
        </div>
      ) : (
        <List
          ref={listRef}
          height={listHeight}
          itemCount={itemCount}
          itemSize={ROW_HEIGHT}
          width={dimensions.width}
          itemData={rowData}
          className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700"
        >
          {Row}
        </List>
      )}
    </div>
  )
}