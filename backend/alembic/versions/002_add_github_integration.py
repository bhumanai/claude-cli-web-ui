"""Add GitHub integration tables

Revision ID: 002_github_integration
Revises: 001_initial_tables
Create Date: 2025-08-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002_github_integration'
down_revision: Union[str, None] = '001_initial_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add GitHub integration tables."""
    
    # Create github_connections table
    op.create_table('github_connections',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('repository', sa.String(255), nullable=False, comment='Repository in format owner/repo'),
        sa.Column('username', sa.String(255), nullable=False, comment='GitHub username'),
        sa.Column('encrypted_token', sa.Text(), nullable=False, comment='Encrypted GitHub personal access token'),
        sa.Column('status', sa.String(20), nullable=False, server_default='active', comment='Connection status: active, inactive, error'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('project_id', 'repository', name='uq_project_repository'),
    )
    
    # Create indexes for github_connections
    op.create_index('ix_github_connections_project_id', 'github_connections', ['project_id'])
    op.create_index('ix_github_connections_repository', 'github_connections', ['repository'])
    op.create_index('ix_github_connections_status', 'github_connections', ['status'])
    op.create_index('ix_github_connections_created_at', 'github_connections', ['created_at'])
    
    # Create github_issues table
    op.create_table('github_issues',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('connection_id', sa.String(36), sa.ForeignKey('github_connections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('issue_number', sa.Integer(), nullable=False, comment='GitHub issue number'),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('state', sa.String(20), nullable=False, comment='Issue state: open, closed'),
        sa.Column('labels', sa.JSON(), nullable=True),
        sa.Column('assignees', sa.JSON(), nullable=True),
        sa.Column('github_created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('github_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('html_url', sa.String(500), nullable=True),
        sa.UniqueConstraint('connection_id', 'issue_number', name='uq_connection_issue'),
    )
    
    # Create indexes for github_issues
    op.create_index('ix_github_issues_connection_id', 'github_issues', ['connection_id'])
    op.create_index('ix_github_issues_issue_number', 'github_issues', ['issue_number'])
    op.create_index('ix_github_issues_state', 'github_issues', ['state'])
    op.create_index('ix_github_issues_synced_at', 'github_issues', ['synced_at'])
    op.create_index('ix_github_issues_github_updated_at', 'github_issues', ['github_updated_at'])
    
    # Add GitHub fields to tasks table
    op.add_column('tasks', sa.Column('github_issue_number', sa.Integer(), nullable=True, comment='GitHub issue number if task was created from an issue'))
    op.add_column('tasks', sa.Column('github_connection_id', sa.String(36), nullable=True, comment='Reference to GitHub connection if task is linked to GitHub'))
    
    # Add foreign key constraint for github_connection_id
    op.create_foreign_key('fk_tasks_github_connection', 'tasks', 'github_connections', ['github_connection_id'], ['id'], ondelete='SET NULL')
    
    # Create indexes for new task columns
    op.create_index('ix_tasks_github_issue_number', 'tasks', ['github_issue_number'])
    op.create_index('ix_tasks_github_connection_id', 'tasks', ['github_connection_id'])


def downgrade() -> None:
    """Remove GitHub integration tables."""
    
    # Drop indexes from tasks table
    op.drop_index('ix_tasks_github_connection_id', 'tasks')
    op.drop_index('ix_tasks_github_issue_number', 'tasks')
    
    # Drop foreign key constraint
    op.drop_constraint('fk_tasks_github_connection', 'tasks', type_='foreignkey')
    
    # Drop columns from tasks table
    op.drop_column('tasks', 'github_connection_id')
    op.drop_column('tasks', 'github_issue_number')
    
    # Drop github_issues table and its indexes
    op.drop_index('ix_github_issues_github_updated_at', 'github_issues')
    op.drop_index('ix_github_issues_synced_at', 'github_issues')
    op.drop_index('ix_github_issues_state', 'github_issues')
    op.drop_index('ix_github_issues_issue_number', 'github_issues')
    op.drop_index('ix_github_issues_connection_id', 'github_issues')
    op.drop_table('github_issues')
    
    # Drop github_connections table and its indexes
    op.drop_index('ix_github_connections_created_at', 'github_connections')
    op.drop_index('ix_github_connections_status', 'github_connections')
    op.drop_index('ix_github_connections_repository', 'github_connections')
    op.drop_index('ix_github_connections_project_id', 'github_connections')
    op.drop_table('github_connections')