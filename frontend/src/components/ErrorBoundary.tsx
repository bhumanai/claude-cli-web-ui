import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Bug, Copy, ExternalLink } from 'lucide-react'
import { cn } from '../utils/cn'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
  enableReporting?: boolean
  level?: 'page' | 'component' | 'section'
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  errorId: string
  showDetails: boolean
  isReporting: boolean
}

// Enhanced Error Boundary with comprehensive error handling
export class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0
  private maxRetries = 3

  public state: State = {
    hasError: false,
    errorId: '',
    showDetails: false,
    isReporting: false
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    return { 
      hasError: true, 
      error,
      errorId,
      showDetails: false,
      isReporting: false
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    
    // Enhanced error logging
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      retryCount: this.retryCount
    }

    console.group('🚨 React Error Boundary')
    console.error('Error:', error)
    console.error('Error Info:', errorInfo)
    console.error('Error Details:', errorDetails)
    console.groupEnd()

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Report to external service (if enabled)
    if (this.props.enableReporting) {
      this.reportError(errorDetails)
    }
  }

  private reportError = async (errorDetails: any) => {
    this.setState({ isReporting: true })
    
    try {
      // Here you would typically send to your error reporting service
      // For now, we'll just simulate the API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('Error reported:', errorDetails)
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError)
    } finally {
      this.setState({ isReporting: false })
    }
  }

  private copyErrorDetails = () => {
    const errorText = `Error ID: ${this.state.errorId}
Timestamp: ${new Date().toISOString()}
Error: ${this.state.error?.message}
Stack: ${this.state.error?.stack}
Component Stack: ${this.state.errorInfo?.componentStack}`
    
    navigator.clipboard.writeText(errorText).then(() => {
      // Could show a toast notification here
      console.log('Error details copied to clipboard')
    })
  }

  private retry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++
      this.setState({ 
        hasError: false, 
        error: undefined, 
        errorInfo: undefined,
        showDetails: false
      })
    }
  }

  private toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }))
  }

  private getErrorLevel = () => {
    return this.props.level || 'component'
  }

  private getContainerClasses = () => {
    const level = this.getErrorLevel()
    const baseClasses = 'flex flex-col items-center justify-center text-center p-6 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 rounded-lg'
    
    switch (level) {
      case 'page':
        return `${baseClasses} min-h-screen`
      case 'section':
        return `${baseClasses} min-h-64`
      default:
        return `${baseClasses} h-64`
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const canRetry = this.retryCount < this.maxRetries
      
      return (
        <div className={this.getContainerClasses()}>
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Something went wrong
          </h2>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred in this component'}
          </p>

          {/* Error ID */}
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-mono">
            Error ID: {this.state.errorId}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mb-4 flex-wrap justify-center">
            {canRetry && (
              <button
                onClick={this.retry}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again ({this.maxRetries - this.retryCount} left)
              </button>
            )}
            
            <button
              onClick={this.copyErrorDetails}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy Details
            </button>
            
            {this.props.enableReporting && (
              <button
                onClick={() => this.reportError({
                  error: this.state.error?.message,
                  stack: this.state.error?.stack,
                  errorId: this.state.errorId
                })}
                disabled={this.state.isReporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <ExternalLink className="w-4 h-4" />
                {this.state.isReporting ? 'Reporting...' : 'Report Error'}
              </button>
            )}
          </div>

          {/* Show/Hide details toggle */}
          {(this.props.showDetails || this.state.showDetails) && (
            <div className="w-full max-w-2xl">
              <button
                onClick={this.toggleDetails}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-3 mx-auto"
              >
                <Bug className="w-4 h-4" />
                {this.state.showDetails ? 'Hide' : 'Show'} Error Details
              </button>
              
              {this.state.showDetails && (
                <div className="bg-gray-900 dark:bg-gray-800 text-white p-4 rounded-lg text-left text-xs font-mono overflow-auto max-h-64">
                  <div className="mb-2">
                    <strong>Error:</strong> {this.state.error?.message}
                  </div>
                  <div className="mb-2">
                    <strong>Stack Trace:</strong>
                    <pre className="mt-1 whitespace-pre-wrap">{this.state.error?.stack}</pre>
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {!canRetry && (
            <div className="text-xs text-red-500 dark:text-red-400 mt-4">
              Maximum retry attempts reached. Please refresh the page.
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}