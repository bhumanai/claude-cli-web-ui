# Claude CLI Web UI - API Documentation

## Overview

This document provides comprehensive API documentation for the Claude CLI Web UI backend. The API is built with FastAPI and provides 36 REST endpoints plus WebSocket support for real-time functionality.

## Base Information

- **Base URL**: `http://localhost:8000/api`
- **WebSocket URL**: `ws://localhost:8000/ws/{session_id}`
- **API Version**: v1
- **Authentication**: JWT Bearer tokens
- **Content Type**: `application/json`
- **Interactive Documentation**: `http://localhost:8000/docs` (Swagger UI)
- **OpenAPI Spec**: `http://localhost:8000/openapi.json`

## Authentication

### Overview
The API uses JWT (JSON Web Token) authentication. All protected endpoints require a valid token in the Authorization header.

### Authentication Flow

#### 1. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

**Response:**
```json
{
  "data": {
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "uuid",
      "username": "your_username",
      "email": "user@example.com"
    }
  },
  "error": null
}
```

#### 2. Using Authentication Token
```http
GET /api/tasks/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

#### 3. Refresh Token
```http
POST /api/auth/refresh
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

**Response:**
```json
{
  "data": {
    "access_token": "new_token_here",
    "expires_in": 3600
  },
  "error": null
}
```

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "data": {
    // Response data here
  },
  "error": null,
  "meta": {
    "timestamp": "2025-07-30T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

### Error Response
```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "title",
      "issue": "Field is required"
    }
  },
  "meta": {
    "timestamp": "2025-07-30T12:00:00Z",
    "request_id": "uuid"
  }
}
```

### Pagination Response
```json
{
  "data": {
    "items": [...],
    "total": 150,
    "page": 1,
    "page_size": 50,
    "pages": 3,
    "has_next": true,
    "has_previous": false
  },
  "error": null
}
```

## Health & System Endpoints

### Health Check
Get basic health status of the application.

```http
GET /api/health/
```

**Response:**
```json
{
  "data": {
    "status": "healthy",
    "timestamp": "2025-07-30T12:00:00Z",
    "uptime": 3600,
    "version": "1.0.0"
  },
  "error": null
}
```

### Detailed Health Check
Get comprehensive system health information.

```http
GET /api/health/detailed
```

**Response:**
```json
{
  "data": {
    "status": "healthy",
    "timestamp": "2025-07-30T12:00:00Z",
    "checks": {
      "database": {
        "status": "healthy",
        "response_time": 15.5,
        "connections": {
          "active": 5,
          "idle": 15,
          "total": 20
        }
      },
      "redis": {
        "status": "healthy",
        "memory_usage": "45.2MB",
        "connected_clients": 8
      },
      "websocket": {
        "status": "healthy",
        "active_connections": 25,
        "avg_latency": 45.2
      }
    },
    "metrics": {
      "requests_per_minute": 125,
      "average_response_time": 250.5,
      "error_rate": 0.02
    }
  },
  "error": null
}
```

### System Information
Get system information and configuration.

```http
GET /api/system/info
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "version": "1.0.0",
    "environment": "production",
    "features": {
      "websocket_enabled": true,
      "redis_enabled": true,
      "monitoring_enabled": true
    },
    "limits": {
      "max_tasks_per_project": 1000,
      "max_concurrent_tasks": 10,
      "max_file_size": "10MB"
    }
  },
  "error": null
}
```

## Task Management Endpoints

### Create Task
Create a new task in a project.

```http
POST /api/tasks/
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication to the API",
  "project_id": "project-uuid",
  "priority": 1,
  "estimated_duration": "02:30:00",
  "assigned_to": "user-uuid",
  "tags": ["authentication", "security"],
  "metadata": {
    "component": "backend",
    "complexity": "medium"
  }
}
```

**Response:**
```json
{
  "data": {
    "id": "task-uuid",
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication to the API",
    "project_id": "project-uuid",
    "status": "pending",
    "priority": 1,
    "progress_percentage": 0,
    "estimated_duration": "02:30:00",
    "actual_duration": null,
    "assigned_to": "user-uuid",
    "created_by": "user-uuid",
    "created_at": "2025-07-30T12:00:00Z",
    "updated_at": "2025-07-30T12:00:00Z",
    "started_at": null,
    "completed_at": null,
    "tags": ["authentication", "security"],
    "metadata": {
      "component": "backend",
      "complexity": "medium"
    }
  },
  "error": null
}
```

### List Tasks
Get a paginated list of tasks with optional filtering.

```http
GET /api/tasks/?project_id=uuid&status=pending&assigned_to=uuid&page=1&page_size=50
Authorization: Bearer <token>
```

**Query Parameters:**
- `project_id` (optional): Filter by project ID
- `status` (optional): Filter by status (`pending`, `running`, `completed`, `failed`, `cancelled`)
- `assigned_to` (optional): Filter by assigned user
- `priority` (optional): Filter by minimum priority level
- `tags` (optional): Filter by tags (comma-separated)
- `search` (optional): Search in title and description
- `sort` (optional): Sort field (`created_at`, `updated_at`, `priority`, `title`)
- `order` (optional): Sort order (`asc`, `desc`)
- `page` (optional): Page number (default: 1)
- `page_size` (optional): Items per page (default: 50, max: 100)

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": "task-uuid",
        "title": "Implement user authentication",
        "status": "pending",
        "priority": 1,
        "progress_percentage": 0,
        "assigned_to": "user-uuid",
        "created_at": "2025-07-30T12:00:00Z",
        "updated_at": "2025-07-30T12:00:00Z"
      }
    ],
    "total": 25,
    "page": 1,
    "page_size": 50,
    "pages": 1,
    "has_next": false,
    "has_previous": false
  },
  "error": null
}
```

### Get Task Details
Get detailed information about a specific task.

```http
GET /api/tasks/{task_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "id": "task-uuid",
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication to the API",
    "project_id": "project-uuid",
    "status": "running",
    "priority": 1,
    "progress_percentage": 45,
    "estimated_duration": "02:30:00",
    "actual_duration": "01:15:30",
    "assigned_to": "user-uuid",
    "created_by": "user-uuid",
    "created_at": "2025-07-30T12:00:00Z",
    "updated_at": "2025-07-30T13:30:00Z",
    "started_at": "2025-07-30T12:15:00Z",
    "completed_at": null,
    "tags": ["authentication", "security"],
    "metadata": {
      "component": "backend",
      "complexity": "medium"
    },
    "dependencies": [
      {
        "id": "dep-uuid",
        "depends_on_task_id": "other-task-uuid",
        "dependency_type": "blocks",
        "task": {
          "title": "Setup database schema",
          "status": "completed"
        }
      }
    ],
    "history": [
      {
        "timestamp": "2025-07-30T12:15:00Z",
        "action": "status_changed",
        "old_value": "pending",
        "new_value": "running",
        "user_id": "user-uuid"
      }
    ]
  },
  "error": null
}
```

### Update Task
Update an existing task.

```http
PUT /api/tasks/{task_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Implement user authentication (Updated)",
  "status": "running",
  "progress_percentage": 75,
  "assigned_to": "different-user-uuid",
  "metadata": {
    "component": "backend",
    "complexity": "high",
    "notes": "Increased complexity due to additional requirements"
  }
}
```

**Response:**
```json
{
  "data": {
    "id": "task-uuid",
    "title": "Implement user authentication (Updated)",
    "status": "running",
    "progress_percentage": 75,
    "updated_at": "2025-07-30T14:00:00Z"
    // ... other fields
  },
  "error": null
}
```

### Delete Task
Delete a task (soft delete with audit trail).

```http
DELETE /api/tasks/{task_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "message": "Task deleted successfully",
    "deleted_at": "2025-07-30T14:00:00Z"
  },
  "error": null
}
```

### Bulk Task Operations
Perform operations on multiple tasks at once.

```http
POST /api/tasks/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "operation": "update_status",
  "task_ids": ["task-uuid-1", "task-uuid-2", "task-uuid-3"],
  "data": {
    "status": "completed",
    "progress_percentage": 100
  }
}
```

**Available Operations:**
- `update_status`: Update status of multiple tasks
- `assign`: Assign multiple tasks to a user
- `add_tags`: Add tags to multiple tasks
- `remove_tags`: Remove tags from multiple tasks
- `delete`: Delete multiple tasks
- `set_priority`: Set priority for multiple tasks

**Response:**
```json
{
  "data": {
    "operation": "update_status",
    "affected_count": 3,
    "successful": ["task-uuid-1", "task-uuid-2", "task-uuid-3"],
    "failed": [],
    "errors": []
  },
  "error": null
}
```

### Task History
Get the history of changes for a task.

```http
GET /api/tasks/{task_id}/history
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "task_id": "task-uuid",
    "history": [
      {
        "id": "history-uuid",
        "timestamp": "2025-07-30T12:15:00Z",
        "action": "created",
        "user_id": "user-uuid",
        "user_name": "John Doe",
        "details": {
          "initial_data": {
            "title": "Implement user authentication",
            "status": "pending"
          }
        }
      },
      {
        "id": "history-uuid-2",
        "timestamp": "2025-07-30T13:00:00Z",
        "action": "status_changed",
        "user_id": "user-uuid",
        "user_name": "John Doe",
        "details": {
          "old_value": "pending",
          "new_value": "running"
        }
      }
    ]
  },
  "error": null
}
```

### Execute Task
Execute a task (add to queue for processing).

```http
POST /api/tasks/{task_id}/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "priority": "high",
  "options": {
    "timeout": 3600,
    "retry_attempts": 3
  }
}
```

**Response:**
```json
{
  "data": {
    "task_id": "task-uuid",
    "execution_id": "execution-uuid",
    "status": "queued",
    "queue_position": 3,
    "estimated_start_time": "2025-07-30T14:15:00Z"
  },
  "error": null
}
```

### Cancel Task
Cancel a running or queued task.

```http
POST /api/tasks/{task_id}/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Requirements changed"
}
```

**Response:**
```json
{
  "data": {
    "task_id": "task-uuid",
    "status": "cancelled",
    "cancelled_at": "2025-07-30T14:00:00Z",
    "reason": "Requirements changed"
  },
  "error": null
}
```

### Retry Failed Task
Retry a failed task.

```http
POST /api/tasks/{task_id}/retry
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "task_id": "task-uuid",
    "execution_id": "new-execution-uuid",
    "status": "queued",
    "retry_attempt": 2
  },
  "error": null
}
```

## Project Management Endpoints

### Create Project
Create a new project.

```http
POST /api/projects/
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "E-commerce Platform",
  "description": "Full-stack e-commerce platform with React and FastAPI",
  "settings": {
    "theme": "dark",
    "notifications": true,
    "auto_assign": false
  },
  "resource_limits": {
    "max_tasks": 500,
    "max_concurrent_tasks": 5,
    "storage_limit": "1GB"
  }
}
```

**Response:**
```json
{
  "data": {
    "id": "project-uuid",
    "name": "E-commerce Platform",
    "description": "Full-stack e-commerce platform with React and FastAPI",
    "status": "active",
    "created_by": "user-uuid",
    "created_at": "2025-07-30T12:00:00Z",
    "updated_at": "2025-07-30T12:00:00Z",
    "settings": {
      "theme": "dark",
      "notifications": true,
      "auto_assign": false
    },
    "resource_limits": {
      "max_tasks": 500,
      "max_concurrent_tasks": 5,
      "storage_limit": "1GB"
    },
    "statistics": {
      "total_tasks": 0,
      "completed_tasks": 0,
      "pending_tasks": 0,
      "running_tasks": 0
    }
  },
  "error": null
}
```

### List Projects
Get a list of projects with filtering and pagination.

```http
GET /api/projects/?status=active&created_by=uuid&page=1&page_size=20
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `archived`, `completed`)
- `created_by` (optional): Filter by creator
- `search` (optional): Search in name and description
- `sort` (optional): Sort field (`name`, `created_at`, `updated_at`)
- `order` (optional): Sort order (`asc`, `desc`)
- `page` (optional): Page number
- `page_size` (optional): Items per page

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": "project-uuid",
        "name": "E-commerce Platform",
        "description": "Full-stack e-commerce platform...",
        "status": "active",
        "created_by": "user-uuid",
        "created_at": "2025-07-30T12:00:00Z",
        "statistics": {
          "total_tasks": 25,
          "completed_tasks": 15,
          "pending_tasks": 8,
          "running_tasks": 2
        }
      }
    ],
    "total": 5,
    "page": 1,
    "page_size": 20,
    "pages": 1
  },
  "error": null
}
```

### Get Project Details
Get detailed information about a project.

```http
GET /api/projects/{project_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "id": "project-uuid",
    "name": "E-commerce Platform",
    "description": "Full-stack e-commerce platform with React and FastAPI",
    "status": "active",
    "created_by": "user-uuid",
    "created_at": "2025-07-30T12:00:00Z",
    "updated_at": "2025-07-30T12:00:00Z",
    "settings": {
      "theme": "dark",
      "notifications": true,
      "auto_assign": false
    },
    "resource_limits": {
      "max_tasks": 500,
      "max_concurrent_tasks": 5,
      "storage_limit": "1GB"
    },
    "statistics": {
      "total_tasks": 25,
      "completed_tasks": 15,
      "pending_tasks": 8,
      "running_tasks": 2,
      "failed_tasks": 0,
      "completion_rate": 0.6,
      "average_task_duration": "01:45:30"
    },
    "recent_activity": [
      {
        "timestamp": "2025-07-30T13:45:00Z",
        "action": "task_completed",
        "task_title": "Setup user authentication",
        "user_name": "John Doe"
      }
    ]
  },
  "error": null
}
```

### Update Project
Update an existing project.

```http
PUT /api/projects/{project_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "E-commerce Platform v2",
  "description": "Updated description",
  "status": "active",
  "settings": {
    "theme": "light",
    "notifications": false
  }
}
```

### Delete Project
Delete a project (soft delete).

```http
DELETE /api/projects/{project_id}
Authorization: Bearer <token>
```

### Get Project Tasks
Get all tasks for a specific project.

```http
GET /api/projects/{project_id}/tasks?status=pending&page=1&page_size=50
Authorization: Bearer <token>
```

### Clone Project
Create a copy of an existing project.

```http
POST /api/projects/{project_id}/clone
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "E-commerce Platform Copy",
  "include_tasks": false,
  "include_settings": true
}
```

### Project Analytics
Get detailed analytics for a project.

```http
GET /api/projects/{project_id}/analytics?period=30d
Authorization: Bearer <token>
```

**Query Parameters:**
- `period` (optional): Analytics period (`7d`, `30d`, `90d`, `1y`)

**Response:**
```json
{
  "data": {
    "project_id": "project-uuid",
    "period": "30d",
    "summary": {
      "total_tasks": 125,
      "completed_tasks": 98,
      "average_completion_time": "02:15:30",
      "productivity_score": 0.85
    },
    "task_trends": {
      "created_per_day": [5, 8, 3, 12, 6, 9, 4],
      "completed_per_day": [3, 6, 4, 10, 8, 7, 5]
    },
    "performance_metrics": {
      "average_task_duration": "02:15:30",
      "median_task_duration": "01:45:00",
      "completion_rate": 0.784,
      "on_time_completion_rate": 0.692
    },
    "team_performance": [
      {
        "user_id": "user-uuid",
        "user_name": "John Doe",
        "tasks_completed": 25,
        "average_duration": "01:55:00",
        "completion_rate": 0.89
      }
    ]
  },
  "error": null
}
```

## Command Execution Endpoints

### Execute Command
Execute a system command through the Claude CLI.

```http
POST /api/commands/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "ls -la",
  "working_directory": "/path/to/directory",
  "timeout": 30,
  "environment": {
    "NODE_ENV": "development"
  },
  "stream_output": true
}
```

**Response (Streaming):**
```json
{
  "data": {
    "command_id": "command-uuid",
    "status": "running",
    "pid": 12345,
    "started_at": "2025-07-30T14:00:00Z"
  },
  "error": null
}
```

### Get Command Status
Check the status of a running command.

```http
GET /api/commands/{command_id}/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "command_id": "command-uuid",
    "command": "ls -la",
    "status": "running",
    "pid": 12345,
    "started_at": "2025-07-30T14:00:00Z",
    "output": [
      {
        "timestamp": "2025-07-30T14:00:01Z",
        "stream": "stdout",
        "content": "total 64\n"
      },
      {
        "timestamp": "2025-07-30T14:00:01Z",
        "stream": "stdout",
        "content": "drwxr-xr-x  5 user user 4096 Jul 30 14:00 .\n"
      }
    ],
    "exit_code": null
  },
  "error": null
}
```

### Cancel Command
Cancel a running command.

```http
POST /api/commands/{command_id}/cancel
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "command_id": "command-uuid",
    "status": "cancelled",
    "cancelled_at": "2025-07-30T14:01:00Z",
    "exit_code": -15
  },
  "error": null
}
```

### List Running Commands
Get a list of currently running commands.

```http
GET /api/commands/running
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "commands": [
      {
        "command_id": "command-uuid",
        "command": "npm test",
        "status": "running",
        "started_at": "2025-07-30T14:00:00Z",
        "duration": 45.5
      }
    ],
    "total_running": 1
  },
  "error": null
}
```

### Command History
Get command execution history.

```http
GET /api/commands/history?limit=50&offset=0
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "commands": [
      {
        "command_id": "command-uuid",
        "command": "ls -la",
        "status": "completed",
        "started_at": "2025-07-30T13:45:00Z",
        "completed_at": "2025-07-30T13:45:02Z",
        "exit_code": 0,
        "duration": 2.1
      }
    ],
    "total": 150,
    "limit": 50,
    "offset": 0
  },
  "error": null
}
```

### Command Suggestions
Get command suggestions based on context.

```http
GET /api/commands/suggestions?context=git&prefix=git%20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "suggestions": [
      {
        "command": "git status",
        "description": "Show the working tree status",
        "category": "git"
      },
      {
        "command": "git add .",
        "description": "Add all files to staging area",
        "category": "git"
      },
      {
        "command": "git commit -m",
        "description": "Commit staged changes with message",
        "category": "git"
      }
    ]
  },
  "error": null
}
```

### Validate Command
Validate a command before execution.

```http
POST /api/commands/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "rm -rf /",
  "check_safety": true
}
```

**Response:**
```json
{
  "data": {
    "valid": false,
    "safe": false,
    "warnings": [
      "This command is potentially destructive",
      "Command attempts to delete system files"
    ],
    "suggestions": [
      "Use 'rm -rf ./directory' to delete specific directory",
      "Use 'ls' to list files before deletion"
    ]
  },
  "error": null
}
```

## Session Management Endpoints

### Create Session
Create a new user session.

```http
POST /api/sessions/
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": "project-uuid",
  "settings": {
    "theme": "dark",
    "auto_save": true,
    "notifications": true
  }
}
```

**Response:**
```json
{
  "data": {
    "session_id": "session-uuid",
    "project_id": "project-uuid",
    "user_id": "user-uuid",
    "status": "active",
    "created_at": "2025-07-30T14:00:00Z",
    "last_accessed": "2025-07-30T14:00:00Z",
    "expires_at": "2025-07-30T16:00:00Z",
    "settings": {
      "theme": "dark",
      "auto_save": true,
      "notifications": true
    }
  },
  "error": null
}
```

### List Sessions
Get a list of user sessions.

```http
GET /api/sessions/?status=active&project_id=uuid
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "sessions": [
      {
        "session_id": "session-uuid",
        "project_id": "project-uuid",
        "project_name": "E-commerce Platform",
        "status": "active",
        "created_at": "2025-07-30T14:00:00Z",
        "last_accessed": "2025-07-30T14:15:00Z",
        "expires_at": "2025-07-30T16:00:00Z"
      }
    ],
    "total": 3
  },
  "error": null
}
```

### Get Session Details
Get detailed information about a session.

```http
GET /api/sessions/{session_id}
Authorization: Bearer <token>
```

### Update Session
Update session settings.

```http
PUT /api/sessions/{session_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "settings": {
    "theme": "light",
    "auto_save": false
  }
}
```

### Delete Session
Delete a session.

```http
DELETE /api/sessions/{session_id}
Authorization: Bearer <token>
```

### Session History
Get session activity history.

```http
GET /api/sessions/{session_id}/history
Authorization: Bearer <token>
```

### Restore Session
Restore a previous session state.

```http
POST /api/sessions/{session_id}/restore
Authorization: Bearer <token>
Content-Type: application/json

