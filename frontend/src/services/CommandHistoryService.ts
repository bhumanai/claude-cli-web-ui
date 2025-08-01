/**
 * CommandHistoryService - Manages command history with profile-specific features
 * Provides intelligent command suggestions, autocomplete, and history management
 */

import type { UserProfile } from '../components/ProfileSelector'
import { profileConfigService } from './ProfileConfigService'

interface CommandEntry {
  id: string
  command: string
  profile: UserProfile
  timestamp: Date
  duration?: number
  exitCode?: number
  output?: string
  favorite?: boolean
  tags?: string[]
}

interface CommandSuggestion {
  command: string
  description: string
  category: string
  frequency: number
  lastUsed: Date
  profile: UserProfile
}

interface CommandTemplate {
  id: string
  name: string
  command: string
  description: string
  variables: Array<{
    name: string
    description: string
    defaultValue?: string
    required: boolean
  }>
  profile: UserProfile
  category: string
}

class CommandHistoryService {
  private history: CommandEntry[] = []
  private suggestions: CommandSuggestion[] = []
  private templates: CommandTemplate[] = []
  private commandFrequency: Map<string, number> = new Map()

  constructor() {
    this.loadHistory()
    this.initializeTemplates()
    this.setupPeriodicCleanup()
  }

  private loadHistory(): void {
    const history = profileConfigService.getCommandHistory() || []
    this.history = (history || []).map(item => ({
      id: this.generateId(),
      command: item.command,
      profile: item.profile,
      timestamp: item.timestamp,
      output: item.output
    }))

    this.updateCommandFrequency()
    this.generateSuggestions()
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  private updateCommandFrequency(): void {
    this.commandFrequency.clear()
    
    this.history.forEach(entry => {
      const current = this.commandFrequency.get(entry.command) || 0
      this.commandFrequency.set(entry.command, current + 1)
    })
  }

  private generateSuggestions(): void {
    const profileSuggestions = new Map<string, CommandSuggestion>()
    
    // Generate suggestions from history
    this.history.forEach(entry => {
      const key = `${entry.command}-${entry.profile}`
      const existing = profileSuggestions.get(key)
      
      if (existing) {
        existing.frequency++
        if (entry.timestamp > existing.lastUsed) {
          existing.lastUsed = entry.timestamp
        }
      } else {
        profileSuggestions.set(key, {
          command: entry.command,
          description: this.generateDescription(entry.command, entry.profile),
          category: this.categorizeCommand(entry.command, entry.profile),
          frequency: 1,
          lastUsed: entry.timestamp,
          profile: entry.profile
        })
      }
    })

    this.suggestions = Array.from(profileSuggestions.values())
      .sort((a, b) => b.frequency - a.frequency)
  }

  private generateDescription(command: string, profile: UserProfile): string {
    const descriptions: Record<UserProfile, Record<string, string>> = {
      developer: {
        'git status': 'Show git repository status',
        'git commit': 'Commit staged changes',
        'npm run build': 'Build the project',
        'npm test': 'Run tests',
        'git push': 'Push commits to remote',
        'git pull': 'Pull latest changes'
      },
      analyst: {
        'data query': 'Execute data query',
        'data export': 'Export data to file',
        'data visualize': 'Create data visualization',
        'data stats': 'Show data statistics'
      },
      devops: {
        'logs tail': 'Stream live logs',
        'logs search': 'Search log entries',
        'deploy status': 'Check deployment status',
        'health check': 'Check service health'
      },
      general: {
        'help': 'Show available commands',
        'status': 'Show system status',
        'history': 'Show command history',
        'clear': 'Clear terminal'
      }
    }

    return descriptions[profile]?.[command] || `Execute: ${command}`
  }

  private categorizeCommand(command: string, profile: UserProfile): string {
    const categories: Record<UserProfile, Record<string, string>> = {
      developer: {
        git: 'Version Control',
        npm: 'Package Management',
        yarn: 'Package Management',
        build: 'Build Tools',
        test: 'Testing',
        debug: 'Debugging'
      },
      analyst: {
        data: 'Data Operations',
        query: 'Database',
        export: 'Data Export',
        visualize: 'Visualization'
      },
      devops: {
        logs: 'Monitoring',
        deploy: 'Deployment',
        health: 'System Health',
        docker: 'Containerization',
        kubectl: 'Kubernetes'
      },
      general: {
        help: 'Help',
        status: 'System',
        history: 'History',
        clear: 'Utility'
      }
    }

    for (const [key, category] of Object.entries(categories[profile] || {})) {
      if (command.includes(key)) {
        return category
      }
    }

    return 'General'
  }

  private initializeTemplates(): void {
    this.templates = [
      // Developer templates
      {
        id: 'git-commit-template',
        name: 'Git Commit with Message',
        command: 'git commit -m "{{message}}"',
        description: 'Commit changes with a message',
        variables: [
          { name: 'message', description: 'Commit message', required: true }
        ],
        profile: 'developer',
        category: 'Version Control'
      },
      {
        id: 'npm-install-package',
        name: 'Install NPM Package',
        command: 'npm install {{package}} {{flags}}',
        description: 'Install an NPM package',
        variables: [
          { name: 'package', description: 'Package name', required: true },
          { name: 'flags', description: 'Additional flags', defaultValue: '', required: false }
        ],
        profile: 'developer',
        category: 'Package Management'
      },
      
      // Data Analyst templates
      {
        id: 'data-query-template',
        name: 'Execute Data Query',
        command: 'data query "{{sql}}" --format={{format}}',
        description: 'Execute SQL query with specified format',
        variables: [
          { name: 'sql', description: 'SQL query', required: true },
          { name: 'format', description: 'Output format', defaultValue: 'table', required: false }
        ],
        profile: 'analyst',
        category: 'Database'
      },
      {
        id: 'data-export-template',
        name: 'Export Data',
        command: 'data export {{dataset}} --format={{format}} --output={{file}}',
        description: 'Export dataset to file',
        variables: [
          { name: 'dataset', description: 'Dataset name', required: true },
          { name: 'format', description: 'Export format', defaultValue: 'csv', required: false },
          { name: 'file', description: 'Output filename', required: true }
        ],
        profile: 'analyst',
        category: 'Data Export'
      },

      // DevOps templates
      {
        id: 'logs-search-template',
        name: 'Search Logs',
        command: 'logs search "{{pattern}}" --level={{level}} --since={{time}}',
        description: 'Search logs with pattern and filters',
        variables: [
          { name: 'pattern', description: 'Search pattern', required: true },
          { name: 'level', description: 'Log level filter', defaultValue: 'all', required: false },
          { name: 'time', description: 'Time range', defaultValue: '1h', required: false }
        ],
        profile: 'devops',
        category: 'Monitoring'
      },
      {
        id: 'deploy-service-template',
        name: 'Deploy Service',
        command: 'deploy {{service}} --env={{environment}} --version={{version}}',
        description: 'Deploy service to environment',
        variables: [
          { name: 'service', description: 'Service name', required: true },
          { name: 'environment', description: 'Target environment', defaultValue: 'staging', required: false },
          { name: 'version', description: 'Version to deploy', defaultValue: 'latest', required: false }
        ],
        profile: 'devops',
        category: 'Deployment'
      }
    ]
  }

  private setupPeriodicCleanup(): void {
    // Clean up old history entries every hour
    setInterval(() => {
      this.cleanupOldEntries()
    }, 3600000) // 1 hour
  }

  private cleanupOldEntries(): void {
    const maxAge = 30 * 24 * 60 * 60 * 1000 // 30 days
    const cutoff = new Date(Date.now() - maxAge)
    
    this.history = this.history.filter(entry => entry.timestamp > cutoff)
    this.updateCommandFrequency()
    this.generateSuggestions()
  }

  // Public API
  addCommand(
    command: string, 
    profile: UserProfile, 
    options: {
      duration?: number
      exitCode?: number
      output?: string
      favorite?: boolean
      tags?: string[]
    } = {}
  ): void {
    const entry: CommandEntry = {
      id: this.generateId(),
      command,
      profile,
      timestamp: new Date(),
      ...options
    }

    this.history.unshift(entry)
    
    // Update config service
    profileConfigService.addCommandToHistory(command, profile, options.output)
    
    // Update frequency and suggestions
    this.updateCommandFrequency()
    this.generateSuggestions()
  }

  getHistory(profile?: UserProfile, limit = 100): CommandEntry[] {
    let filtered = this.history

    if (profile) {
      filtered = filtered.filter(entry => entry.profile === profile)
    }

    return filtered.slice(0, limit)
  }

  searchHistory(query: string, profile?: UserProfile): CommandEntry[] {
    const lowercaseQuery = query.toLowerCase()
    
    return this.history
      .filter(entry => {
        if (profile && entry.profile !== profile) return false
        return entry.command.toLowerCase().includes(lowercaseQuery) ||
               entry.output?.toLowerCase().includes(lowercaseQuery) ||
               entry.tags?.some(tag => tag.toLowerCase().includes(lowercaseQuery))
      })
      .slice(0, 50)
  }

  getSuggestions(profile?: UserProfile, limit = 10): CommandSuggestion[] {
    let filtered = this.suggestions

    if (profile) {
      filtered = filtered.filter(suggestion => suggestion.profile === profile)
    }

    return filtered.slice(0, limit)
  }

  getAutocompleteSuggestions(partial: string, profile?: UserProfile): string[] {
    const lowercasePartial = partial.toLowerCase()
    
    return this.suggestions
      .filter(suggestion => {
        if (profile && suggestion.profile !== profile) return false
        return suggestion.command.toLowerCase().startsWith(lowercasePartial)
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)
      .map(suggestion => suggestion.command)
  }

  getTemplates(profile?: UserProfile): CommandTemplate[] {
    if (profile) {
      return this.templates.filter(template => template.profile === profile)
    }
    return this.templates
  }

  executeTemplate(templateId: string, variables: Record<string, string>): string {
    const template = this.templates.find(t => t.id === templateId)
    if (!template) {
      throw new Error(`Template ${templateId} not found`)
    }

    let command = template.command
    
    // Replace variables
    template.variables.forEach(variable => {
      const value = variables[variable.name] ?? variable.defaultValue ?? ''
      const regex = new RegExp(`{{${variable.name}}}`, 'g')
      command = command.replace(regex, value)
    })

    return command
  }

  addTemplate(template: Omit<CommandTemplate, 'id'>): void {
    const newTemplate: CommandTemplate = {
      ...template,
      id: this.generateId()
    }
    
    this.templates.push(newTemplate)
    this.saveTemplates()
  }

  private saveTemplates(): void {
    // Save custom templates to localStorage
    const customTemplates = this.templates.filter(t => !t.id.includes('template'))
    localStorage.setItem('claude-cli-custom-templates', JSON.stringify(customTemplates))
  }

  toggleFavorite(commandId: string): void {
    const entry = this.history.find(e => e.id === commandId)
    if (entry) {
      entry.favorite = !entry.favorite
    }
  }

  getFavorites(profile?: UserProfile): CommandEntry[] {
    return this.history
      .filter(entry => {
        if (!entry.favorite) return false
        if (profile && entry.profile !== profile) return false
        return true
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  getCommandStats(profile?: UserProfile): {
    totalCommands: number
    uniqueCommands: number
    averagePerDay: number
    mostUsedCommands: Array<{ command: string; count: number }>
    profileDistribution: Record<UserProfile, number>
  } {
    let filtered = this.history
    
    if (profile) {
      filtered = filtered.filter(entry => entry.profile === profile)
    }

    const uniqueCommands = new Set(filtered.map(entry => entry.command)).size
    
    // Calculate average per day
    const oldestEntry = filtered[filtered.length - 1]
    const daysSinceOldest = oldestEntry 
      ? Math.ceil((Date.now() - oldestEntry.timestamp.getTime()) / (1000 * 60 * 60 * 24))
      : 1
    const averagePerDay = Math.round(filtered.length / daysSinceOldest)

    // Most used commands
    const commandCounts: Record<string, number> = {}
    filtered.forEach(entry => {
      commandCounts[entry.command] = (commandCounts[entry.command] || 0) + 1
    })
    
    const mostUsedCommands = Object.entries(commandCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([command, count]) => ({ command, count }))

    // Profile distribution
    const profileDistribution: Record<UserProfile, number> = {
      developer: 0,
      analyst: 0,
      devops: 0,
      general: 0
    }
    
    this.history.forEach(entry => {
      profileDistribution[entry.profile]++
    })

    return {
      totalCommands: filtered.length,
      uniqueCommands,
      averagePerDay,
      mostUsedCommands,
      profileDistribution
    }
  }

  clearHistory(profile?: UserProfile): void {
    if (profile) {
      this.history = this.history.filter(entry => entry.profile !== profile)
    } else {
      this.history = []
    }
    
    profileConfigService.clearCommandHistory()
    this.updateCommandFrequency()
    this.generateSuggestions()
  }

  exportHistory(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      history: this.history,
      templates: this.templates.filter(t => !t.id.includes('template')) // Only custom templates
    }, null, 2)
  }

  importHistory(data: string): boolean {
    try {
      const parsed = JSON.parse(data)
      
      if (parsed.history) {
        // Convert timestamp strings back to Date objects
        const importedHistory = parsed.history.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }))
        
        this.history = [...importedHistory, ...this.history]
      }
      
      if (parsed.templates) {
        this.templates = [...this.templates, ...parsed.templates]
      }
      
      this.updateCommandFrequency()
      this.generateSuggestions()
      
      return true
    } catch (error) {
      console.error('Failed to import history:', error)
      return false
    }
  }
}

// Export singleton instance
export const commandHistoryService = new CommandHistoryService()
export type { CommandEntry, CommandSuggestion, CommandTemplate }