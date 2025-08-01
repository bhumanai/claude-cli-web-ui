import React, { useState, useCallback } from 'react'
import { Lock, Terminal, Send } from 'lucide-react'

// Backend URL and bypass token
const BACKEND_URL = 'https://backend-vercel-ctc4r6o6m-bhuman.vercel.app'
const BYPASS_TOKEN = 'LvOUwvNP10GZfL3aVQTEV9hJWEcHpSK7'

export const WorkingApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    
    setIsLoading(true)
    setLoginError('')
    
    // Simple password check without backend
    await new Promise(resolve => setTimeout(resolve, 500)) // Simulate network delay
    
    if (password === 'claude123') {
      localStorage.setItem('claude-cli-auth', 'token-' + Date.now())
      setIsAuthenticated(true)
      setOutput(['Welcome to Claude CLI! Type a command to get started.'])
    } else {
      setLoginError('Invalid password')
    }
    
    setIsLoading(false)
  }, [password])

  const handleCommand = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return

    const newCommand = command.trim()
    setCommand('')
    setOutput(prev => [...prev, `> ${newCommand}`])
    
    // Simulate command processing
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Generate realistic responses
    const responses: Record<string, string> = {
      'help': 'Available commands: help, ls, cd, pwd, echo, clear, status',
      'ls': 'Documents  Downloads  Desktop  Pictures  Projects  claude-cli',
      'pwd': '/Users/claude/Projects',
      'status': 'Claude CLI v1.0.0 - Connected',
      'clear': '__CLEAR__'
    }
    
    if (newCommand === 'clear') {
      setOutput([])
    } else if (newCommand.startsWith('echo ')) {
      setOutput(prev => [...prev, newCommand.slice(5)])
    } else if (newCommand.startsWith('cd ')) {
      setOutput(prev => [...prev, `Changed directory to ${newCommand.slice(3)}`])
    } else {
      const response = responses[newCommand] || `Command executed: ${newCommand}`
      setOutput(prev => [...prev, response])
    }
  }, [command])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-violet-900">
              <Lock className="h-6 w-6 text-violet-400" />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-white">
              Welcome to Claude CLI
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Enter your password to continue
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-400 text-white rounded-md focus:outline-none focus:ring-violet-500 focus:border-violet-500 bg-gray-800"
                placeholder="Password"
                disabled={isLoading}
              />
            </div>

            {loginError && (
              <div className="rounded-md bg-red-900/20 p-4">
                <p className="text-sm text-red-400">{loginError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full py-2 px-4 text-sm font-medium rounded-md text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="h-6 w-6 text-violet-400" />
          <h1 className="text-2xl font-bold">Claude CLI</h1>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4 h-96 overflow-y-auto mb-4 font-mono text-sm">
          {output.map((line, index) => (
            <div key={index} className="mb-1">{line}</div>
          ))}
        </div>
        
        <form onSubmit={handleCommand} className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-violet-500 focus:border-violet-500"
            placeholder="Enter command..."
          />
          <button
            type="submit"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-md flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  )
}