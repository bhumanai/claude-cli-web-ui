import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, Filter, Download, Search } from 'lucide-react'
import { OptimizedVirtualList } from './OptimizedVirtualList'
import { debounce, memoize, performanceOptimizer } from '../utils/performanceOptimizations'
import { cn } from '../utils/cn'

interface DataGridColumn {
  key: string
  title: string
  width?: number
  sortable?: boolean
  filterable?: boolean
  formatter?: (value: any, row: any) => React.ReactNode
  align?: 'left' | 'center' | 'right'
}

interface DataGridRow {
  id: string
  [key: string]: any
}

interface OptimizedDataGridProps {
  columns: DataGridColumn[]
  data: DataGridRow[]
  height?: number
  rowHeight?: number
  striped?: boolean
  selectable?: boolean
  onRowSelect?: (rows: DataGridRow[]) => void
  onSort?: (column: string, direction: 'asc' | 'desc') => void
  onFilter?: (filters: Record<string, string>) => void
  className?: string
}

type SortDirection = 'asc' | 'desc' | null

// Memoized cell component
const DataGridCell = React.memo<{
  column: DataGridColumn
  value: any
  row: DataGridRow
  width: number
}>(({ column, value, row, width }) => {
  const content = column.formatter ? column.formatter(value, row) : value

  return (
    <div
      className={cn(
        "px-3 py-2 border-r border-gray-200 dark:border-gray-700 truncate",
        column.align === 'center' && "text-center",
        column.align === 'right' && "text-right"
      )}
      style={{ width }}
      title={typeof content === 'string' ? content : String(value)}
    >
      {content}
    </div>
  )
})

DataGridCell.displayName = 'DataGridCell'

