/**
 * ProfileConfigService - Manages user profile settings and persistence
 * Handles profile preferences, customization, and local storage
 */

import type { UserProfile } from '../components/ProfileSelector'

interface ProfileConfig {
  selectedProfile: UserProfile
  preferences: {
    theme: 'light' | 'dark' | 'auto'
    autoSave: boolean
    notifications: boolean
    tutorial: {
      completed: string[]
      showHints: boolean
      autoProgress: boolean
    }
    developer: {
      showLineNumbers: boolean
      syntaxHighlighting: boolean
      gitAutoRefresh: boolean
      buildNotifications: boolean
      editorTheme: 'dark' | 'light'
    }
    analyst: {
      defaultChartType: 'bar' | 'line' | 'pie'
      autoRefreshData: boolean
      exportFormat: 'csv' | 'json' | 'xlsx'
      showStatistics: boolean
    }
    devops: {
      logStreamingEnabled: boolean
      alertThreshold: 'low' | 'medium' | 'high'
      maxLogHistory: number
      autoScroll: boolean
    }
    general: {
      tutorialSpeed: 'slow' | 'normal' | 'fast'
      showTooltips: boolean
      verboseHelp: boolean
      guidedMode: boolean
    }
  }
  customization: {
    layout: 'compact' | 'comfortable' | 'spacious'
    sidebarCollapsed: boolean
    terminalHeight: number
    fontSize: 'small' | 'medium' | 'large'
  }
  history: {
    commands: Array<{
      command: string
      timestamp: Date
      profile: UserProfile
      output?: string
    }>
    recentProjects: string[]
    bookmarkedCommands: Array<{
      name: string
      command: string
      profile: UserProfile
    }>
  }
}

class ProfileConfigService {
  private readonly STORAGE_KEY = 'claude-cli-profile-config'
  private readonly BACKUP_KEY = 'claude-cli-profile-config-backup'
  private config: ProfileConfig
  private subscribers: Array<(config: ProfileConfig) => void> = []

  constructor() {
    this.config = this.loadConfig()
    this.setupAutoSave()
  }

  private getDefaultConfig(): ProfileConfig {
    return {
      selectedProfile: 'general',
      preferences: {
        theme: 'auto',
        autoSave: true,
        notifications: true,
        tutorial: {
          completed: [],
          showHints: true,
          autoProgress: false
        },
        developer: {
          showLineNumbers: true,
          syntaxHighlighting: true,
          gitAutoRefresh: true,
          buildNotifications: true,
          editorTheme: 'dark'
        },
        analyst: {
          defaultChartType: 'bar',
          autoRefreshData: true,
          exportFormat: 'csv',
          showStatistics: true
        },
        devops: {
          logStreamingEnabled: true,
          alertThreshold: 'medium',
          maxLogHistory: 1000,
          autoScroll: true
        },
        general: {
          tutorialSpeed: 'normal',
          showTooltips: true,
          verboseHelp: true,
          guidedMode: true
        }
      },
      customization: {
        layout: 'comfortable',
        sidebarCollapsed: false,
        terminalHeight: 400,
        fontSize: 'medium'
      },
      history: {
        commands: [],
        recentProjects: [],
        bookmarkedCommands: []
      }
    }
  }

