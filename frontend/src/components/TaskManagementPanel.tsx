import React, { useState } from 'react'
import { ProjectSelector } from './ProjectSelector'
import { TaskList } from './TaskList'
import { TaskQueue } from './TaskQueue'
import { TaskDetailView } from './TaskDetailView'
import { Project, Task } from '../types'
import { taskService } from '../services/TaskService'

export const TaskManagementPanel: React.FC = () => {
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [updateTrigger, setUpdateTrigger] = useState(0)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const handleUpdate = () => {
    // Trigger updates across components
    setUpdateTrigger(prev => prev + 1)
  }

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task)
  }

  const handleBackToList = () => {
    setSelectedTask(null)
  }

  const handleTaskStatusUpdate = async (taskId: string, status: string) => {
    await taskService.updateTaskStatus(taskId, status)
    handleUpdate()
    // Update the selected task if it's the one being updated
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask({ ...selectedTask, status })
    }
  }

  // Show task detail view if a task is selected
  if (selectedTask) {
    return (
      <TaskDetailView
        task={selectedTask}
        onBack={handleBackToList}
        onStatusUpdate={handleTaskStatusUpdate}
      />
    )
  }

  // Otherwise show the task list view
  return (
    <div className="h-full flex flex-col space-y-4 px-2">
      {/* Header with Project Selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">Task Management</h2>
        <ProjectSelector onProjectChange={setActiveProject} />
      </div>

      {/* Main content area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-4 overflow-hidden">
        {/* Tasks column - takes 2/3 on large screens */}
        <div className="lg:col-span-2 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full">
            <TaskList 
              project={activeProject} 
              onTaskUpdate={handleUpdate}
              onTaskSelect={handleTaskSelect}
              key={updateTrigger}
            />
          </div>
        </div>

        {/* Queue column - takes 1/3 on large screens */}
        <div className="lg:col-span-1">
          <TaskQueue 
            onQueueUpdate={handleUpdate}
            key={updateTrigger}
          />
        </div>
      </div>
    </div>
  )
}