import React from 'react'
import { Loader2, Activity, Clock, AlertCircle } from 'lucide-react'
import { cn } from '../utils/cn'

export type LoadingVariant = 'spinner' | 'pulse' | 'skeleton' | 'progress' | 'dots'
export type LoadingSize = 'sm' | 'md' | 'lg' | 'xl'

interface LoadingIndicatorProps {
  variant?: LoadingVariant
  size?: LoadingSize
  message?: string
  progress?: number // 0-100 for progress variant
  className?: string
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error'
  overlay?: boolean // Show as overlay
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  variant = 'spinner',
  size = 'md',
  message,
  progress,
  className,
  color = 'primary',
  overlay = false
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'w-4 h-4'
      case 'md':
        return 'w-6 h-6'
      case 'lg':
        return 'w-8 h-8'
      case 'xl':
        return 'w-12 h-12'
      default:
        return 'w-6 h-6'
    }
  }

  const getColorClasses = () => {
    switch (color) {
      case 'primary':
        return 'text-violet-600 dark:text-violet-400'
      case 'secondary':
        return 'text-gray-600 dark:text-gray-400'
      case 'success':
        return 'text-green-600 dark:text-green-400'
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'error':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-violet-600 dark:text-violet-400'
    }
  }

  const renderLoadingElement = () => {
    const sizeClass = getSizeClasses()
    const colorClass = getColorClasses()

    switch (variant) {
      case 'spinner':
        return (
          <Loader2 className={cn(sizeClass, colorClass, 'animate-spin')} />
        )

      case 'pulse':
        return (
          <Activity className={cn(sizeClass, colorClass, 'animate-pulse')} />
        )

      case 'skeleton':
        return (
          <div className={cn(
            'animate-pulse bg-gray-300 dark:bg-gray-700 rounded',
            size === 'sm' ? 'h-4' : size === 'md' ? 'h-6' : size === 'lg' ? 'h-8' : 'h-12',
            'w-full'
          )} />
        )

      case 'progress':
        return (
          <div className="w-full">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>{message || 'Loading...'}</span>
              {progress !== undefined && <span>{Math.round(progress)}%</span>}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  color === 'primary' ? 'bg-violet-600' :
                  color === 'success' ? 'bg-green-600' :
                  color === 'warning' ? 'bg-yellow-600' :
                  color === 'error' ? 'bg-red-600' :
                  'bg-gray-600'
                )}
                style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
              />
            </div>
          </div>
        )

      case 'dots':
        return (
          <div className="flex space-x-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  'rounded-full animate-bounce',
                  colorClass.includes('violet') ? 'bg-violet-600' :
                  colorClass.includes('green') ? 'bg-green-600' :
                  colorClass.includes('yellow') ? 'bg-yellow-600' :
                  colorClass.includes('red') ? 'bg-red-600' :
                  'bg-gray-600',
                  size === 'sm' ? 'w-1 h-1' :
                  size === 'md' ? 'w-2 h-2' :
                  size === 'lg' ? 'w-3 h-3' :
                  'w-4 h-4'
                )}
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )

      default:
        return (
          <Loader2 className={cn(sizeClass, colorClass, 'animate-spin')} />
        )
    }
  }

  const content = (
    <div className={cn(
      'flex items-center justify-center',
      variant === 'progress' ? 'flex-col w-full' : 'gap-3',
      className
    )}>
      {renderLoadingElement()}
      {message && variant !== 'progress' && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {message}
        </span>
      )}
    </div>
  )

  if (overlay) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
          {content}
        </div>
      </div>
    )
  }

  return content
}

// Specialized loading components
interface PageLoadingProps {
  message?: string
  progress?: number
}

export const PageLoading: React.FC<PageLoadingProps> = ({ message = 'Loading page...', progress }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div className="text-center space-y-4 max-w-md w-full px-4">
      <LoadingIndicator variant="spinner" size="xl" color="primary" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {message}
        </h3>
        {progress !== undefined && (
          <LoadingIndicator variant="progress" progress={progress} />
        )}
      </div>
    </div>
  </div>
)

interface ComponentLoadingProps {
  message?: string
  height?: string
  className?: string
}

export const ComponentLoading: React.FC<ComponentLoadingProps> = ({ 
  message = 'Loading...', 
  height = 'h-32',
  className 
}) => (
  <div className={cn(
    'flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg',
    height,
    className
  )}>
    <div className="text-center space-y-2">
      <LoadingIndicator variant="spinner" size="md" color="primary" />
      <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
    </div>
  </div>
)

interface ButtonLoadingProps {
  isLoading: boolean
  children: React.ReactNode
  disabled?: boolean
  className?: string
  variant?: 'primary' | 'secondary'
}

export const ButtonLoading: React.FC<ButtonLoadingProps> = ({
  isLoading,
  children,
  disabled,
  className,
  variant = 'primary'
}) => (
  <button
    disabled={disabled || isLoading}
    className={cn(
      'flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50',
      variant === 'primary' 
        ? 'bg-violet-600 hover:bg-violet-700 text-white'
        : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300',
      className
    )}
  >
    {isLoading && <LoadingIndicator variant="spinner" size="sm" color={variant === 'primary' ? 'secondary' : 'primary'} />}
    {children}
  </button>
)

// Skeleton loading components
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ 
  lines = 1, 
  className 
}) => (
  <div className={cn('space-y-2', className)}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className={cn(
          'animate-pulse bg-gray-300 dark:bg-gray-700 rounded h-4',
          i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
        )}
      />
    ))}
  </div>
)

export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3', className)}>
    <div className="animate-pulse bg-gray-300 dark:bg-gray-700 rounded h-6 w-3/4" />
    <SkeletonText lines={2} />
    <div className="flex gap-2">
      <div className="animate-pulse bg-gray-300 dark:bg-gray-700 rounded h-8 w-20" />
      <div className="animate-pulse bg-gray-300 dark:bg-gray-700 rounded h-8 w-16" />
    </div>
  </div>
)

export default LoadingIndicator