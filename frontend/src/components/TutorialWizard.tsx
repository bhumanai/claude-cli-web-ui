import React, { useState, useEffect } from 'react'
import {
  BookOpen,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Circle,
  Play,
  SkipForward,
  Award,
  HelpCircle,
  Target,
  Zap
} from 'lucide-react'
import { cn } from '../utils/cn'

interface TutorialStep {
  id: string
  title: string
  description: string
  command?: string
  expectedOutput?: string
  tips?: string[]
  completed: boolean
}

interface Tutorial {
  id: string
  title: string
  description: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: number // minutes
  steps: TutorialStep[]
  icon: React.ReactNode
}

interface TutorialWizardProps {
  onExecuteCommand: (command: string) => void
  className?: string
}

export const TutorialWizard: React.FC<TutorialWizardProps> = ({
  onExecuteCommand,
  className
}) => {
  const tutorials: Tutorial[] = [
    {
      id: 'basics',
      title: 'Getting Started',
      description: 'Learn the basic commands and navigation',
      difficulty: 'beginner',
      estimatedTime: 5,
      icon: <BookOpen className="w-5 h-5" />,
      steps: [
        {
          id: 'help',
          title: 'View Available Commands',
          description: 'Start by exploring what commands are available',
          command: 'help',
          expectedOutput: 'List of available commands',
          tips: ['The help command is your best friend', 'You can also use "help <command>" for specific help'],
          completed: false
        },
        {
          id: 'status',
          title: 'Check System Status',
          description: 'Learn how to check the current system status',
          command: 'status',
          expectedOutput: 'System status information',
          tips: ['Status shows connection health and uptime'],
          completed: false
        },
        {
          id: 'history',
          title: 'View Command History',
          description: 'See your previous commands',
          command: 'history',
          expectedOutput: 'List of recent commands',
          tips: ['Use arrow keys to navigate history', 'Ctrl+R to search history'],
          completed: false
        }
      ]
    },
    {
      id: 'advanced',
      title: 'Advanced Features',
      description: 'Master keyboard shortcuts and advanced commands',
      difficulty: 'intermediate',
      estimatedTime: 10,
      icon: <Zap className="w-5 h-5" />,
      steps: [
        {
          id: 'autocomplete',
          title: 'Use Tab Autocomplete',
          description: 'Press Tab to autocomplete commands',
          tips: ['Start typing a command and press Tab', 'Double Tab shows all options'],
          completed: false
        },
        {
          id: 'shortcuts',
          title: 'Keyboard Shortcuts',
          description: 'Learn time-saving keyboard shortcuts',
          tips: ['Ctrl+L clears the terminal', 'Ctrl+C cancels current command', 'Ctrl+K opens command palette'],
          completed: false
        }
      ]
    },
    {
      id: 'projects',
      title: 'Working with Projects',
      description: 'Manage and navigate your projects',
      difficulty: 'intermediate',
      estimatedTime: 15,
      icon: <Target className="w-5 h-5" />,
      steps: [
        {
          id: 'list-projects',
          title: 'List Your Projects',
          description: 'View all available projects',
          command: 'project list',
          completed: false
        },
        {
          id: 'open-project',
          title: 'Open a Project',
          description: 'Navigate to a specific project',
          command: 'project open my-app',
          tips: ['Replace "my-app" with your project name'],
          completed: false
        }
      ]
    }
  ]

  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [showSuccess, setShowSuccess] = useState(false)

  const currentStep = selectedTutorial?.steps[currentStepIndex]

  const handleStepComplete = () => {
    if (!currentStep || !selectedTutorial) return

    const newCompleted = new Set(completedSteps)
    newCompleted.add(`${selectedTutorial.id}-${currentStep.id}`)
    setCompletedSteps(newCompleted)

    if (currentStepIndex < (selectedTutorial.steps?.length || 0) - 1) {
      setCurrentStepIndex(currentStepIndex + 1)
    } else {
      // Tutorial completed
      setShowSuccess(true)
      setTimeout(() => {
        setShowSuccess(false)
        setSelectedTutorial(null)
        setCurrentStepIndex(0)
      }, 3000)
    }
  }

  const handleRunCommand = () => {
    if (currentStep?.command) {
      onExecuteCommand(currentStep.command)
      // Simulate command execution and mark as complete
      setTimeout(handleStepComplete, 1000)
    }
  }

  const getDifficultyColor = (difficulty: Tutorial['difficulty']) => {
    switch (difficulty) {
      case 'beginner':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
      case 'intermediate':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30'
      case 'advanced':
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
    }
  }

  const calculateProgress = (tutorial: Tutorial) => {
    if (!tutorial.steps || !Array.isArray(tutorial.steps)) return 0
    const tutorialCompleted = tutorial.steps.filter(step => 
      completedSteps.has(`${tutorial.id}-${step.id}`)
    ).length
    return (tutorialCompleted / tutorial.steps.length) * 100
  }

  if (showSuccess) {
    return (
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8",
        "flex flex-col items-center justify-center text-center",
        className
      )}>
        <Award className="w-16 h-16 text-yellow-500 mb-4" />
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Tutorial Completed!
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Great job! You've mastered this tutorial.
        </p>
      </div>
    )
  }

  if (selectedTutorial) {
    return (
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700",
        className
      )}>
        {/* Tutorial Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => {
                setSelectedTutorial(null)
                setCurrentStepIndex(0)
              }}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ← Back to tutorials
            </button>
            <span className="text-sm text-gray-500">
              Step {currentStepIndex + 1} of {selectedTutorial.steps?.length || 0}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {selectedTutorial.title}
          </h3>
          
          {/* Progress bar */}
          <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-violet-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / (selectedTutorial.steps?.length || 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6">
          <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            {currentStep?.title}
          </h4>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {currentStep?.description}
          </p>

          {currentStep?.command && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Run this command:
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 bg-gray-900 dark:bg-gray-950 text-green-400 rounded-lg font-mono">
                  $ {currentStep.command}
                </code>
                <button
                  onClick={handleRunCommand}
                  className="px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Run
                </button>
              </div>
            </div>
          )}

          {currentStep?.expectedOutput && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Expected output:
              </label>
              <div className="px-4 py-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                {currentStep.expectedOutput}
              </div>
            </div>
          )}

          {currentStep?.tips && Array.isArray(currentStep.tips) && currentStep.tips.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pro Tips:
                </span>
              </div>
              <ul className="space-y-1">
                {(currentStep.tips || []).map((tip, idx) => (
                  <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                    <span className="text-violet-500 mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
            disabled={currentStepIndex === 0}
            className={cn(
              "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
              currentStepIndex === 0
                ? "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {!currentStep?.command && (
            <button
              onClick={handleStepComplete}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              Mark Complete
              <CheckCircle className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              if (currentStepIndex < (selectedTutorial.steps?.length || 0) - 1) {
                setCurrentStepIndex(currentStepIndex + 1)
              } else {
                handleStepComplete()
              }
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {currentStepIndex < (selectedTutorial.steps?.length || 0) - 1 ? (
              <>
                Skip
                <SkipForward className="w-4 h-4" />
              </>
            ) : (
              <>
                Finish
                <CheckCircle className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Interactive Tutorials
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Learn Claude CLI step by step with interactive guides
        </p>
      </div>

      {/* Tutorial List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {(tutorials || []).map((tutorial) => {
          const progress = calculateProgress(tutorial)
          
          return (
            <button
              key={tutorial.id}
              onClick={() => setSelectedTutorial(tutorial)}
              className="w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors text-left"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-violet-600 dark:text-violet-400">
                  {tutorial.icon}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                    {tutorial.title}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {tutorial.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs">
                    <span className={cn(
                      "px-2 py-1 rounded-full font-medium",
                      getDifficultyColor(tutorial.difficulty)
                    )}>
                      {tutorial.difficulty}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      ~{tutorial.estimatedTime} min
                    </span>
                    {progress > 0 && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {progress === 100 ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Completed
                          </span>
                        ) : (
                          `${Math.round(progress)}% complete`
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 mt-3" />
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <button
          onClick={() => onExecuteCommand('tutorial --interactive')}
          className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          View all tutorials in terminal →
        </button>
      </div>
    </div>
  )
}