{
  "restore_point": "2025-07-30T13:00:00Z",
  "include_tasks": true,
  "include_settings": true
}
```

## Queue Management Endpoints

### Queue Status
Get the current status of task queues.

```http
GET /api/queues/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "queues": {
      "high_priority": {
        "size": 5,
        "processing": 2,
        "completed_today": 145
      },
      "normal_priority": {
        "size": 23,
        "processing": 8,
        "completed_today": 456
      },
      "low_priority": {
        "size": 67,
        "processing": 3,
        "completed_today": 234
      }
    },
    "workers": {
      "active": 10,
      "idle": 5,
      "total": 15
    },
    "performance": {
      "tasks_per_minute": 25.5,
      "average_processing_time": "00:02:15",
      "success_rate": 0.956
    }
  },
  "error": null
}
```

### Pause Queue
Pause queue processing.

```http
POST /api/queues/pause
Authorization: Bearer <token>
Content-Type: application/json

{
  "queue_name": "high_priority",
  "reason": "Maintenance window"
}
```

### Resume Queue
Resume queue processing.

```http
POST /api/queues/resume
Authorization: Bearer <token>
Content-Type: application/json

{
  "queue_name": "high_priority"
}
```

### Clear Queue
Clear all tasks from a queue.

```http
DELETE /api/queues/clear
Authorization: Bearer <token>
Content-Type: application/json

