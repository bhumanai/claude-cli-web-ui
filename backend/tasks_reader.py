#!/usr/bin/env python3
"""
Simple tasks reader for Claude CLI Web UI.
Reads task information from the /tasks directory.
"""

import os
import json
import glob
from datetime import datetime

def read_tasks_from_filesystem(base_path="/Users/don/D3/tasks"):
    """Read tasks from the filesystem task folders."""
    tasks = []
    
    if not os.path.exists(base_path):
        return tasks
    
    # Find all task folders
    task_folders = glob.glob(os.path.join(base_path, "task-*"))
    
    for folder in task_folders:
        if os.path.isdir(folder):
            task_id = os.path.basename(folder)
            task_md_path = os.path.join(folder, "task.md")
            
            # Default task info
            task = {
                "id": task_id,
                "name": task_id,
                "description": "",
                "status": "pending",
                "priority": "medium",
                "created_at": datetime.fromtimestamp(os.path.getctime(folder)).isoformat(),
                "updated_at": datetime.fromtimestamp(os.path.getmtime(folder)).isoformat(),
                "project_id": None,
                "path": folder
            }
            
            # Try to read task.md for more info
            if os.path.exists(task_md_path):
                try:
                    with open(task_md_path, 'r') as f:
                        content = f.read()
                        lines = content.split('\n')
                        
                        # Parse task.md for information
                        for i, line in enumerate(lines):
                            if line.startswith('# Task:'):
                                task['name'] = line.replace('# Task:', '').strip()
                            elif line.startswith('**Status**:'):
                                status = line.replace('**Status**:', '').strip().lower()
                                if 'complete' in status:
                                    task['status'] = 'completed'
                                elif 'progress' in status:
                                    task['status'] = 'in_progress'
                                elif 'active' in status:
                                    task['status'] = 'in_progress'
                            elif line.startswith('## Description'):
                                # Get next non-empty line as description
                                for j in range(i+1, min(i+5, len(lines))):
                                    if lines[j].strip() and not lines[j].startswith('#'):
                                        task['description'] = lines[j].strip()
                                        break
                except Exception as e:
                    print(f"Error reading {task_md_path}: {e}")
            
            # Assign project based on task name/id patterns
            task_name_lower = task['name'].lower()
            task_id_lower = task_id.lower()
            
            if ('claude' in task_name_lower and 'cli' in task_name_lower) or 'claude-cli' in task_id_lower:
                task['project_id'] = 'claude-cli'
            elif 'agentic' in task_name_lower or 'agentic' in task_id_lower:
                task['project_id'] = 'agentic-dev'
            elif ('task' in task_name_lower and 'management' in task_name_lower) or 'task-management' in task_id_lower:
                task['project_id'] = 'task-mgmt'
            else:
                task['project_id'] = 'general'
            
            tasks.append(task)
    
    return sorted(tasks, key=lambda x: x['created_at'], reverse=True)

def read_projects_from_filesystem():
    """Create projects based on common patterns in task names."""
    tasks = read_tasks_from_filesystem()
    projects = []
    project_map = {}
    
    # No need to extract projects from tasks since project_id is already assigned
    
    # Always include these core projects even if no tasks exist for them
    core_projects = {
        'claude-cli': {
            "id": "claude-cli",
            "name": "Claude CLI Web UI",
            "description": "Tasks related to Claude CLI Web UI",
            "path": "/Users/don/D3/claude-cli",
            "created_at": datetime.now().isoformat()
        },
        'agentic-dev': {
            "id": "agentic-dev",
            "name": "Agentic Development System",
            "description": "Tasks related to Agentic Development System",
            "path": "/Users/don/D3/agentic-dev",
            "created_at": datetime.now().isoformat()
        }
    }
    
    # Merge with discovered projects
    for key, project in core_projects.items():
        if key not in project_map:
            project_map[key] = project
    
    return list(project_map.values())

if __name__ == "__main__":
    # Test the reader
    print("Tasks found:")
    tasks = read_tasks_from_filesystem()
    for task in tasks:
        print(f"- {task['name']} ({task['id']}) - Status: {task['status']}")
    
    print("\nProjects found:")
    projects = read_projects_from_filesystem()
    for project in projects:
        print(f"- {project['name']} ({project['id']})")