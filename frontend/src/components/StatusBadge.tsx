import React from 'react'
import { Task } from '../types'

interface StatusBadgeProps {
  status: Task['status']
  size?: 'sm' | 'md' | 'lg'
}

const statusStyles: Record<Task['status'], string> = {
  pending: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  in_progress: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  failed: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  queued: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
}

const sizeStyles = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5'
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const statusText = status.replace('_', ' ')
  
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${statusStyles[status]} ${sizeStyles[size]}`}>
      {statusText}
    </span>
  )
}