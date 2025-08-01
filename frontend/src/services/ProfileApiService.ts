/**
 * ProfileApiService - Centralized API service for profile-specific data
 * Provides real data integration for all user profile types
 */

import { getApiUrl } from '@/config/backend'

interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

interface GitApiData {
  status: {
    branch: string
    ahead: number
    behind: number
    staged: string[]
    modified: string[]
    untracked: string[]
  }
  commits: Array<{
    hash: string
    message: string
    author: string
    date: Date
  }>
  branches: string[]
}

interface BuildApiData {
  builds: Array<{
    id: string
    name: string
    status: 'running' | 'success' | 'failed' | 'pending'
    branch: string
    commit: string
    author: string
    duration?: number
    startTime: Date
    logs?: string[]
    progress?: number
  }>
  pipelines: Array<{
    id: string
    name: string
    status: string
    lastRun: Date
  }>
}

interface DataApiData {
  datasets: Array<{
    id: string
    name: string
    source: string
    lastUpdated: Date
    recordCount: number
  }>
  queries: Array<{
    id: string
    name: string
    sql: string
    results: Array<{ label: string; value: number }>
  }>
  charts: Array<{
    id: string
    title: string
    type: 'bar' | 'line' | 'pie'
    data: Array<{ label: string; value: number }>
  }>
}

interface LogApiData {
  logs: Array<{
    id: string
    timestamp: Date
    level: 'error' | 'warn' | 'info' | 'debug'
    source: string
    message: string
    metadata?: Record<string, any>
  }>
  sources: string[]
  stats: {
    total: number
    errors: number
    warnings: number
    info: number
  }
}

interface TutorialApiData {
  tutorials: Array<{
    id: string
    title: string
    description: string
    difficulty: 'beginner' | 'intermediate' | 'advanced'
    estimatedTime: number
    steps: Array<{
      id: string
      title: string
      description: string
      command?: string
      expectedOutput?: string
      tips?: string[]
    }>
  }>
  progress: Record<string, {
    completed: boolean
    lastAccessed: Date
  }>
}

