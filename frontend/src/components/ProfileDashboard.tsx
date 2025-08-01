import React, { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import type { UserProfile } from './ProfileSelector'
import { GitIntegration } from './GitIntegration'
import { BuildMonitor } from './BuildMonitor'
import { DataVisualizer } from './DataVisualizer'
import { LogAnalyzer } from './LogAnalyzer'
import { PerformanceMonitor } from './PerformanceMonitor'
import { TutorialWizard } from './TutorialWizard'

interface ProfileDashboardProps {
  profile: UserProfile
  onExecuteCommand: (command: string) => void
  className?: string
}

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    <span className="ml-2 text-sm text-gray-500">Loading...</span>
  </div>
)

export const ProfileDashboard: React.FC<ProfileDashboardProps> = ({
  profile,
  onExecuteCommand,
  className
}) => {
  const renderDeveloperProfile = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Suspense fallback={<LoadingSpinner />}>
        <GitIntegration 
          onExecuteCommand={onExecuteCommand} 
          className="lg:col-span-1"
        />
      </Suspense>
      <Suspense fallback={<LoadingSpinner />}>
        <BuildMonitor 
          onExecuteCommand={onExecuteCommand}
          className="lg:col-span-1"
        />
      </Suspense>
      <Suspense fallback={<LoadingSpinner />}>
        <PerformanceMonitor 
          compact
          className="lg:col-span-2"
        />
      </Suspense>
    </div>
  )

  const renderAnalystProfile = () => (
    <div className="grid grid-cols-1 gap-6">
      <Suspense fallback={<LoadingSpinner />}>
        <DataVisualizer 
          onExecuteCommand={onExecuteCommand}
        />
      </Suspense>
      <Suspense fallback={<LoadingSpinner />}>
        <PerformanceMonitor 
          compact
        />
      </Suspense>
    </div>
  )

  const renderDevOpsProfile = () => (
    <div className="grid grid-cols-1 gap-6">
      <Suspense fallback={<LoadingSpinner />}>
        <LogAnalyzer 
          onExecuteCommand={onExecuteCommand}
        />
      </Suspense>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<LoadingSpinner />}>
          <BuildMonitor 
            onExecuteCommand={onExecuteCommand}
          />
        </Suspense>
        <Suspense fallback={<LoadingSpinner />}>
          <PerformanceMonitor />
        </Suspense>
      </div>
    </div>
  )

  const renderGeneralProfile = () => (
    <div className="grid grid-cols-1 gap-6">
      <Suspense fallback={<LoadingSpinner />}>
        <TutorialWizard 
          onExecuteCommand={onExecuteCommand}
        />
      </Suspense>
    </div>
  )

  const getProfileTitle = (profile: UserProfile) => {
    switch (profile) {
      case 'developer':
        return 'Developer Dashboard'
      case 'analyst':
        return 'Data Analyst Dashboard'
      case 'devops':
        return 'DevOps Dashboard'
      case 'general':
        return 'Getting Started'
      default:
        return 'Dashboard'
    }
  }

  const getProfileDescription = (profile: UserProfile) => {
    switch (profile) {
      case 'developer':
        return 'Git integration, build monitoring, and development tools'
      case 'analyst':
        return 'Data visualization, query tools, and analytics'
      case 'devops':
        return 'Log analysis, system monitoring, and deployment tools'
      case 'general':
        return 'Interactive tutorials and guided commands'
      default:
        return 'Customized interface for your workflow'
    }
  }

  const renderProfileContent = () => {
    switch (profile) {
      case 'developer':
        return renderDeveloperProfile()
      case 'analyst':
        return renderAnalystProfile()
      case 'devops':
        return renderDevOpsProfile()
      case 'general':
        return renderGeneralProfile()
      default:
        return (
          <div className="p-8 text-center text-gray-500">
            Select a profile to see customized features
          </div>
        )
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Profile Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {getProfileTitle(profile)}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {getProfileDescription(profile)}
        </p>
      </div>

      {/* Profile-specific Content */}
      {renderProfileContent()}
    </div>
  )
}