{
  "queue_name": "low_priority",
  "confirm": true
}
```

### Queue Metrics
Get detailed queue performance metrics.

```http
GET /api/queues/metrics?period=24h
Authorization: Bearer <token>
```

### Set Task Priority
Change the priority of tasks in the queue.

```http
POST /api/queues/priority
Authorization: Bearer <token>
Content-Type: application/json

{
  "task_ids": ["task-uuid-1", "task-uuid-2"],
  "priority": "high"
}
```

## User Management Endpoints

### Get User Profile
Get the current user's profile information.

```http
GET /api/users/profile
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "id": "user-uuid",
    "username": "johndoe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "avatar_url": "https://example.com/avatar.jpg",
    "role": "developer",
    "permissions": ["read", "write", "execute"],
    "created_at": "2025-01-01T00:00:00Z",
    "last_login": "2025-07-30T14:00:00Z",
    "preferences": {
      "theme": "dark",
      "language": "en",
      "timezone": "UTC",
      "notifications": {
        "email": true,
        "push": false,
        "task_updates": true
      }
    },
    "statistics": {
      "tasks_created": 156,
      "tasks_completed": 134,
      "projects_created": 8,
      "total_login_time": "240:15:30"
    }
  },
  "error": null
}
```

### Update User Preferences
Update user preferences and settings.

```http
PUT /api/users/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "theme": "light",
  "language": "en",
  "timezone": "America/New_York",
  "notifications": {
    "email": false,
    "push": true,
    "task_updates": true,
    "project_updates": false
  },
  "dashboard_layout": {
    "widgets": ["tasks", "projects", "performance"],
    "columns": 3
  }
}
```

**Response:**
```json
{
  "data": {
    "preferences": {
      "theme": "light",
      "language": "en",
      "timezone": "America/New_York",
      "notifications": {
        "email": false,
        "push": true,
        "task_updates": true,
        "project_updates": false
      },
      "dashboard_layout": {
        "widgets": ["tasks", "projects", "performance"],
        "columns": 3
      }
    },
    "updated_at": "2025-07-30T14:00:00Z"
  },
  "error": null
}
```

## WebSocket API

### Connection
Connect to the WebSocket endpoint for real-time updates.

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/session-uuid');
```

