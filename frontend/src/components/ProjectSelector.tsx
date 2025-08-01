import React, { useState, useEffect } from 'react'
import { ChevronDown, Plus, FolderOpen, Check } from 'lucide-react'
import { Project, ProjectCreateRequest } from '../types'
import { taskService } from '../services/TaskService'

interface ProjectSelectorProps {
  onProjectChange?: (project: Project | null) => void
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({ onProjectChange }) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newProject, setNewProject] = useState<ProjectCreateRequest>({ name: '', path: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const projectsList = await taskService.getProjects()
      setProjects(projectsList)
      
      // Try to get active project from localStorage or use first filesystem project
      const savedActiveId = localStorage.getItem('activeProjectId')
      
      // Prefer filesystem projects (claude-cli, agentic-dev) over user-created ones
      const filesystemProjects = projectsList.filter(p => ['claude-cli', 'agentic-dev'].includes(p.id))
      const defaultProject = filesystemProjects.length > 0 ? filesystemProjects[0] : projectsList[0]
      
      if (savedActiveId) {
        const active = projectsList.find(p => p.id === savedActiveId)
        if (active) {
          setActiveProject(active)
          if (onProjectChange) {
            onProjectChange(active)
          }
        } else if (defaultProject) {
          // Saved project not found, use default
          setActiveProject(defaultProject)
          localStorage.setItem('activeProjectId', defaultProject.id)
          if (onProjectChange) {
            onProjectChange(defaultProject)
          }
        }
      } else if (defaultProject) {
        // No saved project, use default
        setActiveProject(defaultProject)
        localStorage.setItem('activeProjectId', defaultProject.id)
        if (onProjectChange) {
          onProjectChange(defaultProject)
        }
      }
    } catch (err) {
      setError('Failed to load projects')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectProject = async (project: Project) => {
    try {
      // For filesystem projects, just save locally and notify parent
      localStorage.setItem('activeProjectId', project.id)
      setActiveProject(project)
      setIsOpen(false)
      if (onProjectChange) {
        onProjectChange(project)
      }
    } catch (err) {
      setError('Failed to set active project')
      console.error(err)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProject.name || !newProject.path) return

    try {
      setLoading(true)
      const created = await taskService.createProject(newProject)
      setProjects([...projects, created])
      setNewProject({ name: '', path: '' })
      setShowCreateForm(false)
      await handleSelectProject(created)
    } catch (err) {
      setError('Failed to create project')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors w-full sm:w-auto"
      >
        <FolderOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {activeProject ? activeProject.name : 'Select GitHub Repository'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {projects.map((project) => {
              const isFilesystemProject = ['claude-cli', 'agentic-dev'].includes(project.id)
              return (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {project.name}
                      </span>
                      {isFilesystemProject && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                          System
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      github.com/{project.name}
                    </div>
                  </div>
                  {activeProject?.id === project.id && (
                    <Check className="w-4 h-4 text-violet-600 dark:text-violet-400 ml-2" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700">
            {!showCreateForm ? (
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Connect GitHub Repository</span>
              </button>
            ) : (
              <form onSubmit={handleCreateProject} className="p-3">
                <input
                  type="text"
                  placeholder="Repository name (e.g., my-project)"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 mb-2"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="GitHub owner/username"
                  value={newProject.path}
                  onChange={(e) => setNewProject({ ...newProject, path: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 mb-2"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading || !newProject.name || !newProject.path}
                    className="flex-1 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false)
                      setNewProject({ name: '', path: '' })
                    }}
                    className="flex-1 px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute mt-2 w-64 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}