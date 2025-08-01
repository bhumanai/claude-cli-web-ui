import { useState, useEffect } from 'react'
import { AuthTokens, User } from '../types'

export interface LoginCredentials {
  username: string
  password: string
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
  tokens: AuthTokens | null
  loading: boolean
  error: string | null
}

class AuthService {
  private listeners: ((state: AuthState) => void)[] = []
  private currentState: AuthState = {
    isAuthenticated: false,
    user: null,
    tokens: null,
    loading: false,
    error: null
  }

  constructor() {
    this.loadPersistedAuth()
  }

  private loadPersistedAuth(): void {
    try {
      const token = localStorage.getItem('authToken')
      const user = localStorage.getItem('authUser')
      const refreshToken = localStorage.getItem('refreshToken')
      const tokenExpiry = localStorage.getItem('tokenExpiry')

      if (token && user && tokenExpiry) {
        const expiryTime = parseInt(tokenExpiry, 10)
        
        if (Date.now() < expiryTime) {
          this.currentState = {
            isAuthenticated: true,
            user: JSON.parse(user),
            tokens: {
              access_token: token,
              refresh_token: refreshToken || '',
              token_type: 'Bearer',
              expires_in: Math.floor((expiryTime - Date.now()) / 1000)
            },
            loading: false,
            error: null
          }
          
          // Schedule token refresh
          this.scheduleTokenRefresh()
        } else {
          this.clearPersistedAuth()
        }
      }
    } catch (error) {
      console.error('Failed to load persisted auth:', error)
      this.clearPersistedAuth()
    }
  }

  private persistAuth(tokens: AuthTokens, user: User): void {
    const expiryTime = Date.now() + (tokens.expires_in * 1000)
    
    localStorage.setItem('authToken', tokens.access_token)
    localStorage.setItem('refreshToken', tokens.refresh_token)
    localStorage.setItem('authUser', JSON.stringify(user))
    localStorage.setItem('tokenExpiry', expiryTime.toString())
  }

  private clearPersistedAuth(): void {
    localStorage.removeItem('authToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('authUser')
    localStorage.removeItem('tokenExpiry')
  }

  private updateState(updates: Partial<AuthState>): void {
    this.currentState = { ...this.currentState, ...updates }
    this.notifyListeners()
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentState)
      } catch (error) {
        console.error('Error in auth state listener:', error)
      }
    })
  }

  private scheduleTokenRefresh(): void {
    if (!this.currentState.tokens) return

    const refreshTime = (this.currentState.tokens.expires_in - 300) * 1000 // 5 minutes before expiry
    
    setTimeout(() => {
      this.refreshToken().catch(error => {
        console.error('Automatic token refresh failed:', error)
        this.logout()
      })
    }, Math.max(refreshTime, 60000)) // At least 1 minute
  }

  async login(credentials: LoginCredentials): Promise<void> {
    this.updateState({ loading: true, error: null })

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error?.message || 'Login failed')
      }

      const result = await response.json()
      const tokens: AuthTokens = result.data || result

      // Get user info
      const userResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      })

      if (!userResponse.ok) {
        throw new Error('Failed to get user information')
      }

      const userResult = await userResponse.json()
      const user: User = userResult.data || userResult

      // Persist authentication
      this.persistAuth(tokens, user)

      this.updateState({
        isAuthenticated: true,
        user,
        tokens,
        loading: false,
        error: null
      })

      // Schedule token refresh
      this.scheduleTokenRefresh()

    } catch (error) {
      this.updateState({
        loading: false,
        error: error instanceof Error ? error.message : 'Login failed'
      })
      throw error
    }
  }

  async logout(): Promise<void> {
    this.clearPersistedAuth()
    
    this.updateState({
      isAuthenticated: false,
      user: null,
      tokens: null,
      loading: false,
      error: null
    })
  }

  async refreshToken(): Promise<void> {
    if (!this.currentState.tokens?.refresh_token) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: this.currentState.tokens.refresh_token
        })
      })

      if (!response.ok) {
        throw new Error('Token refresh failed')
      }

      const result = await response.json()
      const newTokens: AuthTokens = result.data || result

      // Update stored tokens
      if (this.currentState.user) {
        this.persistAuth(newTokens, this.currentState.user)
      }

      this.updateState({
        tokens: newTokens
      })

      // Schedule next refresh
      this.scheduleTokenRefresh()

    } catch (error) {
      console.error('Token refresh failed:', error)
      this.logout()
      throw error
    }
  }

  // Public API methods
  getState(): AuthState {
    return { ...this.currentState }
  }

  getAccessToken(): string | null {
    return this.currentState.tokens?.access_token || null
  }

  getUser(): User | null {
    return this.currentState.user
  }

  isAuthenticated(): boolean {
    return this.currentState.isAuthenticated
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener)
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  // Check if token is about to expire (within 5 minutes)
  isTokenExpiringSoon(): boolean {
    if (!this.currentState.tokens) return false
    
    const tokenExpiry = localStorage.getItem('tokenExpiry')
    if (!tokenExpiry) return true
    
    const expiryTime = parseInt(tokenExpiry, 10)
    const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000)
    
    return expiryTime < fiveMinutesFromNow
  }

  // Get auth headers for API requests
  getAuthHeaders(): HeadersInit {
    const token = this.getAccessToken()
    if (!token) return {}
    
    return {
      'Authorization': `Bearer ${token}`
    }
  }
}

// Singleton instance
export const authService = new AuthService()

// React hook for using auth state
export function useAuth() {
  const [state, setState] = useState<AuthState>(authService.getState())

  useEffect(() => {
    const unsubscribe = authService.subscribe(setState)
    return unsubscribe
  }, [])

  return {
    ...state,
    login: authService.login.bind(authService),
    logout: authService.logout.bind(authService),
    refreshToken: authService.refreshToken.bind(authService),
    getAccessToken: authService.getAccessToken.bind(authService),
    getAuthHeaders: authService.getAuthHeaders.bind(authService)
  }
}