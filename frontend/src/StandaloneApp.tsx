import React, { useState } from 'react'

// Using localhost backend for now due to Vercel team auth issues
const BACKEND_URL = 'http://localhost:8000'

export const StandaloneApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    
    setIsLoading(true)
    setLoginError('')
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/simple-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })
      
      if (response.ok) {
        setIsAuthenticated(true)
      } else {
        setLoginError('Invalid password')
      }
    } catch (error) {
      setLoginError('Connection failed. Please try again.')
      console.error('Login error:', error)
    } finally {
      setIsLoading(false)
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
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isLoading}
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
              disabled={isLoading || !password.trim()}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                backgroundColor: isLoading || !password.trim() ? '#444' : '#7c3aed',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: isLoading || !password.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? 'Logging in...' : 'Login'}
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
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '20px' }}>Claude CLI</h1>
      <div style={{
        backgroundColor: '#2a2a2a',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        minHeight: '400px'
      }}>
        <p>Welcome! You are now logged in.</p>
        <p style={{ marginTop: '10px', color: '#aaa' }}>
          Backend URL: {BACKEND_URL}
        </p>
      </div>
    </div>
  )
}