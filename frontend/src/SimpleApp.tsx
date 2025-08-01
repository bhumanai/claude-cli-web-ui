import React, { useState, useCallback } from 'react'
import { Lock, Terminal, Send } from 'lucide-react'

export const SimpleApp: React.FC = () => {
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
    
    try {
      const response = await fetch(`https://backend-27wl4xjka-bhumanais-projects.vercel.app/api/auth/simple-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })
      
      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('claude-cli-auth', data.access_token)
        setIsAuthenticated(true)
        setOutput(['Welcome to Claude CLI! Type a command to get started.'])
      } else {
        setLoginError('Invalid password')
      }
    } catch (error) {
      setLoginError('Connection failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [password])

  const handleCommand = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return

    const newCommand = command.trim()
    setCommand('')
    setOutput(prev => [...prev, `> ${newCommand}`])
    
    try {
      const sessionId = `session_${Date.now()}`
      const response = await fetch(`https://backend-27wl4xjka-bhumanais-projects.vercel.app/api/sessions/${sessionId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('claude-cli-auth')}`,
        },
        body: JSON.stringify({ command: newCommand }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setOutput(prev => [...prev, data.output || 'Command executed'])
      } else {
        setOutput(prev => [...prev, 'Error: Command failed'])
      }
    } catch (error) {
      setOutput(prev => [...prev, 'Error: Connection failed'])
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