  private loadConfig(): ProfileConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) {
        return this.getDefaultConfig()
      }

      const parsed = JSON.parse(stored)
      
      // Convert date strings back to Date objects
      if (parsed.history?.commands) {
        parsed.history.commands = parsed.history.commands.map((cmd: any) => ({
          ...cmd,
          timestamp: new Date(cmd.timestamp)
        }))
      }

      // Merge with defaults to handle new config options
      return this.mergeWithDefaults(parsed)
    } catch (error) {
      console.error('Failed to load profile config:', error)
      return this.getDefaultConfig()
    }
  }

  private mergeWithDefaults(config: Partial<ProfileConfig>): ProfileConfig {
    const defaults = this.getDefaultConfig()
    
    return {
      selectedProfile: config.selectedProfile || defaults.selectedProfile,
      preferences: {
        ...defaults.preferences,
        ...config.preferences,
        tutorial: {
          ...defaults.preferences.tutorial,
          ...config.preferences?.tutorial
        },
        developer: {
          ...defaults.preferences.developer,
          ...config.preferences?.developer
        },
        analyst: {
          ...defaults.preferences.analyst,
          ...config.preferences?.analyst
        },
        devops: {
          ...defaults.preferences.devops,
          ...config.preferences?.devops
        },
        general: {
          ...defaults.preferences.general,
          ...config.preferences?.general
        }
      },
      customization: {
        ...defaults.customization,
        ...config.customization
      },
      history: {
        ...defaults.history,
        ...config.history,
        commands: config.history?.commands || defaults.history.commands,
        recentProjects: config.history?.recentProjects || defaults.history.recentProjects,
        bookmarkedCommands: config.history?.bookmarkedCommands || defaults.history.bookmarkedCommands
      }
    }
  }

  private saveConfig(): void {
    try {
      // Create backup of current config
      const current = localStorage.getItem(this.STORAGE_KEY)
      if (current) {
        localStorage.setItem(this.BACKUP_KEY, current)
      }

      // Save new config
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config))
      
      // Notify subscribers
      this.notifySubscribers()
    } catch (error) {
      console.error('Failed to save profile config:', error)
    }
  }

  private setupAutoSave(): void {
    // Auto-save on page unload
    window.addEventListener('beforeunload', () => {
      if (this.config.preferences.autoSave) {
        this.saveConfig()
      }
    })

    // Periodic auto-save every 30 seconds
    setInterval(() => {
      if (this.config.preferences.autoSave) {
        this.saveConfig()
      }
    }, 30000)
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.config))
  }

  // Public API
  getConfig(): ProfileConfig {
    return { ...this.config }
  }

  getSelectedProfile(): UserProfile {
    return this.config.selectedProfile
  }

  setSelectedProfile(profile: UserProfile): void {
    this.config.selectedProfile = profile
    this.saveConfig()
  }

  getProfilePreferences<T extends keyof ProfileConfig['preferences']>(
    profile: T
  ): ProfileConfig['preferences'][T] {
    return this.config.preferences[profile]
  }

  updateProfilePreferences<T extends keyof ProfileConfig['preferences']>(
    profile: T,
    updates: Partial<ProfileConfig['preferences'][T]>
  ): void {
    this.config.preferences[profile] = {
      ...this.config.preferences[profile],
      ...updates
    } as ProfileConfig['preferences'][T]
    
    this.saveConfig()
  }

  getCustomization(): ProfileConfig['customization'] {
    return this.config.customization
  }

  updateCustomization(updates: Partial<ProfileConfig['customization']>): void {
    this.config.customization = {
      ...this.config.customization,
      ...updates
    }
    this.saveConfig()
  }

  // Command history management
  addCommandToHistory(command: string, profile: UserProfile, output?: string): void {
    const historyItem = {
      command,
      timestamp: new Date(),
      profile,
      output
    }

    this.config.history.commands.unshift(historyItem)
    
    // Limit history size
    const maxHistory = this.config.preferences.devops.maxLogHistory
    if (this.config.history.commands.length > maxHistory) {
      this.config.history.commands = this.config.history.commands.slice(0, maxHistory)
    }

    this.saveConfig()
  }

  getCommandHistory(profile?: UserProfile, limit = 50): Array<{
    command: string
    timestamp: Date
    profile: UserProfile
    output?: string
  }> {
    let commands = this.config.history?.commands || []

    if (profile) {
      commands = commands.filter(cmd => cmd.profile === profile)
    }

    return commands.slice(0, limit)
  }

  clearCommandHistory(): void {
    this.config.history.commands = []
    this.saveConfig()
  }

  // Bookmark management
  addBookmark(name: string, command: string, profile: UserProfile): void {
    const bookmark = { name, command, profile }
    
    // Remove existing bookmark with same name
    this.config.history.bookmarkedCommands = this.config.history.bookmarkedCommands
      .filter(b => b.name !== name)
    
    this.config.history.bookmarkedCommands.push(bookmark)
    this.saveConfig()
  }

  removeBookmark(name: string): void {
    this.config.history.bookmarkedCommands = this.config.history.bookmarkedCommands
      .filter(b => b.name !== name)
    this.saveConfig()
  }

  getBookmarks(profile?: UserProfile): Array<{
    name: string
    command: string
    profile: UserProfile
  }> {
    if (profile) {
      return this.config.history.bookmarkedCommands
        .filter(b => b.profile === profile)
    }
    return this.config.history.bookmarkedCommands
  }

  // Tutorial progress
  markTutorialStepComplete(tutorialId: string, stepId: string): void {
    const key = `${tutorialId}-${stepId}`
    if (!this.config.preferences.tutorial.completed.includes(key)) {
      this.config.preferences.tutorial.completed.push(key)
      this.saveConfig()
    }
  }

  isTutorialStepComplete(tutorialId: string, stepId: string): boolean {
    const key = `${tutorialId}-${stepId}`
    return this.config.preferences.tutorial.completed.includes(key)
  }

  resetTutorialProgress(): void {
    this.config.preferences.tutorial.completed = []
    this.saveConfig()
  }

  // Recent projects
  addRecentProject(projectPath: string): void {
    // Remove if already exists
    this.config.history.recentProjects = this.config.history.recentProjects
      .filter(p => p !== projectPath)
    
    // Add to front
    this.config.history.recentProjects.unshift(projectPath)
    
    // Limit to 10 recent projects
    if (this.config.history.recentProjects.length > 10) {
      this.config.history.recentProjects = this.config.history.recentProjects.slice(0, 10)
    }

    this.saveConfig()
  }

  getRecentProjects(): string[] {
    return [...this.config.history.recentProjects]
  }

  // Subscription management
  subscribe(callback: (config: ProfileConfig) => void): () => void {
    this.subscribers.push(callback)
    
    // Return unsubscribe function
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback)
    }
  }

  // Export/Import configuration
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2)
  }

  importConfig(configJson: string): boolean {
    try {
      const imported = JSON.parse(configJson)
      this.config = this.mergeWithDefaults(imported)
      this.saveConfig()
      return true
    } catch (error) {
      console.error('Failed to import config:', error)
      return false
    }
  }

  // Reset to defaults
  reset(): void {
    this.config = this.getDefaultConfig()
    this.saveConfig()
  }

  // Backup and restore
  createBackup(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      config: this.config
    })
  }

  restoreFromBackup(): boolean {
    try {
      const backup = localStorage.getItem(this.BACKUP_KEY)
      if (backup) {
        const parsed = JSON.parse(backup)
        this.config = this.mergeWithDefaults(parsed)
        this.saveConfig()
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to restore from backup:', error)
      return false
    }
  }
}

// Export singleton instance
export const profileConfigService = new ProfileConfigService()
export type { ProfileConfig }