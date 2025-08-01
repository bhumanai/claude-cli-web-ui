"""Create GitHub integration tables directly."""

import sqlite3
from datetime import datetime

def create_github_tables():
    """Create GitHub integration tables in the database."""
    conn = sqlite3.connect('claude_cli.db')
    cursor = conn.cursor()
    
    try:
        # Create github_connections table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS github_connections (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                repository TEXT NOT NULL,
                username TEXT NOT NULL,
                encrypted_token TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, repository),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        """)
        
        # Create indexes for github_connections
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_connections_project_id ON github_connections(project_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_connections_repository ON github_connections(repository)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_connections_status ON github_connections(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_connections_created_at ON github_connections(created_at)")
        
        # Create github_issues table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS github_issues (
                id TEXT PRIMARY KEY,
                connection_id TEXT NOT NULL,
                issue_number INTEGER NOT NULL,
                title TEXT NOT NULL,
                body TEXT,
                state TEXT NOT NULL,
                labels TEXT,
                assignees TEXT,
                github_created_at TIMESTAMP,
                github_updated_at TIMESTAMP,
                synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                html_url TEXT,
                UNIQUE(connection_id, issue_number),
                FOREIGN KEY (connection_id) REFERENCES github_connections(id) ON DELETE CASCADE
            )
        """)
        
        # Create indexes for github_issues
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_issues_connection_id ON github_issues(connection_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_issues_issue_number ON github_issues(issue_number)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_issues_state ON github_issues(state)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_issues_synced_at ON github_issues(synced_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_github_issues_github_updated_at ON github_issues(github_updated_at)")
        
        # Add GitHub fields to tasks table if they don't exist
        # First check if columns exist
        cursor.execute("PRAGMA table_info(tasks)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'github_issue_number' not in columns:
            cursor.execute("ALTER TABLE tasks ADD COLUMN github_issue_number INTEGER")
        
        if 'github_connection_id' not in columns:
            cursor.execute("ALTER TABLE tasks ADD COLUMN github_connection_id TEXT")
        
        # Create indexes for new task columns
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tasks_github_issue_number ON tasks(github_issue_number)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tasks_github_connection_id ON tasks(github_connection_id)")
        
        conn.commit()
        print("GitHub integration tables created successfully!")
        
    except Exception as e:
        print(f"Error creating tables: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    create_github_tables()