import { describe, it, expect } from 'vitest'
import { 
  COMMAND_DEFINITIONS, 
  fuzzySearch, 
  getAllCategories, 
  getCommandsByCategory 
} from '../commandDefinitions'

describe('Command Definitions', () => {
  it('should have at least 50 predefined commands', () => {
    expect(COMMAND_DEFINITIONS.length).toBeGreaterThanOrEqual(50)
  })

  it('should have all required properties for each command', () => {
    COMMAND_DEFINITIONS.forEach(cmd => {
      expect(cmd).toHaveProperty('command')
      expect(cmd).toHaveProperty('description')
      expect(cmd).toHaveProperty('category')
      expect(typeof cmd.command).toBe('string')
      expect(typeof cmd.description).toBe('string')
      expect(typeof cmd.category).toBe('string')
    })
  })

  it('should include common system commands', () => {
    const commandNames = COMMAND_DEFINITIONS.map(cmd => cmd.command)
    
    expect(commandNames).toContain('ls')
    expect(commandNames).toContain('pwd')
    expect(commandNames).toContain('cd')
    expect(commandNames).toContain('/help')
    expect(commandNames).toContain('/status')
    expect(commandNames).toContain('git status')
  })

  it('should have multiple categories', () => {
    const categories = getAllCategories()
    
    expect(categories).toContain('system')
    expect(categories).toContain('filesystem')
    expect(categories).toContain('git')
    expect(categories).toContain('development')
    expect(categories.length).toBeGreaterThan(5)
  })

  describe('fuzzySearch', () => {
    it('should return empty array for empty query', () => {
      const results = fuzzySearch('', COMMAND_DEFINITIONS)
      expect(results).toEqual([])
    })

    it('should find exact matches first', () => {
      const results = fuzzySearch('ls', COMMAND_DEFINITIONS)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].command).toBe('ls')
    })

    it('should find partial matches', () => {
      const results = fuzzySearch('hel', COMMAND_DEFINITIONS)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(cmd => cmd.command === '/help')).toBe(true)
    })

    it('should search in descriptions', () => {
      const results = fuzzySearch('list directory', COMMAND_DEFINITIONS)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(cmd => cmd.command === 'ls')).toBe(true)
    })

    it('should limit results', () => {
      const results = fuzzySearch('git', COMMAND_DEFINITIONS, 3)
      
      expect(results.length).toBeLessThanOrEqual(3)
    })

    it('should handle case insensitive search', () => {
      const results = fuzzySearch('GIT', COMMAND_DEFINITIONS)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(cmd => cmd.command.includes('git'))).toBe(true)
    })
  })

  describe('getCommandsByCategory', () => {
    it('should return commands for valid category', () => {
      const systemCommands = getCommandsByCategory('system')
      
      expect(systemCommands.length).toBeGreaterThan(0)
      systemCommands.forEach(cmd => {
        expect(cmd.category).toBe('system')
      })
    })

    it('should return empty array for invalid category', () => {
      const results = getCommandsByCategory('nonexistent' as any)
      expect(results).toEqual([])
    })

    it('should return git commands', () => {
      const gitCommands = getCommandsByCategory('git')
      
      expect(gitCommands.length).toBeGreaterThan(0)
      expect(gitCommands.some(cmd => cmd.command === 'git status')).toBe(true)
    })
  })

  describe('Command categories', () => {
    it('should have system commands', () => {
      const systemCommands = getCommandsByCategory('system')
      
      expect(systemCommands.some(cmd => cmd.command === '/help')).toBe(true)
      expect(systemCommands.some(cmd => cmd.command === '/status')).toBe(true)
    })

    it('should have filesystem commands', () => {
      const fsCommands = getCommandsByCategory('filesystem')
      
      expect(fsCommands.some(cmd => cmd.command === 'ls')).toBe(true)
      expect(fsCommands.some(cmd => cmd.command === 'pwd')).toBe(true)
      expect(fsCommands.some(cmd => cmd.command === 'cd')).toBe(true)
    })

    it('should have development commands', () => {
      const devCommands = getCommandsByCategory('development')
      
      expect(devCommands.some(cmd => cmd.command === 'npm install')).toBe(true)
      expect(devCommands.some(cmd => cmd.command === 'python')).toBe(true)
    })
  })

  describe('Command properties', () => {
    it('should have commands with aliases', () => {
      const commandsWithAliases = COMMAND_DEFINITIONS.filter(cmd => cmd.aliases && cmd.aliases.length > 0)
      
      expect(commandsWithAliases.length).toBeGreaterThan(0)
    })

    it('should have commands with examples', () => {
      const commandsWithExamples = COMMAND_DEFINITIONS.filter(cmd => cmd.examples && cmd.examples.length > 0)
      
      expect(commandsWithExamples.length).toBeGreaterThan(0)
    })

    it('should have commands with arguments', () => {
      const commandsWithArgs = COMMAND_DEFINITIONS.filter(cmd => cmd.args && cmd.args.length > 0)
      
      expect(commandsWithArgs.length).toBeGreaterThan(0)
    })
  })
})