import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import SessionStorageService, { 
  DataValidator, 
  StorageMigrator, 
  STORAGE_KEYS,
  STORAGE_VERSION 
} from '../SessionStorageService'
import { CommandHistory } from '../../types'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock window events
Object.defineProperty(window, 'addEventListener', {
  value: vi.fn()
})

Object.defineProperty(window, 'removeEventListener', {
  value: vi.fn()
})

Object.defineProperty(window, 'dispatchEvent', {
  value: vi.fn()
})

describe('SessionStorageService', () => {
  let service: SessionStorageService

  beforeEach(async () => {
    localStorageMock.clear()
    service = SessionStorageService.getInstance()
    await service.initialize()
  })

  afterEach(() => {
    service.destroy()
    localStorageMock.clear()
  })

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newService = SessionStorageService.getInstance()
      await expect(newService.initialize()).resolves.not.toThrow()
    })

    it('should be a singleton', () => {
      const service1 = SessionStorageService.getInstance()
      const service2 = SessionStorageService.getInstance()
      expect(service1).toBe(service2)
    })

    it('should handle storage unavailability', () => {
      // Mock localStorage to throw error
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage not available')
      })

      const newService = SessionStorageService.getInstance()
      expect(newService.initialize()).rejects.toThrow()

      // Restore original method
      localStorage.setItem = originalSetItem
    })
  })

  describe('Session Management', () => {
    it('should create and save session data', () => {
      const sessionData = {
        sessionId: 'test-session',
        lastActivity: new Date().toISOString()
      }

      const result = service.saveSession(sessionData)
      expect(result).toBe(true)

      const retrieved = service.getSession()
      expect(retrieved.sessionId).toBe('test-session')
      expect(retrieved.version).toBe(STORAGE_VERSION)
    })

    it('should generate default session if none exists', () => {
      const session = service.getSession()
      expect(session.sessionId).toBeDefined()
      expect(session.lastActivity).toBeDefined()
      expect(session.version).toBe(STORAGE_VERSION)
      expect(session.created).toBeDefined()
    })

    it('should handle expired sessions', () => {
      const expiredDate = new Date()
      expiredDate.setHours(expiredDate.getHours() - 25) // 25 hours ago

      service.saveSession({
        sessionId: 'expired-session',
        lastActivity: expiredDate.toISOString()
      })

      const session = service.getSession()
      expect(session.sessionId).not.toBe('expired-session')
    })

    it('should clear session data', () => {
      service.saveSession({ sessionId: 'test-session' })
      service.clearSession()
      
      const session = service.getSession()
      expect(session.sessionId).not.toBe('test-session')
    })
  })

  describe('Command History Management', () => {
    const sampleCommands: CommandHistory[] = [
      {
        id: '1',
        command: 'ls -la',
        timestamp: new Date(),
        status: 'completed',
        output: 'file1.txt\nfile2.txt'
      },
      {
        id: '2',
        command: 'pwd',
        timestamp: new Date(),
        status: 'completed',
        output: '/home/user'
      }
    ]

    it('should save and retrieve command history', () => {
      const result = service.saveCommandHistory(sampleCommands)
      expect(result).toBe(true)

      const retrieved = service.getCommandHistory()
      expect(retrieved).toHaveLength(2)
      expect(retrieved[0].command).toBe('ls -la')
    })

    it('should limit command history size', () => {
      const manyCommands = Array.from({ length: 150 }, (_, i) => ({
        id: `${i}`,
        command: `command ${i}`,
        timestamp: new Date(),
        status: 'completed' as const
      }))

      service.saveCommandHistory(manyCommands)
      const retrieved = service.getCommandHistory()
      expect(retrieved.length).toBeLessThanOrEqual(100)
    })

    it('should truncate long output', () => {
      const longOutput = 'x'.repeat(3000)
      const command: CommandHistory = {
        id: '1',
        command: 'echo long',
        timestamp: new Date(),
        status: 'completed',
        output: longOutput
      }

      service.saveCommandHistory([command])
      const retrieved = service.getCommandHistory()
      expect(retrieved[0].output!.length).toBeLessThanOrEqual(2000)
    })

    it('should add single command to history', () => {
      const command: CommandHistory = {
        id: '1',
        command: 'ls',
        timestamp: new Date(),
        status: 'completed'
      }

      const result = service.addCommandToHistory(command)
      expect(result).toBe(true)

      const history = service.getCommandHistory()
      expect(history).toHaveLength(1)
      expect(history[0].command).toBe('ls')
    })
  })

  describe('User Preferences Management', () => {
    it('should save and retrieve preferences', () => {
      const preferences = {
        theme: 'light' as const,
        fontSize: 'large' as const,
        commandSuggestions: false
      }

      const result = service.savePreferences(preferences)
      expect(result).toBe(true)

      const retrieved = service.getPreferences()
      expect(retrieved.theme).toBe('light')
      expect(retrieved.fontSize).toBe('large')
      expect(retrieved.commandSuggestions).toBe(false)
    })

    it('should return defaults for missing preferences', () => {
      const preferences = service.getPreferences()
      expect(preferences.theme).toBe('dark')
      expect(preferences.fontSize).toBe('medium')
      expect(preferences.commandSuggestions).toBe(true)
    })

    it('should handle partial preference updates', () => {
      service.savePreferences({ theme: 'light' })
      const preferences = service.getPreferences()
      expect(preferences.theme).toBe('light')
      expect(preferences.fontSize).toBe('medium') // Should retain default
    })
  })

  describe('View State Management', () => {
    it('should save and retrieve view state', () => {
      const viewState = {
        activeView: 'tasks' as const,
        sidebarCollapsed: true,
        terminalHeight: 500
      }

      const result = service.saveViewState(viewState)
      expect(result).toBe(true)

      const retrieved = service.getViewState()
      expect(retrieved.activeView).toBe('tasks')
      expect(retrieved.sidebarCollapsed).toBe(true)
      expect(retrieved.terminalHeight).toBe(500)
    })

    it('should return defaults for missing view state', () => {
      const viewState = service.getViewState()
      expect(viewState.activeView).toBe('terminal')
      expect(viewState.sidebarCollapsed).toBe(false)
      expect(viewState.terminalHeight).toBe(400)
    })
  })

  describe('Backup and Restore', () => {
    it('should create backup', () => {
      // Setup some data
      service.saveSession({ sessionId: 'test-session' })
      service.saveCommandHistory([{
        id: '1',
        command: 'test',
        timestamp: new Date(),
        status: 'completed'
      }])
      service.savePreferences({ theme: 'light' })

      const backup = service.createBackup()
      expect(backup).toBeDefined()
      
      const parsed = JSON.parse(backup)
      expect(parsed.version).toBe(STORAGE_VERSION)
      expect(parsed.data.session).toBeDefined()
      expect(parsed.data.commandHistory).toBeDefined()
      expect(parsed.data.preferences).toBeDefined()
    })

    it('should restore from backup', () => {
      const backupData = {
        version: STORAGE_VERSION,
        timestamp: new Date().toISOString(),
        data: {
          session: { sessionId: 'restored-session' },
          commandHistory: [{
            id: '1',
            command: 'restored-command',
            timestamp: new Date(),
            status: 'completed'
          }],
          preferences: { theme: 'light' },
          viewState: { activeView: 'tasks' }
        }
      }

      const result = service.restoreFromBackup(JSON.stringify(backupData))
      expect(result).toBe(true)

      const session = service.getSession()
      const history = service.getCommandHistory()
      const preferences = service.getPreferences()
      const viewState = service.getViewState()

      expect(session.sessionId).toBe('restored-session')
      expect(history[0].command).toBe('restored-command')
      expect(preferences.theme).toBe('light')
      expect(viewState.activeView).toBe('tasks')
    })

    it('should handle invalid backup data', () => {
      const result = service.restoreFromBackup('invalid json')
      expect(result).toBe(false)
    })
  })

  describe('Storage Statistics', () => {
    it('should return storage statistics', () => {
      service.saveSession({ sessionId: 'test' })
      service.saveCommandHistory([{
        id: '1',
        command: 'test',
        timestamp: new Date(),
        status: 'completed'
      }])

      const stats = service.getStorageStats()
      expect(stats.totalSize).toBeGreaterThan(0)
      expect(stats.itemCount).toBeGreaterThan(0)
      expect(stats.metadata).toBeDefined()
    })
  })

  describe('Data Export/Import', () => {
    it('should export data', () => {
      service.saveSession({ sessionId: 'export-test' })
      const exportData = service.exportData()
      expect(exportData).toBeDefined()
      
      const parsed = JSON.parse(exportData)
      expect(parsed.data.session.sessionId).toBe('export-test')
    })

    it('should import data', () => {
      const importData = JSON.stringify({
        version: STORAGE_VERSION,
        timestamp: new Date().toISOString(),
        data: {
          session: { sessionId: 'import-test' },
          preferences: { theme: 'light' }
        }
      })

      const result = service.importData(importData)
      expect(result).toBe(true)

      const session = service.getSession()
      expect(session.sessionId).toBe('import-test')
    })
  })
})