### Authentication
Authenticate the WebSocket connection after establishing it.

```javascript
ws.send(JSON.stringify({
  type: 'authenticate',
  token: 'jwt-token-here'
}));
```

### Message Types

#### Client to Server Messages

##### Execute Task
```javascript
ws.send(JSON.stringify({
  type: 'execute_task',
  task_id: 'task-uuid',
  priority: 'high'
}));
```

##### Subscribe to Project Updates
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'project_updates',
  project_id: 'project-uuid'
}));
```

##### Unsubscribe from Updates
```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  channel: 'project_updates',
  project_id: 'project-uuid'
}));
```

##### Get Real-time Metrics
```javascript
ws.send(JSON.stringify({
  type: 'get_metrics',
  metrics: ['performance', 'queue_status', 'system_health']
}));
```

##### Ping (Keep-alive)
```javascript
ws.send(JSON.stringify({
  type: 'ping',
  timestamp: Date.now()
}));
```

#### Server to Client Messages

##### Task Update
```json
{
  "type": "task_update",
  "data": {
    "task_id": "task-uuid",
    "status": "running",
    "progress_percentage": 45,
    "updated_at": "2025-07-30T14:00:00Z"
  },
  "timestamp": "2025-07-30T14:00:00Z"
}
```

##### Task Completed
```json
{
  "type": "task_completed",
  "data": {
    "task_id": "task-uuid",
    "status": "completed",
    "completed_at": "2025-07-30T14:05:00Z",
    "duration": "00:05:00",
    "exit_code": 0
  },
  "timestamp": "2025-07-30T14:05:00Z"
}
```

##### Command Output (Streaming)
```json
{
  "type": "command_output",
  "data": {
    "command_id": "command-uuid",
    "stream": "stdout",
    "content": "Building project...\n",
    "timestamp": "2025-07-30T14:00:01Z"
  }
}
```

##### Performance Metrics
```json
{
  "type": "performance_data",
  "data": {
    "cpu_usage": 45.2,
    "memory_usage": 67.8,
    "active_connections": 25,
    "tasks_per_minute": 15.5,
    "queue_sizes": {
      "high": 3,
      "normal": 12,
      "low": 45
    }
  },
  "timestamp": "2025-07-30T14:00:00Z"
}
```

##### System Notification
```json
{
  "type": "notification",
  "data": {
    "level": "info",
    "title": "System Maintenance",
    "message": "Scheduled maintenance will begin in 30 minutes",
    "actions": [
      {
        "label": "Dismiss",
        "action": "dismiss"
      },
      {
        "label": "View Details",
        "action": "view_details",
        "url": "/maintenance"
      }
    ]
  },
  "timestamp": "2025-07-30T14:00:00Z"
}
```

##### Error
```json
{
  "type": "error",
  "data": {
    "code": "TASK_EXECUTION_FAILED",
    "message": "Failed to execute task",
    "task_id": "task-uuid",
    "details": {
      "error": "Command not found: invalidcommand",
      "exit_code": 127
    }
  },
  "timestamp": "2025-07-30T14:00:00Z"
}
```

##### Pong (Response to Ping)
```json
{
  "type": "pong",
  "timestamp": 1690725600000
}
```

## Error Codes

### HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `204 No Content` - Request successful, no content to return
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., duplicate)
- `422 Unprocessable Entity` - Validation error
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `502 Bad Gateway` - Upstream server error
- `503 Service Unavailable` - Service temporarily unavailable

### Application Error Codes

#### Authentication Errors
- `AUTH_TOKEN_INVALID` - JWT token is invalid or expired
- `AUTH_TOKEN_MISSING` - Authorization header missing
- `AUTH_INSUFFICIENT_PERMISSIONS` - User lacks required permissions
- `AUTH_ACCOUNT_DISABLED` - User account is disabled

#### Validation Errors
- `VALIDATION_ERROR` - Request data validation failed
- `VALIDATION_REQUIRED_FIELD` - Required field is missing
- `VALIDATION_INVALID_FORMAT` - Field format is invalid
- `VALIDATION_VALUE_TOO_LONG` - Field value exceeds maximum length
- `VALIDATION_VALUE_TOO_SHORT` - Field value below minimum length

#### Resource Errors
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `RESOURCE_ALREADY_EXISTS` - Resource with same identifier exists
- `RESOURCE_IN_USE` - Resource cannot be deleted (in use)
- `RESOURCE_LIMIT_EXCEEDED` - Resource limit reached

#### Task Errors
- `TASK_NOT_FOUND` - Task doesn't exist
- `TASK_ALREADY_RUNNING` - Task is already being executed
- `TASK_EXECUTION_FAILED` - Task execution failed
- `TASK_TIMEOUT` - Task execution timed out
- `TASK_CANCELLED` - Task was cancelled
- `TASK_DEPENDENCY_NOT_MET` - Task dependencies not satisfied

#### Project Errors
- `PROJECT_NOT_FOUND` - Project doesn't exist
- `PROJECT_ACCESS_DENIED` - User doesn't have project access
- `PROJECT_ARCHIVED` - Project is archived and read-only
- `PROJECT_LIMIT_EXCEEDED` - Project resource limits exceeded

#### System Errors
- `SYSTEM_MAINTENANCE` - System is in maintenance mode
- `SYSTEM_OVERLOADED` - System is overloaded, try again later
- `DATABASE_ERROR` - Database operation failed
- `QUEUE_FULL` - Task queue is full
- `WEBSOCKET_CONNECTION_FAILED` - WebSocket connection failed

## Rate Limiting

The API implements rate limiting to prevent abuse and ensure fair usage.

### Rate Limits

- **Default**: 100 requests per minute per IP
- **Authenticated users**: 200 requests per minute per user
- **Premium users**: 500 requests per minute per user
- **WebSocket connections**: 50 concurrent connections per user

### Rate Limit Headers

All responses include rate limiting headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1690725660
X-RateLimit-Window: 60
```

