import React, { useState, useMemo } from 'react'
import {
  BarChart3,
  LineChart,
  PieChart,
  Download,
  Filter,
  RefreshCw,
  Table,
  TrendingUp,
  Calendar
} from 'lucide-react'
import { cn } from '../utils/cn'

interface DataPoint {
  label: string
  value: number
  category?: string
  date?: Date
}

interface ChartData {
  title: string
  type: 'bar' | 'line' | 'pie' | 'table'
  data: DataPoint[]
  color?: string
}

interface DataVisualizerProps {
  onExecuteCommand: (command: string) => void
  className?: string
}

export const DataVisualizer: React.FC<DataVisualizerProps> = ({
  onExecuteCommand,
  className
}) => {
  const [selectedChart, setSelectedChart] = useState<'revenue' | 'users' | 'performance'>('revenue')
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('month')
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar')

  // Sample data
  const chartData: Record<string, ChartData> = {
    revenue: {
      title: 'Revenue Analytics',
      type: chartType,
      data: [
        { label: 'Jan', value: 45000, category: 'revenue' },
        { label: 'Feb', value: 52000, category: 'revenue' },
        { label: 'Mar', value: 48000, category: 'revenue' },
        { label: 'Apr', value: 61000, category: 'revenue' },
        { label: 'May', value: 58000, category: 'revenue' },
        { label: 'Jun', value: 67000, category: 'revenue' }
      ],
      color: 'violet'
    },
    users: {
      title: 'User Growth',
      type: chartType,
      data: [
        { label: 'Week 1', value: 1200, category: 'new' },
        { label: 'Week 2', value: 1450, category: 'new' },
        { label: 'Week 3', value: 1680, category: 'new' },
        { label: 'Week 4', value: 1890, category: 'new' }
      ],
      color: 'blue'
    },
    performance: {
      title: 'API Performance',
      type: chartType,
      data: [
        { label: 'Login', value: 245, category: 'auth' },
        { label: 'Search', value: 189, category: 'api' },
        { label: 'Upload', value: 456, category: 'api' },
        { label: 'Process', value: 678, category: 'backend' }
      ],
      color: 'green'
    }
  }

  const currentData = chartData[selectedChart]

  // Calculate statistics
  const stats = useMemo(() => {
    const values = (currentData?.data || []).map(d => d.value)
    const sum = values.reduce((a, b) => a + b, 0)
    const avg = values.length > 0 ? sum / values.length : 0
    const max = values.length > 0 ? Math.max(...values) : 0
    const min = values.length > 0 ? Math.min(...values) : 0
    
    return { sum, avg, max, min }
  }, [currentData])

  const renderChart = () => {
    const { data = [], color = 'violet' } = currentData || {}
    const maxValue = data.length > 0 ? Math.max(...data.map(d => d.value)) : 100

    switch (chartType) {
      case 'bar':
        return (
          <div className="space-y-3">
            {data.map((item, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {item.value.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6">
                  <div
                    className={cn(
                      "h-6 rounded-full transition-all duration-500 flex items-center justify-end pr-2",
                      color === 'violet' && "bg-violet-500",
                      color === 'blue' && "bg-blue-500",
                      color === 'green' && "bg-green-500"
                    )}
                    style={{ width: `${(item.value / maxValue) * 100}%` }}
                  >
                    <span className="text-xs text-white font-medium">
                      {((item.value / maxValue) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )

      case 'line':
        return (
          <div className="h-64 flex items-end justify-between gap-2 px-4">
            {data.map((item, idx) => {
              const height = (item.value / maxValue) * 100
              const prevHeight = idx > 0 ? (data[idx - 1].value / maxValue) * 100 : height
              
              return (
                <div key={idx} className="flex-1 flex flex-col items-center">
                  <div className="relative w-full h-48 flex items-end">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all duration-500",
                        color === 'violet' && "bg-violet-500/20",
                        color === 'blue' && "bg-blue-500/20",
                        color === 'green' && "bg-green-500/20"
                      )}
                      style={{ height: `${height}%` }}
                    >
                      {idx > 0 && (
                        <svg
                          className="absolute top-0 left-0 w-full h-full overflow-visible"
                          style={{ zIndex: 10 }}
                        >
                          <line
                            x1="0"
                            y1={`${100 - prevHeight}%`}
                            x2="100%"
                            y2={`${100 - height}%`}
                            stroke={color === 'violet' ? '#8b5cf6' : color === 'blue' ? '#3b82f6' : '#10b981'}
                            strokeWidth="2"
                          />
                        </svg>
                      )}
                      <div
                        className={cn(
                          "absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rounded-full",
                          color === 'violet' && "bg-violet-500",
                          color === 'blue' && "bg-blue-500",
                          color === 'green' && "bg-green-500"
                        )}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>
        )

      case 'pie':
        const total = data.reduce((sum, item) => sum + item.value, 0)
        let currentAngle = -90

        return (
          <div className="flex items-center justify-between gap-8">
            <div className="relative w-48 h-48">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                {data.map((item, idx) => {
                  const percentage = (item.value / total) * 100
                  const angle = (percentage / 100) * 360
                  const x1 = 50 + 40 * Math.cos((currentAngle * Math.PI) / 180)
                  const y1 = 50 + 40 * Math.sin((currentAngle * Math.PI) / 180)
                  const x2 = 50 + 40 * Math.cos(((currentAngle + angle) * Math.PI) / 180)
                  const y2 = 50 + 40 * Math.sin(((currentAngle + angle) * Math.PI) / 180)
                  const largeArc = angle > 180 ? 1 : 0
                  
                  const path = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`
                  currentAngle += angle

                  const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
                  const fillColor = colors[idx % colors.length]

                  return (
                    <path
                      key={idx}
                      d={path}
                      fill={fillColor}
                      stroke="white"
                      strokeWidth="2"
                      className="hover:opacity-80 transition-opacity cursor-pointer"
                    />
                  )
                })}
              </svg>
            </div>
            <div className="flex-1 space-y-2">
              {data.map((item, idx) => {
                const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
                const percentage = ((item.value / total) * 100).toFixed(1)
                
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: colors[idx % colors.length] }}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {percentage}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
    }
  }

  const chartIcons = {
    bar: <BarChart3 className="w-4 h-4" />,
    line: <LineChart className="w-4 h-4" />,
    pie: <PieChart className="w-4 h-4" />
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Data Visualizer
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onExecuteCommand('data refresh')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={() => onExecuteCommand(`data export ${selectedChart} --format=csv`)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Export data"
            >
              <Download className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4">
          {/* Dataset selector */}
          <div className="flex gap-2">
            {(['revenue', 'users', 'performance'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedChart(type)}
                className={cn(
                  "px-3 py-1 text-sm rounded-lg transition-colors capitalize",
                  selectedChart === type
                    ? "bg-violet-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Chart type selector */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(['bar', 'line', 'pie'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  chartType === type
                    ? "bg-white dark:bg-gray-600 text-violet-600 dark:text-violet-400"
                    : "text-gray-500 dark:text-gray-400"
                )}
                title={type}
              >
                {chartIcons[type]}
              </button>
            ))}
          </div>

          {/* Time range selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className={cn(
              "px-3 py-1 text-sm rounded-lg",
              "bg-gray-100 dark:bg-gray-700",
              "text-gray-600 dark:text-gray-400",
              "border-0 focus:ring-2 focus:ring-violet-500"
            )}
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </div>
      </div>

      {/* Chart Area */}
      <div className="p-6">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          {currentData.title}
        </h4>
        {renderChart()}
      </div>

      {/* Statistics */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total"
            value={stats.sum.toLocaleString()}
            icon={<TrendingUp className="w-4 h-4" />}
            color="violet"
          />
          <StatCard
            label="Average"
            value={Math.round(stats.avg).toLocaleString()}
            icon={<BarChart3 className="w-4 h-4" />}
            color="blue"
          />
          <StatCard
            label="Maximum"
            value={stats.max.toLocaleString()}
            icon={<TrendingUp className="w-4 h-4" />}
            color="green"
          />
          <StatCard
            label="Minimum"
            value={stats.min.toLocaleString()}
            icon={<TrendingUp className="w-4 h-4" />}
            color="yellow"
          />
        </div>

        {/* Quick Actions */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => onExecuteCommand('data query --interactive')}
              className="text-sm text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
            >
              <Filter className="w-3 h-3" />
              Custom Query
            </button>
            <button
              onClick={() => onExecuteCommand('data table ' + selectedChart)}
              className="text-sm text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
            >
              <Table className="w-3 h-3" />
              View Table
            </button>
          </div>
          <button
            onClick={() => onExecuteCommand('data schedule-report')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
          >
            <Calendar className="w-3 h-3" />
            Schedule Report
          </button>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  icon: React.ReactNode
  color: 'violet' | 'blue' | 'green' | 'yellow'
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color }) => {
  const colorClasses = {
    violet: 'text-violet-600 dark:text-violet-400',
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
        <span className={colorClasses[color]}>{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold text-gray-900 dark:text-white">
        {value}
      </div>
    </div>
  )
}