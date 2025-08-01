import React, { useEffect, useState } from 'react'
import { useUIStateRestoration } from '../hooks/useSessionPersistence'
import { LoadingSkeleton } from './LoadingSkeleton'

interface SessionRestorationHandlerProps {
  children: React.ReactNode
  onRestoreComplete?: (restoredData: any) => void
  onRestoreError?: (error: string) => void
}

/**
 * Component that handles session restoration with loading states and error recovery
 * Wraps the main application to provide seamless session persistence
 */
export const SessionRestorationHandler: React.FC<SessionRestorationHandlerProps> = ({
  children,
  onRestoreComplete,
  onRestoreError
}) => {
  const restoredState = useUIStateRestoration()
  const [showRetryDialog, setShowRetryDialog] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  // Handle restoration completion
  useEffect(() => {
    if (!restoredState.isLoading) {
      if (restoredState.error) {
        onRestoreError?.(restoredState.error)
        if (retryCount < maxRetries) {
          setShowRetryDialog(true)
        }
      } else {
        onRestoreComplete?.(restoredState)
      }
    }
  }, [restoredState, onRestoreComplete, onRestoreError, retryCount, maxRetries])

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
    setShowRetryDialog(false)
    // Force a page reload to retry restoration
    window.location.reload()
  }

  const handleSkipRestore = () => {
    setShowRetryDialog(false)
    // Clear corrupted data and continue
    localStorage.clear()
    // Continue with default state
  }

  const handleClearAndReload = () => {
    // Clear all storage and reload the page
    localStorage.clear()
    sessionStorage.clear()
    window.location.reload()
  }

  // Show loading state during restoration
  if (restoredState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto">
          <div className="text-center mb-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Restoring Session
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Loading your preferences and command history...
            </p>
          </div>
          
          {/* Skeleton loaders for various UI elements */}
          <div className="space-y-4">
            <LoadingSkeleton height="h-12" />
            <LoadingSkeleton height="h-32" />
            <div className="flex space-x-4">
              <LoadingSkeleton height="h-8" className="flex-1" />
              <LoadingSkeleton height="h-8" className="flex-1" />
            </div>
            <LoadingSkeleton height="h-16" />
          </div>
        </div>
      </div>
    )
  }

  // Show retry dialog if restoration failed
  if (showRetryDialog) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Session Restoration Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {restoredState.error || 'An unknown error occurred while restoring your session data.'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Attempt {retryCount + 1} of {maxRetries}
            </p>
          </div>

          <div className="space-y-3">
            {retryCount < maxRetries - 1 ? (
              <button
                onClick={handleRetry}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Retry Restoration
              </button>
            ) : null}
            
            <button
              onClick={handleSkipRestore}
              className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
            >
              Continue with Default Settings
            </button>
            
            <button
              onClick={handleClearAndReload}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
            >
              Clear All Data & Restart
            </button>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
            <div className="flex">
              <svg className="flex-shrink-0 w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                  Data Recovery Information
                </h3>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-400">
                  <p>Your session data may be corrupted. You can:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Retry to attempt restoration again</li>
                    <li>Continue with defaults (data preserved)</li>
                    <li>Clear all data for a fresh start</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Restoration completed successfully, render the app
  return <>{children}</>
}

// Hook for components to access restored state
export const useRestoredState = () => {
  const restoredState = useUIStateRestoration()
  return restoredState
}

export default SessionRestorationHandler