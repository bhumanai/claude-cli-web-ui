import React, { useState } from 'react'

export const MockApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<string[]>([])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    if (password === 'claude123') {
      setIsAuthenticated(true)
      setOutput(['Welcome to Claude CLI! Type a command to get started.'])
    } else {
      setLoginError('Invalid password')
    }
  }

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return
    
    const newCommand = command.trim()
    setCommand('')
    setOutput(prev => [...prev, `> ${newCommand}`])
    
    // Simulate command processing
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Generate realistic responses
    const responses: Record<string, string> = {
      'help': 'Available commands: help, ls, cd, pwd, echo, clear',
      'ls': 'Documents  Downloads  Desktop  Pictures  Projects',
      'pwd': '/Users/claude',
      'clear': '__CLEAR__'
    }
    
    if (newCommand === 'clear') {
      setOutput([])
    } else {
      const response = responses[newCommand] || `Command executed: ${newCommand}`
      setOutput(prev => [...prev, response])
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ 
          width: '100%', 
          maxWidth: '400px', 
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '20px' }}>Claude CLI</h1>
          <p style={{ marginBottom: '20px', color: '#aaa', fontSize: '14px' }}>
            Enter password to continue
          </p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '8px',
                color: 'white',
                marginBottom: '12px'
              }}
            />
            {loginError && (
              <div style={{
                padding: '10px',
                backgroundColor: '#442222',
                borderRadius: '8px',
                marginBottom: '12px',
                fontSize: '14px'
              }}>
                {loginError}
              </div>
            )}
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                backgroundColor: '#7c3aed',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      color: 'white',
      padding: '20px',
      fontFamily: 'monospace'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '20px' }}>Claude CLI</h1>
      <div style={{
        backgroundColor: '#000',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        height: '400px',
        overflowY: 'auto'
      }}>
        {output.map((line, index) => (
          <div key={index} style={{ marginBottom: '5px' }}>{line}</div>
        ))}
      </div>
      <form onSubmit={handleCommand} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Enter command..."
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: '4px',
            color: 'white',
            fontSize: '14px'
          }}
        />
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            backgroundColor: '#7c3aed',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}