// Memoized row component
const DataGridRowComponent = React.memo<{
  row: DataGridRow
  columns: DataGridColumn[]
  columnWidths: number[]
  isSelected: boolean
  isSelectable: boolean
  onSelect: (row: DataGridRow) => void
  index: number
  striped: boolean
}>(({ row, columns, columnWidths, isSelected, isSelectable, onSelect, index, striped }) => {
  const mark = performanceOptimizer.metrics.markTime(`data-grid-row-${index}`)
  
  useEffect(() => {
    mark()
  })

  return (
    <div
      className={cn(
        "flex items-stretch border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors",
        striped && index % 2 === 1 && "bg-gray-50/50 dark:bg-gray-800/50",
        isSelected && "bg-violet-50 dark:bg-violet-900/20",
        isSelectable && "cursor-pointer"
      )}
      onClick={() => isSelectable && onSelect(row)}
    >
      {isSelectable && (
        <div className="flex items-center px-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(row)}
            className="rounded border-gray-300 dark:border-gray-600"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      
      {columns.map((column, colIndex) => (
        <DataGridCell
          key={column.key}
          column={column}
          value={row[column.key]}
          row={row}
          width={columnWidths[colIndex]}
        />
      ))}
    </div>
  )
})

DataGridRowComponent.displayName = 'DataGridRowComponent'

export const OptimizedDataGrid: React.FC<OptimizedDataGridProps> = ({
  columns,
  data,
  height = 400,
  rowHeight = 48,
  striped = true,
  selectable = false,
  onRowSelect,
  onSort,
  onFilter,
  className
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  
  const containerRef = useRef<HTMLDivElement>(null)

  // Memoize column widths calculation
  const columnWidths = useMemo(() => {
    const containerWidth = 800 // Default width, could be dynamic
    const totalSpecifiedWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0)
    const flexibleColumns = columns.filter(col => !col.width).length
    const availableWidth = containerWidth - totalSpecifiedWidth - (selectable ? 60 : 0)
    const flexWidth = flexibleColumns > 0 ? Math.max(120, availableWidth / flexibleColumns) : 0

    return columns.map(col => col.width || flexWidth)
  }, [columns, selectable])

  // Memoized sorting function
  const sortData = useMemo(() => 
    memoize((data: DataGridRow[], column: string | null, direction: SortDirection) => {
      if (!column || !direction) return data

      return [...data].sort((a, b) => {
        const aVal = a[column]
        const bVal = b[column]
        
        if (aVal === bVal) return 0
        
        const comparison = aVal < bVal ? -1 : 1
        return direction === 'asc' ? comparison : -comparison
      })
    }),
    [sortColumn, sortDirection]
  )

  // Memoized filtering function
  const filterData = useMemo(() =>
    memoize((data: DataGridRow[], filters: Record<string, string>, searchQuery: string) => {
      let filtered = data

      // Apply column filters
      Object.entries(filters).forEach(([column, filter]) => {
        if (filter.trim()) {
          filtered = filtered.filter(row => {
            const value = String(row[column] || '').toLowerCase()
            return value.includes(filter.toLowerCase())
          })
        }
      })

      // Apply global search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter(row =>
          columns.some(col => {
            const value = String(row[col.key] || '').toLowerCase()
            return value.includes(query)
          })
        )
      }

      return filtered
    }),
    [columns, filters, searchQuery]
  )

  // Process data through filters and sorting
  const processedData = useMemo(() => {
    let result = filterData(data, filters, searchQuery)
    result = sortData(result, sortColumn, sortDirection)
    return result.map((row, index) => ({ ...row, _index: index }))
  }, [data, filters, searchQuery, sortData, sortColumn, sortDirection, filterData])

  // Handle sorting
  const handleSort = useCallback((column: string) => {
    let newDirection: SortDirection = 'asc'
    
    if (sortColumn === column) {
      newDirection = sortDirection === 'asc' ? 'desc' : sortDirection === 'desc' ? null : 'asc'
    }
    
    setSortColumn(newDirection ? column : null)
    setSortDirection(newDirection)
    onSort?.(column, newDirection || 'asc')
  }, [sortColumn, sortDirection, onSort])

  // Handle filtering
  const handleFilter = useCallback(
    debounce((column: string, value: string) => {
      const newFilters = { ...filters, [column]: value }
      setFilters(newFilters)
      onFilter?.(newFilters)
    }, 300),
    [filters, onFilter]
  )

  // Handle row selection
  const handleRowSelect = useCallback((row: DataGridRow) => {
    const newSelected = new Set(selectedRows)
    
    if (newSelected.has(row.id)) {
      newSelected.delete(row.id)
    } else {
      newSelected.add(row.id)
    }
    
    setSelectedRows(newSelected)
    
    const selectedRowsData = processedData.filter(r => newSelected.has(r.id))
    onRowSelect?.(selectedRowsData)
  }, [selectedRows, processedData, onRowSelect])

  // Select all/none
  const handleSelectAll = useCallback(() => {
    if (selectedRows.size === processedData.length) {
      setSelectedRows(new Set())
      onRowSelect?.([])
    } else {
      const allIds = new Set(processedData.map(row => row.id))
      setSelectedRows(allIds)
      onRowSelect?.(processedData)
    }
  }, [selectedRows.size, processedData, onRowSelect])

  // Export data
  const handleExport = useCallback(() => {
    const csvContent = [
      columns.map(col => col.title).join(','),
      ...processedData.map(row =>
        columns.map(col => {
          const value = row[col.key]
          return typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : value
        }).join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `data-export-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [processedData, columns])

  const headerHeight = 48
  const filterHeight = 40
  const totalHeaderHeight = headerHeight + (columns.some(col => col.filterable) ? filterHeight : 0)

  return (
    <div 
      ref={containerRef}
      className={cn(
        "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search all columns..."
              className="pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {selectable && selectedRows.size > 0 && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedRows.size} selected
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-stretch" style={{ height: headerHeight }}>
          {selectable && (
            <div className="flex items-center px-3 border-r border-gray-200 dark:border-gray-700">
              <input
                type="checkbox"
                checked={selectedRows.size === processedData.length && processedData.length > 0}
                onChange={handleSelectAll}
                className="rounded border-gray-300 dark:border-gray-600"
              />
            </div>
          )}
          
          {columns.map((column, index) => (
            <div
              key={column.key}
              className="flex items-center px-3 border-r border-gray-200 dark:border-gray-700 font-medium text-gray-900 dark:text-gray-100"
              style={{ width: columnWidths[index] }}
            >
              <span className="flex-1 truncate">{column.title}</span>
              
              {column.sortable && (
                <button
                  onClick={() => handleSort(column.key)}
                  className="ml-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  {sortColumn === column.key ? (
                    sortDirection === 'asc' ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )
                  ) : (
                    <Filter className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
        
        {/* Filter Row */}
        {columns.some(col => col.filterable) && (
          <div className="flex items-stretch" style={{ height: filterHeight }}>
            {selectable && <div style={{ width: 60 }} />}
            
            {columns.map((column, index) => (
              <div
                key={`filter-${column.key}`}
                className="px-2 border-r border-gray-200 dark:border-gray-700"
                style={{ width: columnWidths[index] }}
              >
                {column.filterable && (
                  <input
                    type="text"
                    placeholder={`Filter ${column.title}...`}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                    onChange={(e) => handleFilter(column.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Rows */}
      <OptimizedVirtualList
        items={processedData}
        itemHeight={rowHeight}
        height={height - totalHeaderHeight - 60} // Subtract toolbar and header heights
        renderItem={(row, index) => (
          <DataGridRowComponent
            row={row}
            columns={columns}
            columnWidths={columnWidths}
            isSelected={selectedRows.has(row.id)}
            isSelectable={selectable}
            onSelect={handleRowSelect}
            index={index}
            striped={striped}
          />
        )}
        getItemKey={(row) => row.id}
        className="bg-white dark:bg-gray-800"
      />

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-sm text-gray-600 dark:text-gray-400">
        Showing {processedData.length} of {data.length} rows
        {selectedRows.size > 0 && ` (${selectedRows.size} selected)`}
      </div>
    </div>
  )
}