### Rate Limit Exceeded Response

When rate limit is exceeded:

```json
{
  "data": null,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "limit": 100,
      "window": 60,
      "reset_at": "2025-07-30T14:01:00Z"
    }
  }
}
```

## Pagination

List endpoints support pagination using query parameters:

- `page` - Page number (starts at 1)
- `page_size` - Items per page (default: 50, max: 100)
- `sort` - Sort field
- `order` - Sort order (`asc` or `desc`)

### Pagination Response Format

```json
{
  "data": {
    "items": [...],
    "total": 1500,
    "page": 1,
    "page_size": 50,
    "pages": 30,
    "has_next": true,
    "has_previous": false
  }
}
```

### Pagination Links

Some endpoints include pagination links:

```json
{
  "data": {
    "items": [...],
    "pagination": {
      "total": 1500,
      "page": 2,
      "page_size": 50,
      "pages": 30,
      "links": {
        "first": "/api/tasks/?page=1&page_size=50",
        "previous": "/api/tasks/?page=1&page_size=50",
        "next": "/api/tasks/?page=3&page_size=50",
        "last": "/api/tasks/?page=30&page_size=50"
      }
    }
  }
}
```

## Filtering and Searching

Many endpoints support filtering and searching:

### Common Filter Parameters

- `search` - Full-text search in relevant fields
- `status` - Filter by status
- `created_after` - Filter by creation date (ISO 8601)
- `created_before` - Filter by creation date (ISO 8601)
- `tags` - Filter by tags (comma-separated)

