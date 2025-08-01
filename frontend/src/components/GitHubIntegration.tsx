import { useState, useEffect, useCallback } from 'react'
import { GitHubIssue, Task, GitHubConnectionRequest, GitHubConnectionResponse, CreateTaskFromIssueRequest } from '../types'
import { taskService } from '../services/TaskService'
import { 
  Github, 
  ExternalLink, 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  GitBranch,
  User,
  Tag,
  Plus,
  RefreshCw,
  Settings,
  Link
} from 'lucide-react'

interface GitHubIntegrationProps {
  projectId?: string
  className?: string
}

interface GitHubConnection {
  connected: boolean
  repository: string | null
  username: string | null
  lastSync: Date | null
}

export function GitHubIntegration({ projectId, className = '' }: GitHubIntegrationProps) {
  const [connection, setConnection] = useState<GitHubConnection>({
    connected: false,
    repository: null,
    username: null,
    lastSync: null
  })
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [connectionForm, setConnectionForm] = useState({
    token: '',
    repository: ''
  })
  const [selectedTab, setSelectedTab] = useState<'issues' | 'tasks' | 'sync'>('issues')

  // Load connection status and data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Load connection status from localStorage (in real app, this would come from backend)
      const savedConnection = localStorage.getItem('githubConnection')
      if (savedConnection) {
        const conn = JSON.parse(savedConnection)
        setConnection(conn)
        
        if (conn.connected && conn.repository) {
          // Load issues and tasks using the new API structure
          const [issuesData, tasksData] = await Promise.all([
            taskService.getGitHubIssues(conn.repository, projectId),
            taskService.getTasks(projectId)
          ])
          
          setIssues(issuesData)
          setTasks(tasksData.filter(t => t.github_issue_number))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GitHub data')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Connect to GitHub
  const handleConnect = async () => {
    if (!connectionForm.token || !connectionForm.repository) {
      setError('Please provide both token and repository')
      return
    }

    if (!projectId) {
      setError('Project ID is required to connect GitHub repository')
      return
    }

    // Validate repository format
    const repoPattern = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/
    if (!repoPattern.test(connectionForm.repository)) {
      setError('Repository format should be: owner/repository (e.g., microsoft/typescript)')
      return
    }

    // Validate token format (GitHub PATs start with ghp_, gho_, etc.)
    if (!connectionForm.token.startsWith('gh')) {
      setError('Invalid GitHub token format. Please use a valid Personal Access Token.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use the new backend API structure
      const connectionData = await taskService.connectGitHub({
        token: connectionForm.token,
        repository: connectionForm.repository,
        project_id: projectId
      })
      
      const newConnection: GitHubConnection = {
        connected: true,
        repository: connectionData.repository,
        username: connectionData.username,
        lastSync: new Date(connectionData.connected_at)
      }
      
      setConnection(newConnection)
      localStorage.setItem('githubConnection', JSON.stringify(newConnection))
      setShowConnectionModal(false)
      setConnectionForm({ token: '', repository: '' })
      
      // Reload data
      await loadData()
      
    } catch (err) {
      // Better error handling for specific GitHub issues
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to GitHub'
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')) {
        setError('Repository not found. Please check the repository name and your access permissions.')
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        setError('Invalid GitHub token or insufficient permissions. Please check your personal access token.')
      } else if (errorMessage.includes('rate limit')) {
        setError('GitHub API rate limit exceeded. Please try again later.')
      } else {
        setError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  // Disconnect from GitHub
  const handleDisconnect = () => {
    setConnection({
      connected: false,
      repository: null,
      username: null,
      lastSync: null
    })
    localStorage.removeItem('githubConnection')
    setIssues([])
    setTasks([])
  }

  // Create task from issue
  const handleCreateTaskFromIssue = async (issue: GitHubIssue) => {
    if (!projectId) {
      setError('Project ID is required to create tasks')
      return
    }

    try {
      // Use the new GitHub integration API for creating tasks from issues
      const taskData = await taskService.createTaskFromGitHubIssue({
        issue_number: issue.number,
        project_id: projectId,
        repository: connection.repository,
        priority: issue.labels.includes('high') ? 'high' as const : 
                 issue.labels.includes('low') ? 'low' as const : 'medium' as const,
        additional_tags: [] // Can be extended later
      })

      // Refresh the tasks list to show the new task
      const updatedTasks = await taskService.getTasks(projectId)
      setTasks(updatedTasks.filter(t => t.github_issue_number))
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create task from issue'
      if (errorMessage.includes('already exists') || errorMessage.includes('conflict')) {
        setError(`A task for issue #${issue.number} already exists.`)
      } else {
        setError(errorMessage)
      }
    }
  }

  // Sync tasks with GitHub issues
  const handleSync = async () => {
    if (!connection.repository) return

    setLoading(true)
    try {
      const [freshIssues, freshTasks] = await Promise.all([
        taskService.getGitHubIssues(connection.repository, projectId),
        taskService.getTasks(projectId)
      ])
      
      setIssues(freshIssues)
      setTasks(freshTasks.filter(t => t.github_issue_number))
      
      setConnection(prev => ({ ...prev, lastSync: new Date() }))
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync with GitHub')
    } finally {
      setLoading(false)
    }
  }

  const getIssueStatusColor = (state: string) => {
    return state === 'open' ? 'text-green-600' : 'text-purple-600'
  }

  const getTaskForIssue = (issueNumber: number) => {
    return tasks.find(t => t.github_issue_number === issueNumber)
  }

  if (loading && !connection.connected) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Github className="w-6 h-6" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            GitHub Integration
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          {connection.connected && (
            <button
              onClick={handleSync}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
              title="Sync with GitHub"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          
          <button
            onClick={() => setShowConnectionModal(true)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Connection Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connection.connected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {connection.connected ? 'Connected' : 'Not Connected'}
              </h3>
              {connection.connected && connection.repository && (
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {connection.repository}
                  </span>
                  {connection.lastSync && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last sync: {connection.lastSync.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {connection.connected ? (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => setShowConnectionModal(true)}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {connection.connected && (
        <>
          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8">
              {[
                { id: 'issues', label: 'Issues', count: issues.length },
                { id: 'tasks', label: 'Linked Tasks', count: tasks.length },
                { id: 'sync', label: 'Sync Status', count: null }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id as any)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    selectedTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {selectedTab === 'issues' && (
              <div>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    GitHub Issues ({issues.length})
                  </h3>
                </div>
                
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {issues.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      No issues found in the repository
                    </div>
                  ) : (
                    issues.map(issue => {
                      const linkedTask = getTaskForIssue(issue.number)
                      
                      return (
                        <div key={issue.number} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                  {issue.title}
                                </h4>
                                <span className={`text-sm font-medium ${getIssueStatusColor(issue.state)}`}>
                                  #{issue.number}
                                </span>
                                {issue.state === 'open' ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Open
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    Closed
                                  </span>
                                )}
                              </div>
                              
                              {issue.body && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                                  {issue.body.substring(0, 200)}...
                                </p>
                              )}
                              
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>Created: {new Date(issue.created_at).toLocaleDateString()}</span>
                                <span>Updated: {new Date(issue.updated_at).toLocaleDateString()}</span>
                                {issue.assignees.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {issue.assignees.join(', ')}
                                  </span>
                                )}
                              </div>
                              
                              {issue.labels.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {issue.labels.map(label => (
                                    <span
                                      key={label}
                                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                                    >
                                      <Tag className="w-3 h-3 mr-1" />
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 ml-4">
                              <a
                                href={`https://github.com/${connection.repository}/issues/${issue.number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-gray-400 hover:text-gray-600"
                                title="View on GitHub"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                              
                              {linkedTask ? (
                                <div className="flex items-center gap-1 text-sm text-green-600">
                                  <Link className="w-4 h-4" />
                                  Linked
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleCreateTaskFromIssue(issue)}
                                  className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1"
                                  title="Create Task"
                                >
                                  <Plus className="w-3 h-3" />
                                  Create Task
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {selectedTab === 'tasks' && (
              <div>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Linked Tasks ({tasks.length})
                  </h3>
                </div>
                
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {tasks.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      No tasks linked to GitHub issues
                    </div>
                  ) : (
                    tasks.map(task => {
                      const issue = issues.find(i => i.number === task.github_issue_number)
                      
                      return (
                        <div key={task.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                  {task.name}
                                </h4>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  task.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  task.status === 'running' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {task.status}
                                </span>
                              </div>
                              
                              {task.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                  {task.description}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>Created: {new Date(task.created_at).toLocaleDateString()}</span>
                                {task.github_issue_number && (
                                  <span className="flex items-center gap-1">
                                    <Github className="w-3 h-3" />
                                    Issue #{task.github_issue_number}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 ml-4">
                              {issue && (
                                <a
                                  href={`https://github.com/${connection.repository}/issues/${issue.number}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-gray-400 hover:text-gray-600"
                                  title="View GitHub Issue"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {selectedTab === 'sync' && (
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Synchronization Status
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-5 h-5 text-blue-600" />
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">Issues</h4>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{issues.length}</div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">Total issues</div>
                  </div>
                  
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <h4 className="font-medium text-green-900 dark:text-green-100">Linked</h4>
                    </div>
                    <div className="text-2xl font-bold text-green-600">{tasks.length}</div>
                    <div className="text-sm text-green-700 dark:text-green-300">Tasks linked</div>
                  </div>
                  
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-5 h-5 text-yellow-600" />
                      <h4 className="font-medium text-yellow-900 dark:text-yellow-100">Last Sync</h4>
                    </div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">
                      {connection.lastSync ? connection.lastSync.toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={handleSync}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Connection Modal */}
      {showConnectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Connect to GitHub
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Personal Access Token
                </label>
                <input
                  type="password"
                  value={connectionForm.token}
                  onChange={(e) => setConnectionForm(prev => ({ ...prev, token: e.target.value }))}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Create a token at github.com/settings/tokens
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Repository
                </label>
                <input
                  type="text"
                  value={connectionForm.repository}
                  onChange={(e) => setConnectionForm(prev => ({ ...prev, repository: e.target.value }))}
                  placeholder="owner/repository"
                  pattern="^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$"
                  title="Format should be: owner/repository"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Example: microsoft/typescript or facebook/react
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowConnectionModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={loading || !connectionForm.token || !connectionForm.repository}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}