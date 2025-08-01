/**
 * Mock backend service for testing when real backend is unavailable
 */

interface MockCommand {
  id: string
  command: string
  output: string
  status: string
  timestamp: string
}

class MockBackendService {
  private commands: Map<string, MockCommand[]> = new Map()
  
  async executeCommand(sessionId: string, command: string): Promise<MockCommand> {
    const commandId = `cmd_${Date.now()}`
    const mockCommand: MockCommand = {
      id: commandId,
      command,
      output: this.generateMockOutput(command),
      status: 'completed',
      timestamp: new Date().toISOString()
    }
    
    if (!this.commands.has(sessionId)) {
      this.commands.set(sessionId, [])
    }
    this.commands.get(sessionId)!.push(mockCommand)
    
    return mockCommand
  }
  
  async getMessages(sessionId: string, since: number = 0) {
    const commands = this.commands.get(sessionId) || []
    const messages = []
    
    for (const cmd of commands) {
      messages.push({
        type: 'command_update',
        data: {
          id: cmd.id,
          output: cmd.output,
          isPartial: false
        }
      })
      messages.push({
        type: 'command_finished',
        data: {
          id: cmd.id,
          status: cmd.status
        }
      })
    }
    
    return { messages }
  }
  
  private generateMockOutput(command: string): string {
    const mockResponses: Record<string, string> = {
      'help': `Available commands:
  /help         - Show this help message
  /clear        - Clear terminal output
  /status       - Show system status
  /history      - Show command history
  /exit         - Exit the session

This is a mock backend for testing purposes.`,
      'status': `System Status:
  Connection: Mock Mode
  Session: Active
  Commands Executed: ${this.getTotalCommands()}
  Uptime: ${this.getUptime()}`,
      'history': this.getHistory(),
      'clear': 'Terminal cleared',
      'exit': 'Goodbye!'
    }
    
    // Check for exact matches first
    if (mockResponses[command]) {
      return mockResponses[command]
    }
    
    // Check for commands starting with /
    if (command.startsWith('/')) {
      const baseCommand = command.substring(1).split(' ')[0]
      if (mockResponses[baseCommand]) {
        return mockResponses[baseCommand]
      }
    }
    
    // Default response
    return `Mock output for: ${command}
Command executed successfully in mock mode.`
  }
  
  private getTotalCommands(): number {
    let total = 0
    this.commands.forEach(cmds => total += cmds.length)
    return total
  }
  
  private getUptime(): string {
    const uptimeMs = Date.now() - (window as any).mockBackendStartTime || 0
    const seconds = Math.floor(uptimeMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }
  
  private getHistory(): string {
    const allCommands: MockCommand[] = []
    this.commands.forEach(cmds => allCommands.push(...cmds))
    
    if (allCommands.length === 0) {
      return 'No commands in history'
    }
    
    return allCommands
      .map((cmd, idx) => `${idx + 1}. ${cmd.command}`)
      .join('\n')
  }
}

// Initialize mock backend start time
if (typeof window !== 'undefined') {
  (window as any).mockBackendStartTime = Date.now()
}

export const mockBackend = new MockBackendService()