class ProfileApiService {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    // Don't set baseUrl in constructor - get it dynamically
    this.baseUrl = ''
    this.apiKey = import.meta.env.VITE_API_KEY
  }

  private getApiBaseUrl(): string {
    // Always get fresh URL, don't cache
    this.baseUrl = getApiUrl()
    return this.baseUrl
  }

  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers as Record<string, string>
      }

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`
      }

      const response = await fetch(`${this.getApiBaseUrl()}${endpoint}`, {
        ...options,
        headers
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        data,
        error: null,
        success: true
      }
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error)
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }
    }
  }

  // Developer Profile APIs
  async getGitData(): Promise<ApiResponse<GitApiData>> {
    return this.makeRequest<GitApiData>('/api/git/status')
  }

  async getBuildData(): Promise<ApiResponse<BuildApiData>> {
    return this.makeRequest<BuildApiData>('/api/builds')
  }

  async triggerBuild(projectName: string): Promise<ApiResponse<{ buildId: string }>> {
    return this.makeRequest<{ buildId: string }>('/api/builds/trigger', {
      method: 'POST',
      body: JSON.stringify({ project: projectName })
    })
  }

  async executeGitCommand(command: string): Promise<ApiResponse<{ output: string }>> {
    return this.makeRequest<{ output: string }>('/api/git/execute', {
      method: 'POST',
      body: JSON.stringify({ command })
    })
  }

  // Data Analyst Profile APIs
  async getDatasets(): Promise<ApiResponse<DataApiData>> {
    return this.makeRequest<DataApiData>('/api/data/datasets')
  }

  async executeQuery(sql: string): Promise<ApiResponse<{ results: any[] }>> {
    return this.makeRequest<{ results: any[] }>('/api/data/query', {
      method: 'POST',
      body: JSON.stringify({ sql })
    })
  }

  async exportData(datasetId: string, format: 'csv' | 'json'): Promise<ApiResponse<{ url: string }>> {
    return this.makeRequest<{ url: string }>(`/api/data/export/${datasetId}?format=${format}`)
  }

  async getChartData(chartId: string): Promise<ApiResponse<{ data: any[] }>> {
    return this.makeRequest<{ data: any[] }>(`/api/data/charts/${chartId}`)
  }

  // DevOps Profile APIs
  async getLogs(filters?: {
    level?: string
    source?: string
    limit?: number
    since?: Date
  }): Promise<ApiResponse<LogApiData>> {
    const params = new URLSearchParams()
    if (filters?.level) params.set('level', filters.level)
    if (filters?.source) params.set('source', filters.source)
    if (filters?.limit) params.set('limit', filters.limit.toString())
    if (filters?.since) params.set('since', filters.since.toISOString())

    const queryString = params.toString()
    return this.makeRequest<LogApiData>(`/api/logs${queryString ? `?${queryString}` : ''}`)
  }

  async getSystemMetrics(): Promise<ApiResponse<{
    cpu: number
    memory: number
    disk: number
    network: { in: number; out: number }
  }>> {
    return this.makeRequest('/api/system/metrics')
  }

  async getServiceHealth(): Promise<ApiResponse<{
    services: Array<{
      name: string
      status: 'healthy' | 'unhealthy' | 'degraded'
      uptime: number
      lastCheck: Date
    }>
  }>> {
    return this.makeRequest('/api/system/health')
  }

  // General User Profile APIs
  async getTutorials(): Promise<ApiResponse<TutorialApiData>> {
    return this.makeRequest<TutorialApiData>('/api/tutorials')
  }

  async updateTutorialProgress(
    tutorialId: string, 
    stepId: string, 
    completed: boolean
  ): Promise<ApiResponse<{ success: boolean }>> {
    return this.makeRequest<{ success: boolean }>('/api/tutorials/progress', {
      method: 'POST',
      body: JSON.stringify({ tutorialId, stepId, completed })
    })
  }

  async getCommandTemplates(): Promise<ApiResponse<{
    templates: Array<{
      id: string
      name: string
      command: string
      description: string
      category: string
    }>
  }>> {
    return this.makeRequest('/api/commands/templates')
  }

  // Common APIs for all profiles
  async executeCommand(command: string, profile?: string): Promise<ApiResponse<{
    output: string
    exitCode: number
    duration: number
  }>> {
    return this.makeRequest<{
      output: string
      exitCode: number
      duration: number
    }>('/api/commands/execute', {
      method: 'POST',
      body: JSON.stringify({ command, profile })
    })
  }

  async getCommandHistory(limit = 50): Promise<ApiResponse<{
    commands: Array<{
      id: string
      command: string
      timestamp: Date
      output: string
      exitCode: number
    }>
  }>> {
    return this.makeRequest(`/api/commands/history?limit=${limit}`)
  }

  async saveUserPreferences(preferences: Record<string, any>): Promise<ApiResponse<{ success: boolean }>> {
    return this.makeRequest<{ success: boolean }>('/api/user/preferences', {
      method: 'POST',
      body: JSON.stringify(preferences)
    })
  }

  async getUserPreferences(): Promise<ApiResponse<Record<string, any>>> {
    return this.makeRequest<Record<string, any>>('/api/user/preferences')
  }

  // Health check for API availability
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest<{ status: string }>('/api/health')
      return response.success && response.data?.status === 'ok'
    } catch {
      return false
    }
  }

  // Real-time WebSocket connection for streaming data
  connectWebSocket(onMessage: (data: any) => void, onError?: (error: Error) => void): WebSocket | null {
    try {
      const wsUrl = this.getApiBaseUrl().replace(/^https?:\/\//, 'ws://').replace(/^http:\/\//, 'ws://')
      const ws = new WebSocket(`${wsUrl}/api/ws`)

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onerror = (event) => {
        const error = new Error('WebSocket connection error')
        console.error('WebSocket error:', event)
        onError?.(error)
      }

      return ws
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      onError?.(new Error('Failed to create WebSocket connection'))
      return null
    }
  }
}

// Export singleton instance
export const profileApiService = new ProfileApiService()
export type { GitApiData, BuildApiData, DataApiData, LogApiData, TutorialApiData }