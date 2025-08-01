import { CommandHistory, Task, Project, Theme } from '../types'

// Data structure versions for migration support
export const STORAGE_VERSION = '1.2.0'

// Storage keys with versioning
export const STORAGE_KEYS = {
  SESSION: 'claude-cli-session-v1.2',
  COMMAND_HISTORY: 'claude-cli-command-history-v1.2',
  USER_PREFERENCES: 'claude-cli-preferences-v1.2',
  VIEW_STATE: 'claude-cli-view-state-v1.2',
  BACKUP: 'claude-cli-backup-v1.2',
  SCHEMA_VERSION: 'claude-cli-schema-version'
} as const

// Configuration constants
export const STORAGE_CONFIG = {
  MAX_COMMAND_HISTORY: 100,
  MAX_OUTPUT_LENGTH: 2000,
  SESSION_EXPIRY_HOURS: 24,
  AUTO_SAVE_INTERVAL: 30000,
  MAX_STORAGE_SIZE_MB: 10,
  BACKUP_RETENTION_DAYS: 7,
  CROSS_TAB_SYNC_INTERVAL: 5000
} as const

// Data schemas and interfaces
export interface SessionData {
  sessionId: string
  lastActivity: string
  version: string
  created: string
  deviceInfo?: {
    userAgent: string
    language: string
    timezone: string
  }
}

export interface UserPreferences {
  theme: Theme
  fontSize: 'small' | 'medium' | 'large'
  commandSuggestions: boolean
  autoSave: boolean
  notifications: boolean
  soundEnabled: boolean
  animationsEnabled: boolean
  compactMode: boolean
  showTimestamps: boolean
  maxHistoryItems: number
}

export interface ViewState {
  activeView: 'terminal' | 'tasks'
  sidebarCollapsed: boolean
  terminalHeight: number
  splitViewEnabled: boolean
  activeTab: string
  scrollPosition: number
  filters: Record<string, any>
  sortSettings: Record<string, any>
}

export interface StorageMetadata {
  totalSize: number
  lastCleanup: string
  itemCounts: Record<string, number>
  corruptionEvents: number
}

// Validation schemas
export class DataValidator {
  static validateCommandHistory(data: any): data is CommandHistory[] {
    if (!Array.isArray(data)) return false
    return data.every(cmd => 
      typeof cmd.id === 'string' &&
      typeof cmd.command === 'string' &&
      cmd.timestamp &&
      ['success', 'error', 'pending', 'completed'].includes(cmd.status)
    )
  }

  static validateUserPreferences(data: any): data is UserPreferences {
    if (!data || typeof data !== 'object') return false
    const required = ['theme', 'fontSize', 'commandSuggestions', 'autoSave']
    return required.every(key => key in data)
  }

  static validateViewState(data: any): data is ViewState {
    if (!data || typeof data !== 'object') return false
    return 'activeView' in data && 'sidebarCollapsed' in data
  }

  static validateSessionData(data: any): data is SessionData {
    if (!data || typeof data !== 'object') return false
    return typeof data.sessionId === 'string' && 
           typeof data.lastActivity === 'string' &&
           typeof data.version === 'string'
  }
}

// Migration system
export class StorageMigrator {
  private static migrations: Record<string, (data: any) => any> = {
    '1.0.0': (data) => ({
      ...data,
      version: '1.1.0',
      preferences: { ...data.preferences, animationsEnabled: true }
    }),
    '1.1.0': (data) => ({
      ...data,
      version: '1.2.0',
      preferences: { ...data.preferences, maxHistoryItems: 100 }
    })
  }

  static migrate(data: any, fromVersion: string, toVersion: string): any {
    let currentData = data
    let currentVersion = fromVersion

    while (currentVersion !== toVersion && this.migrations[currentVersion]) {
      currentData = this.migrations[currentVersion](currentData)
      currentVersion = currentData.version
    }

    return currentData
  }

  static shouldMigrate(storedVersion: string, currentVersion: string): boolean {
    return storedVersion !== currentVersion && this.migrations[storedVersion]
  }
}

// Main storage service
export class SessionStorageService {
  private static instance: SessionStorageService
  private isInitialized = false
  private crossTabSyncEnabled = true
  private storageEventListener?: (e: StorageEvent) => void

