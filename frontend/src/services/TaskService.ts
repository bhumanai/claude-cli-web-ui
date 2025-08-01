import { 
  Task, 
  Project, 
  TaskCreateRequest, 
  ProjectCreateRequest, 
  AuthTokens, 
  TerragoWorker, 
  QueueStatus, 
  GitHubConnectionRequest, 
  GitHubConnectionResponse, 
  GitHubIssue, 
  CreateTaskFromIssueRequest 
} from '../types'
import { getApiUrl } from '@/config/backend'

const API_BASE_URL = getApiUrl()

class TaskService {
  private baseUrl: string
  private authToken: string | null = null

  constructor() {
    this.baseUrl = API_BASE_URL
    this.loadAuthToken()
  }

  private loadAuthToken(): void {
    this.authToken = localStorage.getItem('authToken')
  }

  private saveAuthToken(token: string): void {
    this.authToken = token
    localStorage.setItem('authToken', token)
  }

  private removeAuthToken(): void {
    this.authToken = null
    localStorage.removeItem('authToken')
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    
    return headers
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 401) {
      this.removeAuthToken()
      throw new Error('Authentication required')
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const errorMessage = errorData?.error?.message || errorData?.message || `HTTP ${response.status}: ${response.statusText}`
      
      // Add specific GitHub API error handling
      if (response.status === 404 && response.url?.includes('/github/')) {
        throw new Error('GitHub resource not found. Please check repository name and permissions.')
      }
      if (response.status === 403 && response.url?.includes('/github/')) {
        throw new Error('GitHub access forbidden. Please check your token permissions.')
      }
      if (response.status === 422 && response.url?.includes('/github/')) {
        throw new Error('Invalid GitHub request. Please check the repository format and data.')
      }
      
      throw new Error(errorMessage)
    }
    