### Search Syntax

The search parameter supports advanced syntax:

- `search=authentication` - Simple text search
- `search="user authentication"` - Exact phrase search
- `search=auth* AND security` - Boolean operators
- `search=title:authentication` - Field-specific search

### Example Filtered Request

```http
GET /api/tasks/?search=authentication&status=pending,running&created_after=2025-07-01T00:00:00Z&tags=security,backend&sort=priority&order=desc&page=1&page_size=25
```

## Webhooks

The API supports webhooks for real-time notifications to external systems.

### Webhook Events

Available webhook events:

- `task.created` - Task was created
- `task.updated` - Task was updated
- `task.completed` - Task was completed
- `task.failed` - Task execution failed
- `project.created` - Project was created
- `project.updated` - Project was updated
- `system.maintenance` - System maintenance scheduled
- `system.alert` - System alert triggered

### Webhook Payload Format

```json
{
  "event": "task.completed",
  "timestamp": "2025-07-30T14:00:00Z",
  "data": {
    "task_id": "task-uuid",
    "project_id": "project-uuid",
    "status": "completed",
    "duration": "00:05:30"
  },
  "webhook_id": "webhook-uuid",
  "delivery_id": "delivery-uuid"
}
```

### Webhook Security

Webhooks are secured using HMAC-SHA256 signatures:

