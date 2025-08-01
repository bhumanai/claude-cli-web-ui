import React, { useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { focusUtils, screenReader } from '../utils/accessibility'
import { cn } from '../utils/cn'

interface AccessibleModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  className?: string
}

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // Size classes
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && closeOnEscape) {
      onClose()
    }
  }, [closeOnEscape, onClose])

  // Handle overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose()
    }
  }, [closeOnOverlayClick, onClose])

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previouslyFocusedRef.current = document.activeElement as HTMLElement
      
      // Focus modal after a brief delay to ensure it's rendered
      const timeoutId = setTimeout(() => {
        if (titleRef.current) {
          titleRef.current.focus()
        } else if (modalRef.current) {
          modalRef.current.focus()
        }
      }, 10)

      // Set up focus trap
      const releaseFocusTrap = modalRef.current 
        ? focusUtils.trap(modalRef.current)
        : () => {}

      // Add escape key listener
      document.addEventListener('keydown', handleKeyDown)
      
      // Announce modal opening to screen readers
      screenReader.announce.assertive(`Dialog opened: ${title}`)

      // Prevent body scroll
      document.body.style.overflow = 'hidden'

      return () => {
        clearTimeout(timeoutId)
        releaseFocusTrap()
        document.removeEventListener('keydown', handleKeyDown)
        document.body.style.overflow = ''
        
        // Restore focus
        if (previouslyFocusedRef.current) {
          previouslyFocusedRef.current.focus()
        }
        
        // Announce modal closing
        screenReader.announce.polite('Dialog closed')
      }
    }
  }, [isOpen, handleKeyDown, title])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="modal-title"
      aria-describedby={description ? "modal-description" : undefined}
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={modalRef}
          className={cn(
            "relative w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl transform transition-all",
            sizeClasses[size],
            className
          )}
          tabIndex={-1}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2
              ref={titleRef}
              id="modal-title"
              className="text-xl font-semibold text-gray-900 dark:text-white outline-none"
              tabIndex={-1}
            >
              {title}
            </h2>
            
            <button
              onClick={onClose}
              className={cn(
                "p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
                "hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-violet-500"
              )}
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Description */}
          {description && (
            <div 
              id="modal-description" 
              className="px-6 pt-4 text-sm text-gray-600 dark:text-gray-400"
            >
              {description}
            </div>
          )}

          {/* Content */}
          <div className="p-6 pt-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// Accessible confirmation dialog
interface ConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info'
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    info: 'bg-violet-600 hover:bg-violet-700 focus:ring-violet-500'
  }

  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      // Focus confirm button for dangerous actions, cancel for others
      const timeoutId = setTimeout(() => {
        if (variant === 'danger') {
          confirmButtonRef.current?.focus()
        }
      }, 100)
      
      return () => clearTimeout(timeoutId)
    }
  }, [isOpen, variant])

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-gray-600 dark:text-gray-400">
          {message}
        </p>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg",
              "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100",
              "hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-gray-500"
            )}
          >
            {cancelText}
          </button>
          
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            className={cn(
              "px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-2",
              variantStyles[variant]
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </AccessibleModal>
  )
}

// Accessible alert dialog
interface AlertDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  variant?: 'success' | 'error' | 'warning' | 'info'
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  onClose,
  title,
  message,
  variant = 'info'
}) => {
  const variantIcons = {
    success: '✓',
    error: '⚠',
    warning: '⚠',
    info: 'ℹ'
  }

  const variantColors = {
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-blue-600 dark:text-blue-400'
  }

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <div className={cn("flex-shrink-0 text-2xl", variantColors[variant])}>
            {variantIcons[variant]}
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {message}
          </p>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className={cn(
              "px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors",
              "bg-violet-600 hover:bg-violet-700",
              "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            )}
          >
            OK
          </button>
        </div>
      </div>
    </AccessibleModal>
  )
}