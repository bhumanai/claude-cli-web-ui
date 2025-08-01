import React from 'react'
import { Terminal, Zap, Shield, Globe, ChevronRight } from 'lucide-react'

interface WelcomeScreenProps {
  onComplete: () => void
  onProfileSelect?: (profile: string) => void
  currentProfile?: string
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onComplete, onProfileSelect, currentProfile }) => {
  const features = [
    {
      icon: <Terminal className="w-6 h-6" />,
      title: 'Powerful CLI',
      description: 'Execute commands with real-time output streaming'
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Lightning Fast',
      description: 'Optimized for speed with instant command execution'
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Secure',
      description: 'Enterprise-grade security with session isolation'
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: 'Works Everywhere',
      description: 'Responsive design that works on any device'
    }
  ]

  const quickCommands = [
    { command: 'help', description: 'Show available commands' },
    { command: 'status', description: 'Check system status' },
    { command: '/agents', description: 'List AI agents' },
    { command: '/projects', description: 'Manage projects' }
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-6">
          <div className="p-4 bg-violet-100 dark:bg-violet-900/30 rounded-2xl">
            <Terminal className="w-12 h-12 text-violet-600 dark:text-violet-400" />
          </div>
        </div>
        
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to Claude CLI
        </h1>
        
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
          A powerful command-line interface for Claude, right in your browser. 
          Execute commands, manage tasks, and boost your productivity.
        </p>

        <button
          onClick={onComplete}
          className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
        >
          Get Started
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 w-full">
        {features.map((feature, index) => (
          <div
            key={index}
            className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
          >
            <div className="text-violet-600 dark:text-violet-400 mb-4">
              {feature.icon}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {feature.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              {feature.description}
            </p>
          </div>
        ))}
      </div>

      <div className="w-full max-w-2xl">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 text-center">
          Quick Start Commands
        </h2>
        
        <div className="space-y-3">
          {quickCommands.map((cmd, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div>
                <code className="text-sm font-mono text-violet-600 dark:text-violet-400">
                  {cmd.command}
                </code>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {cmd.description}
                </p>
              </div>
              <button
                onClick={() => {
                  onComplete()
                  // Could also pre-fill the command
                }}
                className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
              >
                Try it
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
        Press <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+K</kbd> to open command palette
      </div>
    </div>
  )
}