```http
X-Signature-256: sha256=abc123...
X-Delivery-ID: delivery-uuid
X-Event-Type: task.completed
```

## SDK Examples

### Python SDK Example

```python
from claude_cli_sdk import ClaudeCliClient

# Initialize client
client = ClaudeCliClient(
    base_url="http://localhost:8000/api",
    token="your-jwt-token"
)

# Create a task
task = client.tasks.create(
    title="Implement authentication",
    project_id="project-uuid",
    priority=1
)

# List tasks with filtering
tasks = client.tasks.list(
    status=["pending", "running"],
    assigned_to="user-uuid",
    page=1,
    page_size=50
)

# Execute task
execution = client.tasks.execute(task.id, priority="high")

# WebSocket connection
with client.websocket.connect("session-uuid") as ws:
    # Subscribe to task updates
    ws.subscribe("task_updates", project_id="project-uuid")
    
    # Listen for messages
    for message in ws.listen():
        if message.type == "task_update":
            print(f"Task {message.data.task_id} updated: {message.data.status}")
```

### JavaScript SDK Example

```javascript
import { ClaudeCliClient } from '@claude-cli/sdk';

// Initialize client
const client = new ClaudeCliClient({
  baseURL: 'http://localhost:8000/api',
  token: 'your-jwt-token'
});

// Create a task
const task = await client.tasks.create({
  title: 'Implement authentication',
  projectId: 'project-uuid',
  priority: 1
});

// List tasks
const tasks = await client.tasks.list({
  status: ['pending', 'running'],
  assignedTo: 'user-uuid',
  page: 1,
  pageSize: 50
});

// WebSocket connection
const ws = client.websocket.connect('session-uuid');

ws.on('task_update', (data) => {
  console.log(`Task ${data.taskId} updated: ${data.status}`);
});

ws.subscribe('task_updates', { projectId: 'project-uuid' });
```

