import React, { useState, useEffect } from 'react'
import { Activity, Zap, Cpu, HardDrive, TrendingUp } from 'lucide-react'
import { cn } from '../utils/cn'

interface PerformanceMetrics {
  fps: number
  memoryUsage: number
  loadTime: number
  commandLatency: number[]
  bundleSize: number
  cacheHitRate: number
}

interface PerformanceMonitorProps {
  className?: string
  compact?: boolean
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  className,
  compact = false
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    memoryUsage: 0,
    loadTime: 0,
    commandLatency: [],
    bundleSize: 344, // KB
    cacheHitRate: 0
  })

  const [isExpanded, setIsExpanded] = useState(!compact)

  // Monitor FPS
  useEffect(() => {
    let frameCount = 0
    let lastTime = performance.now()
    let animationId: number

    const measureFPS = () => {
      frameCount++
      const currentTime = performance.now()
      
      if (currentTime >= lastTime + 1000) {
        setMetrics(prev => ({
          ...prev,
          fps: Math.round((frameCount * 1000) / (currentTime - lastTime))
        }))
        frameCount = 0
        lastTime = currentTime
      }
      
      animationId = requestAnimationFrame(measureFPS)
    }

    animationId = requestAnimationFrame(measureFPS)
    return () => cancelAnimationFrame(animationId)
  }, [])

  // Monitor memory usage
  useEffect(() => {
    const measureMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory
        const usedMB = Math.round(memory.usedJSHeapSize / 1048576)
        setMetrics(prev => ({ ...prev, memoryUsage: usedMB }))
      }
    }

    measureMemory()
    const interval = setInterval(measureMemory, 2000)
    return () => clearInterval(interval)
  }, [])

  // Calculate average command latency
  const avgLatency = metrics.commandLatency.length > 0
    ? Math.round(metrics.commandLatency.reduce((a, b) => a + b, 0) / metrics.commandLatency.length)
    : 0

  const performanceScore = Math.round(
    (metrics.fps / 60) * 25 +
    (1 - metrics.memoryUsage / 200) * 25 +
    (1 - avgLatency / 1000) * 25 +
    (metrics.cacheHitRate) * 25
  )

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500'
    if (score >= 70) return 'text-yellow-500'
    return 'text-red-500'
  }

  if (compact && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700",
          "transition-colors",
          className
        )}
      >
        <Activity className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium">Performance</span>
        <span className={cn("text-sm font-bold", getScoreColor(performanceScore))}>
          {performanceScore}%
        </span>
      </button>
    )
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4",
      className
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Performance Monitor
        </h3>
        {compact && (
          <button
            onClick={() => setIsExpanded(false)}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Minimize
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          icon={<Zap className="w-4 h-4" />}
          label="FPS"
          value={metrics.fps}
          unit=""
          optimal={60}
          warning={30}
        />
        <MetricCard
          icon={<Cpu className="w-4 h-4" />}
          label="Memory"
          value={metrics.memoryUsage}
          unit="MB"
          optimal={100}
          warning={150}
          inverse
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Latency"
          value={avgLatency}
          unit="ms"
          optimal={100}
          warning={500}
          inverse
        />
        <MetricCard
          icon={<HardDrive className="w-4 h-4" />}
          label="Cache Hit"
          value={Math.round(metrics.cacheHitRate * 100)}
          unit="%"
          optimal={80}
          warning={50}
        />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Bundle Size: <span className="font-medium">{metrics.bundleSize}KB</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Overall Score:</span>
          <span className={cn("text-lg font-bold", getScoreColor(performanceScore))}>
            {performanceScore}%
          </span>
        </div>
      </div>
    </div>
  )
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: number
  unit: string
  optimal: number
  warning: number
  inverse?: boolean
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  unit,
  optimal,
  warning,
  inverse = false
}) => {
  const getColor = () => {
    const isGood = inverse ? value <= optimal : value >= optimal
    const isWarning = inverse ? value >= warning : value <= warning
    
    if (isGood) return 'text-green-500'
    if (isWarning) return 'text-red-500'
    return 'text-yellow-500'
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold", getColor())}>
          {value}
        </span>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
    </div>
  )
}

// Export function to track command latency
export const trackCommandLatency = (latency: number) => {
  // This would be connected to a global performance store
  console.log('Command latency:', latency, 'ms')
}