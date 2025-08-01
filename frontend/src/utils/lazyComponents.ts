import { lazy } from 'react'

// Lazy load heavy components
export const TaskManagementPanel = lazy(() => 
  import('../components/TaskManagementPanel').then(module => ({
    default: module.TaskManagementPanel
  }))
)

export const CommandPalette = lazy(() => 
  import('../components/CommandPalette').then(module => ({
    default: module.CommandPalette
  }))
)

// Preload critical components
export const preloadTaskPanel = () => {
  import('../components/TaskManagementPanel')
}

export const preloadCommandPalette = () => {
  import('../components/CommandPalette')
}