  static getInstance(): SessionStorageService {
    if (!SessionStorageService.instance) {
      SessionStorageService.instance = new SessionStorageService()
    }
    return SessionStorageService.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Check storage availability
      this.checkStorageAvailability()
      
      // Run migrations if needed
      await this.runMigrations()
      
      // Setup cross-tab synchronization
      this.setupCrossTabSync()
      
      // Cleanup expired data
      await this.cleanup()
      
      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize SessionStorageService:', error)
      throw error
    }
  }

  // Core storage operations
  private setItem<T>(key: string, value: T): boolean {
    try {
      const serialized = JSON.stringify({
        data: value,
        timestamp: Date.now(),
        version: STORAGE_VERSION
      })
      
      // Check storage size before saving
      if (this.getStorageSize() + serialized.length > STORAGE_CONFIG.MAX_STORAGE_SIZE_MB * 1024 * 1024) {
        this.performEmergencyCleanup()
      }
      
      localStorage.setItem(key, serialized)
      return true
    } catch (error) {
      console.error(`Failed to save ${key}:`, error)
      return false
    }
  }

  private getItem<T>(key: string): T | null {
    try {
      const stored = localStorage.getItem(key)
      if (!stored) return null
      
      const parsed = JSON.parse(stored)
      
      // Check data version and migrate if needed
      if (parsed.version && parsed.version !== STORAGE_VERSION) {
        const migrated = StorageMigrator.migrate(parsed.data, parsed.version, STORAGE_VERSION)
        this.setItem(key, migrated)
        return migrated
      }
      
      return parsed.data
    } catch (error) {
      console.error(`Failed to load ${key}:`, error)
      // Try to recover from corruption
      this.handleCorruption(key)
      return null
    }
  }

  // Session data management
  saveSession(data: Partial<SessionData>): boolean {
    const existing = this.getSessionInternal()
    const updated: SessionData = {
      ...existing,
      ...data,
      lastActivity: new Date().toISOString(),
      version: STORAGE_VERSION
    }
    
    return this.setItem(STORAGE_KEYS.SESSION, updated)
  }

  getSession(): SessionData {
    const data = this.getItem<SessionData>(STORAGE_KEYS.SESSION)
    
    if (!data || !DataValidator.validateSessionData(data)) {
      // Create default session
      const defaultSession: SessionData = {
        sessionId: this.generateSessionId(),
        lastActivity: new Date().toISOString(),
        version: STORAGE_VERSION,
        created: new Date().toISOString(),
        deviceInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      }
      // Directly set the item to avoid recursion
      this.setItem(STORAGE_KEYS.SESSION, defaultSession)
      return defaultSession
    }
    
    // Check if session is expired
    const lastActivity = new Date(data.lastActivity)
    const hoursSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60)
    
    if (hoursSinceActivity > STORAGE_CONFIG.SESSION_EXPIRY_HOURS) {
      this.clearSession()
      // Create new session directly without recursion
      const newSession: SessionData = {
        sessionId: this.generateSessionId(),
        lastActivity: new Date().toISOString(),
        version: STORAGE_VERSION,
        created: new Date().toISOString(),
        deviceInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      }
      this.setItem(STORAGE_KEYS.SESSION, newSession)
      return newSession
    }
    
    return data
  }

  // Internal method that doesn't create defaults to prevent recursion
  private getSessionInternal(): SessionData {
    const data = this.getItem<SessionData>(STORAGE_KEYS.SESSION)
    
    if (!data || !DataValidator.validateSessionData(data)) {
      // Return basic defaults without saving to prevent recursion
      return {
        sessionId: this.generateSessionId(),
        lastActivity: new Date().toISOString(),
        version: STORAGE_VERSION,
        created: new Date().toISOString(),
        deviceInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      }
    }
    
    // Don't check for expiry in internal method to prevent recursion
    return data
  }

  clearSession(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
  }

  // Command history management
  saveCommandHistory(history: CommandHistory[]): boolean {
    const filtered = history
      .slice(-STORAGE_CONFIG.MAX_COMMAND_HISTORY)
      .map(cmd => ({
        ...cmd,
        output: cmd.output?.slice(0, STORAGE_CONFIG.MAX_OUTPUT_LENGTH) || ''
      }))
    
    return this.setItem(STORAGE_KEYS.COMMAND_HISTORY, filtered)
  }

  getCommandHistory(): CommandHistory[] {
    const data = this.getItem<CommandHistory[]>(STORAGE_KEYS.COMMAND_HISTORY)
    
    if (!data || !DataValidator.validateCommandHistory(data)) {
      return []
    }
    
    return data
  }

  addCommandToHistory(command: CommandHistory): boolean {
    const existing = this.getCommandHistory()
    const updated = [...existing, command]
    return this.saveCommandHistory(updated)
  }

  // User preferences management
  savePreferences(preferences: Partial<UserPreferences>): boolean {
    const existing = this.getPreferencesInternal()
    const updated: UserPreferences = { ...existing, ...preferences }
    return this.setItem(STORAGE_KEYS.USER_PREFERENCES, updated)
  }

  getPreferences(): UserPreferences {
    const data = this.getItem<UserPreferences>(STORAGE_KEYS.USER_PREFERENCES)
    
    if (!data || !DataValidator.validateUserPreferences(data)) {
      const defaults: UserPreferences = {
        theme: 'dark',
        fontSize: 'medium',
        commandSuggestions: true,
        autoSave: true,
        notifications: true,
        soundEnabled: false,
        animationsEnabled: true,
        compactMode: false,
        showTimestamps: true,
        maxHistoryItems: STORAGE_CONFIG.MAX_COMMAND_HISTORY
      }
      // Directly set the item to avoid recursion
      this.setItem(STORAGE_KEYS.USER_PREFERENCES, defaults)
      return defaults
    }
    
    return data
  }

  // Internal method that doesn't create defaults to prevent recursion
  private getPreferencesInternal(): UserPreferences {
    const data = this.getItem<UserPreferences>(STORAGE_KEYS.USER_PREFERENCES)
    
    if (!data || !DataValidator.validateUserPreferences(data)) {
      // Return basic defaults without saving to prevent recursion
      return {
        theme: 'dark',
        fontSize: 'medium',
        commandSuggestions: true,
        autoSave: true,
        notifications: true,
        soundEnabled: false,
        animationsEnabled: true,
        compactMode: false,
        showTimestamps: true,
        maxHistoryItems: STORAGE_CONFIG.MAX_COMMAND_HISTORY
      }
    }
    
    return data
  }

  // View state management
  saveViewState(state: Partial<ViewState>): boolean {
    const existing = this.getViewStateInternal()
    const updated: ViewState = { ...existing, ...state }
    return this.setItem(STORAGE_KEYS.VIEW_STATE, updated)
  }

  getViewState(): ViewState {
    const data = this.getItem<ViewState>(STORAGE_KEYS.VIEW_STATE)
    
    if (!data || !DataValidator.validateViewState(data)) {
      const defaults: ViewState = {
        activeView: 'terminal',
        sidebarCollapsed: false,
        terminalHeight: 400,
        splitViewEnabled: false,
        activeTab: 'terminal',
        scrollPosition: 0,
        filters: {},
        sortSettings: {}
      }
      // Directly set the item to avoid recursion
      this.setItem(STORAGE_KEYS.VIEW_STATE, defaults)
      return defaults
    }
    
    return data
  }

  // Internal method that doesn't create defaults to prevent recursion
  private getViewStateInternal(): ViewState {
    const data = this.getItem<ViewState>(STORAGE_KEYS.VIEW_STATE)
    
    if (!data || !DataValidator.validateViewState(data)) {
      // Return basic defaults without saving to prevent recursion
      return {
        activeView: 'terminal',
        sidebarCollapsed: false,
        terminalHeight: 400,
        splitViewEnabled: false,
        activeTab: 'terminal',
        scrollPosition: 0,
        filters: {},
        sortSettings: {}
      }
    }
    
    return data
  }

  // Backup and restore functionality
  createBackup(): string {
    const backup = {
      version: STORAGE_VERSION,
      timestamp: new Date().toISOString(),
      data: {
        session: this.getSession(),
        commandHistory: this.getCommandHistory(),
        preferences: this.getPreferences(),
        viewState: this.getViewState()
      }
    }
    
    const backupString = JSON.stringify(backup)
    this.setItem(STORAGE_KEYS.BACKUP, backup)
    return backupString
  }

  restoreFromBackup(backupData: string): boolean {
    try {
      const backup = JSON.parse(backupData)
      
      if (backup.data) {
        if (backup.data.session) this.saveSession(backup.data.session)
        if (backup.data.commandHistory) this.saveCommandHistory(backup.data.commandHistory)
        if (backup.data.preferences) this.savePreferences(backup.data.preferences)
        if (backup.data.viewState) this.saveViewState(backup.data.viewState)
      }
      
      return true
    } catch (error) {
      console.error('Failed to restore backup:', error)
      return false
    }
  }

  // Utility methods
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private checkStorageAvailability(): void {
    try {
      const testKey = '__test__'
      localStorage.setItem(testKey, 'test')
      localStorage.removeItem(testKey)
    } catch (error) {
      throw new Error('localStorage is not available')
    }
  }

  private getStorageSize(): number {
    let total = 0
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length
      }
    }
    return total
  }

  private async performEmergencyCleanup(): Promise<void> {
    // Remove oldest command history entries
    const history = this.getCommandHistory()
    if (history.length > 50) {
      this.saveCommandHistory(history.slice(-50))
    }
    
    // Clear old backups
    localStorage.removeItem(STORAGE_KEYS.BACKUP)
  }

  private handleCorruption(key: string): void {
    console.warn(`Data corruption detected for ${key}, clearing corrupted data`)
    localStorage.removeItem(key)
    
    // Update corruption counter
    const metadata = this.getStorageMetadata()
    metadata.corruptionEvents += 1
    this.updateStorageMetadata(metadata)
  }

  private async runMigrations(): Promise<void> {
    const currentVersion = localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION) || '1.0.0'
    
    if (StorageMigrator.shouldMigrate(currentVersion, STORAGE_VERSION)) {
      console.log(`Migrating storage from ${currentVersion} to ${STORAGE_VERSION}`)
      
      // Perform migrations for each stored item
      Object.values(STORAGE_KEYS).forEach(key => {
        if (key === STORAGE_KEYS.SCHEMA_VERSION) return
        
        const data = this.getItem(key)
        if (data) {
          const migrated = StorageMigrator.migrate(data, currentVersion, STORAGE_VERSION)
          this.setItem(key, migrated)
        }
      })
      
      localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, STORAGE_VERSION)
    }
  }

  private setupCrossTabSync(): void {
    if (!this.crossTabSyncEnabled) return

    this.storageEventListener = (e: StorageEvent) => {
      if (Object.values(STORAGE_KEYS).includes(e.key as any)) {
        // Emit custom event for components to listen to
        window.dispatchEvent(new CustomEvent('sessionStorageSync', {
          detail: { key: e.key, newValue: e.newValue, oldValue: e.oldValue }
        }))
      }
    }

    window.addEventListener('storage', this.storageEventListener)
  }

  private async cleanup(): Promise<void> {
    const metadata = this.getStorageMetadata()
    const now = Date.now()
    const daysSinceCleanup = (now - new Date(metadata.lastCleanup).getTime()) / (1000 * 60 * 60 * 24)
    
    if (daysSinceCleanup >= 1) {
      // Perform cleanup
      await this.performEmergencyCleanup()
      
      // Update metadata
      this.updateStorageMetadata({
        ...metadata,
        lastCleanup: new Date().toISOString(),
        totalSize: this.getStorageSize()
      })
    }
  }

  private getStorageMetadata(): StorageMetadata {
    const data = this.getItem<StorageMetadata>('metadata')
    return data || {
      totalSize: 0,
      lastCleanup: new Date().toISOString(),
      itemCounts: {},
      corruptionEvents: 0
    }
  }

  private updateStorageMetadata(metadata: StorageMetadata): void {
    this.setItem('metadata', metadata)
  }

  // Public utility methods
  getStorageStats() {
    return {
      totalSize: this.getStorageSize(),
      maxSize: STORAGE_CONFIG.MAX_STORAGE_SIZE_MB * 1024 * 1024,
      itemCount: localStorage.length,
      metadata: this.getStorageMetadata()
    }
  }

  exportData(): string {
    return this.createBackup()
  }

  importData(data: string): boolean {
    return this.restoreFromBackup(data)
  }

  destroy(): void {
    if (this.storageEventListener) {
      window.removeEventListener('storage', this.storageEventListener)
    }
    this.isInitialized = false
  }
}

export default SessionStorageService