    const result = await response.json()
    return result.data || result
  }

  /**
   * Retry wrapper for GitHub API calls that may fail due to rate limiting
   * @param fn - Function to retry
   * @param maxRetries - Maximum number of retries
   * @param delay - Base delay between retries in ms
   * @returns Promise resolving to function result
   */
  private async retryGitHubCall<T>(
    fn: () => Promise<T>, 
    maxRetries: number = 3, 
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Don't retry on authentication or permission errors
        if (lastError.message.includes('401') || 
            lastError.message.includes('403') || 
            lastError.message.includes('Authentication') ||
            lastError.message.includes('forbidden')) {
          throw lastError
        }
        
        // Only retry on rate limit or server errors
        if (attempt < maxRetries && 
            (lastError.message.includes('rate limit') || 
             lastError.message.includes('500') || 
             lastError.message.includes('502') || 
             lastError.message.includes('503'))) {
          
          // Exponential backoff with jitter
          const backoffDelay = delay * Math.pow(2, attempt - 1) + Math.random() * 1000
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        
        // Don't retry on other errors
        throw lastError
      }
    }
    
    throw lastError!
  }

  // Authentication endpoints
  async login(username: string, password: string): Promise<AuthTokens> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    
    const tokens = await this.handleResponse<AuthTokens>(response)
    this.saveAuthToken(tokens.access_token)
    return tokens
  }

  async logout(): Promise<void> {
    this.removeAuthToken()
  }

  async getCurrentUser(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/auth/me`, {
      headers: this.getHeaders()
    })
    
    return this.handleResponse(response)
  }

  // Task endpoints
  async getTasks(projectId?: string, status?: string, priority?: string): Promise<Task[]> {
    if (!projectId) return []
    
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (priority) params.append('priority', priority)
    
    const url = `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/tasks${params.toString() ? '?' + params.toString() : ''}`
    
    const response = await fetch(url, {
      headers: this.getHeaders()
    })
    
    return this.handleResponse<Task[]>(response)
  }

  async createTask(task: TaskCreateRequest): Promise<Task> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(task.project_id)}/tasks`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(task)
    })
    
    return this.handleResponse<Task>(response)
  }

  async getTaskContent(taskId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/content`, {
      headers: this.getHeaders()
    })
    
    return this.handleResponse<string>(response)
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates)
    })
    
    return this.handleResponse<Task>(response)
  }

  async updateTaskStatus(taskId: string, status: Task['status']): Promise<Task> {
    return this.updateTask(taskId, { status })
  }

  async getTask(taskId: string): Promise<Task> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
      headers: this.getHeaders()
    })
    
    return this.handleResponse<Task>(response)
  }

  async deleteTask(taskId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    })
    
    await this.handleResponse<void>(response)
  }

  // Project endpoints
  async getProjects(): Promise<Project[]> {
    const response = await fetch(`${this.baseUrl}/api/projects`, {
      headers: this.getHeaders()
    })
    
    return this.handleResponse<Project[]>(response)
  }

  async createProject(project: ProjectCreateRequest): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(project)
    })
    
    return this.handleResponse<Project>(response)
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
      headers: this.getHeaders()
    })
    
    return this.handleResponse<Project>(response)
  }

  async getActiveProject(): Promise<Project | null> {
    const activeProjectId = localStorage.getItem('activeProjectId')
    if (!activeProjectId) return null
    
    try {
      return await this.getProject(activeProjectId)
    } catch (error) {
      localStorage.removeItem('activeProjectId')
      return null
    }
  }

  async setActiveProject(projectId: string): Promise<Project> {
    const project = await this.getProject(projectId)
    localStorage.setItem('activeProjectId', projectId)
    return project
  }

  // Placeholder methods for frontend compatibility - these would need backend implementation
  async getQueueStatus(queueId?: string): Promise<QueueStatus> {
    throw new Error('Queue status not supported by current backend API')
  }

  async processQueue(queueId: string): Promise<{ message: string }> {
    throw new Error('Queue processing not supported by current backend API')
  }

  async getQueuedTasks(queueId: string): Promise<Task[]> {
    throw new Error('Queued tasks not supported by current backend API')
  }

  async getWorkers(): Promise<TerragoWorker[]> {
    throw new Error('Workers not supported by current backend API')
  }

  async getWorker(workerId: string): Promise<TerragoWorker> {
    throw new Error('Worker details not supported by current backend API')
  }

  async terminateWorker(workerId: string): Promise<void> {
    throw new Error('Worker termination not supported by current backend API')
  }

  /**
   * Connect a GitHub repository to a project
   * @param connectionData - GitHub connection request data
   * @returns Promise resolving to connection response
   */
  async connectGitHub(connectionData: GitHubConnectionRequest): Promise<GitHubConnectionResponse> {
    return this.retryGitHubCall(async () => {
      const response = await fetch(`${this.baseUrl}/api/github/connect`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(connectionData)
      })
      
      return this.handleResponse<GitHubConnectionResponse>(response)
    })
  }

  /**
   * Get GitHub issues for a repository
   * @param repository - Repository in format "owner/repo"
   * @param projectId - Project ID for context
   * @param options - Query options for filtering issues
   * @returns Promise resolving to array of GitHub issues
   */
  async getGitHubIssues(
    repository: string, 
    projectId?: string,
    options: {
      state?: 'open' | 'closed' | 'all'
      labels?: string[]
      limit?: number
      page?: number
    } = {}
  ): Promise<GitHubIssue[]> {
    const [owner, repo] = repository.split('/')
    if (!owner || !repo) {
      throw new Error('Invalid repository format. Expected "owner/repo"')
    }
    
    return this.retryGitHubCall(async () => {
      const params = new URLSearchParams()
      if (options.state) params.append('state', options.state)
      if (options.labels?.length) params.append('labels', options.labels.join(','))
      if (options.limit) params.append('limit', options.limit.toString())
      if (options.page) params.append('page', options.page.toString())
      if (projectId) params.append('project_id', projectId)
      
      const url = `${this.baseUrl}/api/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues${params.toString() ? '?' + params.toString() : ''}`
      
      const response = await fetch(url, {
        headers: this.getHeaders()
      })
      
      const result = await this.handleResponse<{ issues: GitHubIssue[], total: number, page: number, has_more: boolean }>(response)
      return result.issues
    })
  }

  /**
   * Create a task from a GitHub issue
   * @param requestData - Request data for creating task from issue
   * @returns Promise resolving to created task data
   */
  async createTaskFromGitHubIssue(requestData: CreateTaskFromIssueRequest): Promise<{ task_id: string, github_issue_number: number, created_at: string }> {
    const response = await fetch(`${this.baseUrl}/api/github/issues/${requestData.issue_number}/create-task`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(requestData)
    })
    
    return this.handleResponse<{ task_id: string, github_issue_number: number, created_at: string }>(response)
  }

  /**
   * Get GitHub connection status for a project
   * @param projectId - Project ID
   * @returns Promise resolving to connection info or null if not connected
   */
  async getGitHubConnection(projectId: string): Promise<GitHubConnectionResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/github/connections/${encodeURIComponent(projectId)}`, {
        headers: this.getHeaders()
      })
      
      if (response.status === 404) {
        return null
      }
      
      return this.handleResponse<GitHubConnectionResponse>(response)
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null
      }
      throw error
    }
  }

  /**
   * Disconnect GitHub repository from project
   * @param projectId - Project ID
   * @returns Promise resolving to success message
   */
  async disconnectGitHub(projectId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/api/github/connections/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    })
    
    return this.handleResponse<{ message: string }>(response)
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${this.baseUrl}/api/health`)
    return this.handleResponse(response)
  }

  get isAuthenticated(): boolean {
    return this.authToken !== null
  }
}

export const taskService = new TaskService()