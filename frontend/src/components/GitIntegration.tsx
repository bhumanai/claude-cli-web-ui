import React, { useState } from 'react'
import { GitBranch, GitCommit, GitPullRequest, GitMerge, RefreshCw, Plus, Check, X } from 'lucide-react'
import { cn } from '../utils/cn'

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  untracked: string[]
}

interface GitIntegrationProps {
  onExecuteCommand: (command: string) => void
  className?: string
}

export const GitIntegration: React.FC<GitIntegrationProps> = ({
  onExecuteCommand,
  className
}) => {
  const [gitStatus, setGitStatus] = useState<GitStatus>({
    branch: 'main',
    ahead: 2,
    behind: 0,
    staged: ['src/components/Header.tsx', 'src/utils/helpers.ts'],
    modified: ['README.md'],
    untracked: ['src/components/NewFeature.tsx']
  })

  const [commitMessage, setCommitMessage] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  const quickCommands = [
    { icon: <GitBranch className="w-4 h-4" />, label: 'Branches', command: 'git branch -a' },
    { icon: <GitCommit className="w-4 h-4" />, label: 'Log', command: 'git log --oneline -10' },
    { icon: <GitPullRequest className="w-4 h-4" />, label: 'Pull', command: 'git pull' },
    { icon: <GitMerge className="w-4 h-4" />, label: 'Merge', command: 'git merge' }
  ]

  const handleStageFile = (file: string) => {
    if (selectedFiles.has(file)) {
      selectedFiles.delete(file)
    } else {
      selectedFiles.add(file)
    }
    setSelectedFiles(new Set(selectedFiles))
  }

  const handleCommit = () => {
    if (commitMessage.trim() && selectedFiles.size > 0) {
      const files = Array.from(selectedFiles).join(' ')
      onExecuteCommand(`git add ${files} && git commit -m "${commitMessage}"`)
      setCommitMessage('')
      setSelectedFiles(new Set())
    }
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Git Integration
          </h3>
          <button
            onClick={() => onExecuteCommand('git status')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        {/* Branch Status */}
        <div className="mt-2 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-gray-400" />
            <span className="font-mono text-violet-600 dark:text-violet-400">
              {gitStatus.branch}
            </span>
          </div>
          {gitStatus.ahead > 0 && (
            <span className="text-green-600 dark:text-green-400">
              ↑{gitStatus.ahead}
            </span>
          )}
          {gitStatus.behind > 0 && (
            <span className="text-orange-600 dark:text-orange-400">
              ↓{gitStatus.behind}
            </span>
          )}
        </div>
      </div>

      {/* Quick Commands */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {quickCommands.map((cmd, idx) => (
            <button
              key={idx}
              onClick={() => onExecuteCommand(cmd.command)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg",
                "bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-700",
                "text-sm font-medium text-gray-700 dark:text-gray-300",
                "transition-colors"
              )}
            >
              {cmd.icon}
              {cmd.label}
            </button>
          ))}
        </div>
      </div>

      {/* File Status */}
      <div className="p-4 space-y-4">
        {/* Staged Files */}
        {gitStatus.staged.length > 0 && (
          <FileSection
            title="Staged Changes"
            files={gitStatus.staged}
            color="green"
            icon={<Check className="w-4 h-4" />}
            onFileClick={(file) => onExecuteCommand(`git diff --cached ${file}`)}
          />
        )}

        {/* Modified Files */}
        {gitStatus.modified.length > 0 && (
          <FileSection
            title="Modified Files"
            files={gitStatus.modified}
            color="yellow"
            selectable
            selectedFiles={selectedFiles}
            onFileSelect={handleStageFile}
            onFileClick={(file) => onExecuteCommand(`git diff ${file}`)}
          />
        )}

        {/* Untracked Files */}
        {gitStatus.untracked.length > 0 && (
          <FileSection
            title="Untracked Files"
            files={gitStatus.untracked}
            color="gray"
            icon={<Plus className="w-4 h-4" />}
            selectable
            selectedFiles={selectedFiles}
            onFileSelect={handleStageFile}
          />
        )}
      </div>

      {/* Commit Section */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message..."
            className={cn(
              "flex-1 px-3 py-2 text-sm",
              "border border-gray-300 dark:border-gray-600 rounded-lg",
              "bg-white dark:bg-gray-900",
              "placeholder-gray-500 dark:placeholder-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-violet-500"
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleCommit()
              }
            }}
          />
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || selectedFiles.size === 0}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-sm",
              "bg-violet-600 hover:bg-violet-700 text-white",
              "disabled:bg-gray-300 dark:disabled:bg-gray-700",
              "disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            Commit
          </button>
        </div>
        {selectedFiles.size > 0 && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''} selected
          </p>
        )}
      </div>
    </div>
  )
}

interface FileSectionProps {
  title: string
  files: string[]
  color: 'green' | 'yellow' | 'gray'
  icon?: React.ReactNode
  selectable?: boolean
  selectedFiles?: Set<string>
  onFileSelect?: (file: string) => void
  onFileClick?: (file: string) => void
}

const FileSection: React.FC<FileSectionProps> = ({
  title,
  files,
  color,
  icon,
  selectable,
  selectedFiles,
  onFileSelect,
  onFileClick
}) => {
  const colorClasses = {
    green: 'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    gray: 'text-gray-600 dark:text-gray-400'
  }

  return (
    <div>
      <h4 className={cn("text-sm font-medium mb-2", colorClasses[color])}>
        {title}
      </h4>
      <div className="space-y-1">
        {files.map((file) => (
          <div
            key={file}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg",
              "bg-gray-50 dark:bg-gray-900/50",
              "hover:bg-gray-100 dark:hover:bg-gray-700",
              "transition-colors group"
            )}
          >
            {selectable && onFileSelect ? (
              <input
                type="checkbox"
                checked={selectedFiles?.has(file) || false}
                onChange={() => onFileSelect(file)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
            ) : (
              icon && <span className={colorClasses[color]}>{icon}</span>
            )}
            <span
              className={cn(
                "flex-1 text-sm font-mono cursor-pointer",
                "text-gray-700 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400"
              )}
              onClick={() => onFileClick?.(file)}
            >
              {file}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}