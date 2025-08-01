#!/usr/bin/env python3
"""
Test script for the task management API.
Run this after starting the server to test all endpoints.
"""

import json
import urllib.request
import urllib.error
import time
from typing import Dict, Any, Optional

BASE_URL = "http://127.0.0.1:8000"

def make_request(method: str, endpoint: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Make HTTP request to the API."""
    url = f"{BASE_URL}{endpoint}"
    
    request = urllib.request.Request(url, method=method)
    request.add_header('Content-Type', 'application/json')
    
    if data:
        request.data = json.dumps(data).encode('utf-8')
    
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_data = json.loads(e.read().decode('utf-8'))
        print(f"Error {e.code}: {error_data}")
        return error_data

def test_projects():
    """Test project management endpoints."""
    print("\n=== Testing Project Management ===")
    
    # Create project
    project_data = {
        "name": "Test Project",
        "description": "A test project for the task management system",
        "owner": "test_user"
    }
    project = make_request("POST", "/api/projects", project_data)
    print(f"Created project: {project['name']} (ID: {project['id']})")
    project_id = project['id']
    
    # List projects
    projects = make_request("GET", "/api/projects")
    print(f"Total projects: {len(projects)}")
    
    # Get specific project
    retrieved = make_request("GET", f"/api/projects/{project_id}")
    print(f"Retrieved project: {retrieved['name']}")
    
    return project_id

def test_tasks(project_id: str):
    """Test task management endpoints."""
    print("\n=== Testing Task Management ===")
    
    # Create tasks
    task_ids = []
    for i in range(3):
        task_data = {
            "title": f"Task {i+1}",
            "description": f"Description for task {i+1}",
            "priority": ["high", "medium", "low"][i],
            "project_id": project_id,
            "assignee": f"user_{i+1}"
        }
        task = make_request("POST", "/api/tasks", task_data)
        print(f"Created task: {task['title']} (ID: {task['id']})")
        task_ids.append(task['id'])
    
    # List all tasks
    tasks = make_request("GET", "/api/tasks")
    print(f"Total tasks: {len(tasks)}")
    
    # Update a task
    update_data = {
        "status": "in_progress",
        "description": "Updated description"
    }
    updated = make_request("PUT", f"/api/tasks/{task_ids[0]}", update_data)
    print(f"Updated task {task_ids[0]}: status={updated['status']}")
    
    return task_ids

def test_queue(task_ids: list):
    """Test task queue endpoints."""
    print("\n=== Testing Task Queue ===")
    
    # Check initial queue status
    queue_status = make_request("GET", "/api/queue")
    print(f"Initial queue: {queue_status['queue_length']} tasks")
    
    # Add tasks to queue
    for task_id in task_ids[:2]:
        result = make_request("POST", "/api/queue/add", {"task_id": task_id})
        print(f"Added task {task_id} to queue at position {result.get('queue_position', 'N/A')}")
    
    # Check queue status again
    queue_status = make_request("GET", "/api/queue")
    print(f"Queue after adding: {queue_status['queue_length']} tasks")
    
    # Process queue
    for i in range(2):
        result = make_request("POST", "/api/queue/process", {})
        if result.get('success'):
            print(f"Processing task: {result['task_id']}")
        else:
            print(f"Queue processing failed: {result.get('error')}")
        time.sleep(1)  # Wait a bit between processing
    
    # Final queue status
    queue_status = make_request("GET", "/api/queue")
    print(f"Final queue: {queue_status['queue_length']} tasks")

def test_cleanup(project_id: str, task_ids: list):
    """Test deletion endpoints."""
    print("\n=== Testing Cleanup ===")
    
    # Delete individual task
    result = make_request("DELETE", f"/api/tasks/{task_ids[0]}")
    print(f"Deleted task {task_ids[0]}: {result.get('success', False)}")
    
    # Delete project (should cascade delete remaining tasks)
    result = make_request("DELETE", f"/api/projects/{project_id}")
    print(f"Deleted project {project_id}: {result.get('success', False)}")
    print(f"Tasks deleted with project: {result.get('deleted_tasks', 0)}")
    
    # Verify cleanup
    tasks = make_request("GET", "/api/tasks")
    projects = make_request("GET", "/api/projects")
    print(f"Remaining tasks: {len(tasks)}")
    print(f"Remaining projects: {len(projects)}")

def main():
    """Run all tests."""
    print("Task Management API Test Suite")
    print("=" * 40)
    
    try:
        # Test health check
        health = make_request("GET", "/api/health")
        print(f"Server health: {health['status']}")
        
        # Run tests
        project_id = test_projects()
        task_ids = test_tasks(project_id)
        test_queue(task_ids)
        
        # Wait a bit for background processing
        print("\nWaiting for background task processing...")
        time.sleep(3)
        
        # Check task statuses after processing
        print("\n=== Task Status After Processing ===")
        for task_id in task_ids:
            try:
                task = make_request("GET", f"/api/tasks/{task_id}")
                print(f"Task {task_id}: {task.get('status', 'unknown')}")
            except:
                print(f"Task {task_id}: not found (may have been deleted)")
        
        # Cleanup
        test_cleanup(project_id, task_ids)
        
        print("\n✅ All tests completed!")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")

if __name__ == "__main__":
    main()