### cURL Examples

#### Create Task
```bash
curl -X POST "http://localhost:8000/api/tasks/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement user authentication",
    "project_id": "project-uuid",
    "priority": 1
  }'
```

#### List Tasks with Filtering
```bash
curl -X GET "http://localhost:8000/api/tasks/?status=pending&page=1&page_size=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Execute Task
```bash
curl -X POST "http://localhost:8000/api/tasks/task-uuid/execute" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority": "high"}'
```

## Testing

### API Testing Tools

- **Swagger UI**: Available at `http://localhost:8000/docs`
- **Postman Collection**: Import from `/docs/postman_collection.json`
- **Insomnia Collection**: Import from `/docs/insomnia_collection.json`

### Testing Endpoints

Use the health endpoint for testing connectivity:

```bash
curl -X GET "http://localhost:8000/api/health/"
```

### Environment Variables for Testing

```bash
export API_BASE_URL="http://localhost:8000/api"
export API_TOKEN="your-test-token"
export WEBSOCKET_URL="ws://localhost:8000/ws"
```

## Support

For API support and questions:

1. Check the interactive documentation at `/docs`
2. Review this documentation for common patterns
3. Check system health at `/api/health/detailed`
4. Review error codes and messages in responses
5. Contact the development team for complex issues

---

**API Documentation Version**: 1.0.0  
**Last Updated**: July 31, 2025  
**Base URL**: `http://localhost:8000/api`