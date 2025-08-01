"""Initialize the complete database schema."""

import sqlite3
import json
from datetime import datetime
import uuid

def init_database():
    """Initialize all tables in the database."""
    conn = sqlite3.connect('claude_cli.db')
    cursor = conn.cursor()
    
    try:
        # Create projects table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create tasks table  
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                priority TEXT NOT NULL DEFAULT 'medium',
                command TEXT,
                metadata TEXT,
                github_issue_number INTEGER,
                github_connection_id TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        """)
        
        # Create task_queues table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_queues (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tasks_project_id ON tasks(project_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tasks_priority ON tasks(priority)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tasks_created_at ON tasks(created_at)")
        
        # Load initial data if tables are empty
        cursor.execute("SELECT COUNT(*) FROM projects")
        if cursor.fetchone()[0] == 0:
            # Load projects from JSON
            try:
                with open('data/projects.json', 'r') as f:
                    projects_data = json.load(f)
                    for project in projects_data.get('projects', []):
                        cursor.execute("""
                            INSERT INTO projects (id, name, description, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?)
                        """, (
                            project['id'],
                            project['name'],
                            project.get('description', ''),
                            project.get('created_at', datetime.now().isoformat()),
                            project.get('updated_at', datetime.now().isoformat())
                        ))
            except FileNotFoundError:
                # Create a default project
                cursor.execute("""
                    INSERT INTO projects (id, name, description)
                    VALUES (?, ?, ?)
                """, (str(uuid.uuid4()), 'Default Project', 'Default project for Claude CLI'))
        
        # Load tasks if table is empty
        cursor.execute("SELECT COUNT(*) FROM tasks")
        if cursor.fetchone()[0] == 0:
            try:
                with open('data/tasks.json', 'r') as f:
                    tasks_data = json.load(f)
                    for task in tasks_data.get('tasks', []):
                        metadata = json.dumps(task.get('metadata', {}))
                        cursor.execute("""
                            INSERT INTO tasks (id, project_id, name, description, status, priority, command, metadata, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            task['id'],
                            task['project_id'],
                            task['name'],
                            task.get('description', ''),
                            task.get('status', 'pending'),
                            task.get('priority', 'medium'),
                            task.get('command', ''),
                            metadata,
                            task.get('created_at', datetime.now().isoformat()),
                            task.get('updated_at', datetime.now().isoformat())
                        ))
            except FileNotFoundError:
                pass  # No initial tasks
        
        conn.commit()
        print("Database initialized successfully!")
        
        # Show current state
        cursor.execute("SELECT COUNT(*) FROM projects")
        project_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM tasks")
        task_count = cursor.fetchone()[0]
        
        print(f"Projects: {project_count}")
        print(f"Tasks: {task_count}")
        
    except Exception as e:
        print(f"Error initializing database: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    init_database()