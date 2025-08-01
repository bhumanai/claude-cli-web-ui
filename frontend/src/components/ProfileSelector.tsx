import React, { useState } from 'react'
import { Code2, Database, Server, Users, ChevronDown, Check } from 'lucide-react'
import { cn } from '../utils/cn'

export type UserProfile = 'developer' | 'analyst' | 'devops' | 'general'

interface ProfileOption {
  id: UserProfile
  name: string
  description: string
  icon: React.ReactNode
  features: string[]
  color: string
}

const profiles: ProfileOption[] = [
  {
    id: 'developer',
    name: 'Developer',
    description: 'Code execution, debugging, and project management',
    icon: <Code2 className="w-5 h-5" />,
    color: 'violet',
    features: ['Syntax highlighting', 'Git integration', 'Build tools', 'Debug console']
  },
  {
    id: 'analyst',
    name: 'Data Analyst',
    description: 'Data processing, visualization, and analysis',
    icon: <Database className="w-5 h-5" />,
    color: 'blue',
    features: ['Data queries', 'Visualizations', 'Export tools', 'Statistical analysis']
  },
  {
    id: 'devops',
    name: 'DevOps',
    description: 'Infrastructure management and monitoring',
    icon: <Server className="w-5 h-5" />,
    color: 'green',
    features: ['Server monitoring', 'Log analysis', 'Deployment tools', 'Alerts']
  },
  {
    id: 'general',
    name: 'General User',
    description: 'Simple command interface for everyday tasks',
    icon: <Users className="w-5 h-5" />,
    color: 'gray',
    features: ['Easy commands', 'Visual builder', 'Tutorials', 'Templates']
  }
]

interface ProfileSelectorProps {
  currentProfile: UserProfile
  onProfileChange: (profile: UserProfile) => void
  className?: string
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  currentProfile,
  onProfileChange,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectedProfile = profiles.find(p => p.id === currentProfile) || profiles[3]

  const getColorClasses = (color: string, isSelected: boolean = false) => {
    const colors = {
      violet: isSelected 
        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700'
        : 'text-violet-600 dark:text-violet-400',
      blue: isSelected
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
        : 'text-blue-600 dark:text-blue-400',
      green: isSelected
        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700'
        : 'text-green-600 dark:text-green-400',
      gray: isSelected
        ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700'
        : 'text-gray-600 dark:text-gray-400'
    }
    return colors[color as keyof typeof colors] || colors.gray
  }

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
          "hover:bg-gray-50 dark:hover:bg-gray-800",
          getColorClasses(selectedProfile.color, true)
        )}
      >
        {selectedProfile.icon}
        <span className="text-sm font-medium">{selectedProfile.name}</span>
        <ChevronDown className={cn(
          "w-4 h-4 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
            <div className="p-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    onProfileChange(profile.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-colors",
                    "hover:bg-gray-50 dark:hover:bg-gray-700",
                    currentProfile === profile.id && "bg-gray-50 dark:bg-gray-700"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5", getColorClasses(profile.color))}>
                      {profile.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {profile.name}
                        </h4>
                        {currentProfile === profile.id && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        {profile.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {profile.features.map((feature, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Profile settings customize available commands and UI features
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}