describe('DataValidator', () => {
  describe('validateCommandHistory', () => {
    it('should validate correct command history', () => {
      const validHistory: CommandHistory[] = [{
        id: '1',
        command: 'ls',
        timestamp: new Date(),
        status: 'completed'
      }]

      expect(DataValidator.validateCommandHistory(validHistory)).toBe(true)
    })

    it('should reject invalid command history', () => {
      expect(DataValidator.validateCommandHistory(null)).toBe(false)
      expect(DataValidator.validateCommandHistory('not-array')).toBe(false)
      expect(DataValidator.validateCommandHistory([{ invalid: 'object' }])).toBe(false)
    })
  })

  describe('validateUserPreferences', () => {
    it('should validate correct preferences', () => {
      const validPrefs = {
        theme: 'dark',
        fontSize: 'medium',
        commandSuggestions: true,
        autoSave: true
      }

      expect(DataValidator.validateUserPreferences(validPrefs)).toBe(true)
    })

    it('should reject invalid preferences', () => {
      expect(DataValidator.validateUserPreferences(null)).toBe(false)
      expect(DataValidator.validateUserPreferences({})).toBe(false)
      expect(DataValidator.validateUserPreferences('string')).toBe(false)
    })
  })
})

describe('StorageMigrator', () => {
  it('should detect when migration is needed', () => {
    expect(StorageMigrator.shouldMigrate('1.0.0', '1.2.0')).toBe(true)
    expect(StorageMigrator.shouldMigrate('1.2.0', '1.2.0')).toBe(false)
  })

  it('should perform migration', () => {
    const oldData = {
      version: '1.0.0',
      preferences: { theme: 'dark' }
    }

    const migrated = StorageMigrator.migrate(oldData, '1.0.0', '1.2.0')
    expect(migrated.version).toBe('1.2.0')
    expect(migrated.preferences.animationsEnabled).toBe(true)
    expect(migrated.preferences.maxHistoryItems).toBe(100)
  })
})