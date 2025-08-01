import React from 'react'
import { cn } from '@/utils/cn'
import { CommandInput } from './CommandInput'
import { OutputDisplay } from './OutputDisplay'
import { CommandHistory } from '@/types'

interface TerminalProps {
  commandHistory: CommandHistory[]
  onExecuteCommand: (command: string) => void
  onClearHistory: () => void
  isConnected: boolean
  className?: string
}

export const Terminal: React.FC<TerminalProps> = ({
  commandHistory,
  onExecuteCommand,
  onClearHistory,
  isConnected,
  className
}) => {
  return (
    <div className={cn(
      'flex flex-col h-full',
      'bg-white dark:bg-gray-900',
      'border border-gray-200 dark:border-gray-700 rounded-lg',
      'overflow-hidden',
      className
    )}>
      {/* Output area */}
      <OutputDisplay
        commandHistory={commandHistory}
        onClear={onClearHistory}
      />

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <CommandInput
          onExecute={onExecuteCommand}
          isConnected={isConnected}
          placeholder={isConnected ? 'Enter command...' : 'Connecting...'}
          disabled={!isConnected}
        />
      </div>
    </div>
  )
}