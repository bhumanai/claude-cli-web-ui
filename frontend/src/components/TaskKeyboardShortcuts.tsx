import { useEffect } from 'react'

interface TaskKeyboardShortcutsProps {
  onNewTask?: () => void
  onToggleView?: () => void
  onRefresh?: () => void
  enabled?: boolean
}

export const TaskKeyboardShortcuts: React.FC<TaskKeyboardShortcutsProps> = ({
  onNewTask,
  onToggleView,
  onRefresh,
  enabled = true
}) => {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      // Cmd/Ctrl + N: New task
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        onNewTask?.()
      }

      // Cmd/Ctrl + T: Toggle views
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        onToggleView?.()
      }

      // Cmd/Ctrl + R: Refresh
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault()
        onRefresh?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onNewTask, onToggleView, onRefresh])

  return null
}