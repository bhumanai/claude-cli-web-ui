"""GitHub integration service for repository management and issue tracking."""

import asyncio
import base64
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.config import settings
from app.models.database import GitHubConnection, GitHubIssue, Task
from app.models.schemas import (
    GitHubConnectionRequest,
    GitHubConnectionResponse,
    GitHubIssueResponse,
    CreateTaskFromIssueRequest,
    TaskStatus,
    TaskPriority
)

logger = logging.getLogger(__name__)


class GitHubTokenEncryption:
    """Handle encryption/decryption of GitHub tokens."""
    
    def __init__(self, encryption_key: Optional[str] = None):
        """Initialize token encryption with key."""
        if encryption_key:
            self.fernet = Fernet(encryption_key.encode())
        else:
            # Generate a key for development (should use env var in production)
            key = Fernet.generate_key()
            self.fernet = Fernet(key)
            logger.warning("Using generated encryption key - set GITHUB_ENCRYPTION_KEY in production")
    
    def encrypt_token(self, token: str) -> str:
        """Encrypt a GitHub token."""
        return self.fernet.encrypt(token.encode()).decode()
    
    def decrypt_token(self, encrypted_token: str) -> str:
        """Decrypt a GitHub token."""
        return self.fernet.decrypt(encrypted_token.encode()).decode()


class GitHubClient:
    """GitHub API client for external API interactions."""
    
    def __init__(self, token: str):
        """Initialize GitHub client with authentication token."""
        self.token = token
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Claude-CLI-WebUI/1.0"
        }
    
    async def validate_token_and_repo(self, repository: str) -> Tuple[str, bool]:
        """
        Validate GitHub token and repository access.
        
        Args:
            repository: Repository in format "owner/repo"
            
        Returns:
            Tuple of (username, is_valid)
            
        Raises:
            HTTPException: If validation fails
        """
        async with httpx.AsyncClient() as client:
            try:
                # Check token validity and get user info
                user_response = await client.get(
                    f"{self.base_url}/user",
                    headers=self.headers,
                    timeout=30.0
                )
                
                if user_response.status_code == 401:
                    raise HTTPException(status_code=401, detail="Invalid GitHub token")
                
                user_response.raise_for_status()
                user_data = user_response.json()
                username = user_data.get("login")
                
                # Check repository access
                repo_response = await client.get(
                    f"{self.base_url}/repos/{repository}",
                    headers=self.headers,
                    timeout=30.0
                )
                
                if repo_response.status_code == 404:
                    raise HTTPException(
                        status_code=404, 
                        detail="Repository not found or no access permissions"
                    )
                
                repo_response.raise_for_status()
                
                return username, True
                
            except httpx.TimeoutException:
                raise HTTPException(status_code=408, detail="GitHub API timeout")
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 403:
                    raise HTTPException(status_code=403, detail="GitHub API rate limit exceeded")
                raise HTTPException(status_code=500, detail=f"GitHub API error: {e}")
    
    async def get_repository_issues(
        self, 
        repository: str, 
        state: str = "open",
        labels: Optional[List[str]] = None,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[Dict], bool]:
        """
        Fetch issues from GitHub repository.
        
        Args:
            repository: Repository in format "owner/repo"
            state: Issue state (open, closed, all)
            labels: List of label names to filter by
            page: Page number for pagination
            per_page: Number of issues per page
            
        Returns:
            Tuple of (issues_list, has_more_pages)
        """
        params = {
            "state": state,
            "page": page,
            "per_page": min(per_page, 100)  # GitHub API limit
        }
        
        if labels:
            params["labels"] = ",".join(labels)
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/repos/{repository}/issues",
                    headers=self.headers,
                    params=params,
                    timeout=30.0
                )
                
                response.raise_for_status()
                issues = response.json()
                
                # Check if there are more pages
                link_header = response.headers.get("Link", "")
                has_more = "rel=\"next\"" in link_header
                
                return issues, has_more
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 403:
                    raise HTTPException(status_code=403, detail="GitHub API rate limit exceeded")
                elif e.response.status_code == 404:
                    raise HTTPException(status_code=404, detail="Repository not found")
                raise HTTPException(status_code=500, detail=f"GitHub API error: {e}")
            except httpx.TimeoutException:
                raise HTTPException(status_code=408, detail="GitHub API timeout")


class GitHubService:
    """Main service for GitHub integration business logic."""
    
    def __init__(self, db: AsyncSession):
        """Initialize GitHub service with database session."""
        self.db = db
        self.token_encryption = GitHubTokenEncryption(
            getattr(settings, 'GITHUB_ENCRYPTION_KEY', None)
        )
    
    async def connect_repository(
        self, 
        request: GitHubConnectionRequest
    ) -> GitHubConnectionResponse:
        """
        Connect a GitHub repository to a project.
        
        Args:
            request: GitHub connection request data
            
        Returns:
            GitHubConnectionResponse with connection details
            
        Raises:
            HTTPException: If connection fails or already exists
        """
        # Validate token and repository access
        client = GitHubClient(request.token)
        username, _ = await client.validate_token_and_repo(request.repository)
        
        # Check if connection already exists
        existing_query = select(GitHubConnection).where(
            and_(
                GitHubConnection.project_id == request.project_id,
                GitHubConnection.repository == request.repository
            )
        )
        result = await self.db.execute(existing_query)
        existing_connection = result.scalar_one_or_none()
        
        if existing_connection:
            raise HTTPException(
                status_code=409, 
                detail="GitHub repository already connected to this project"
            )
        
        # Create new connection
        encrypted_token = self.token_encryption.encrypt_token(request.token)
        
        connection = GitHubConnection(
            project_id=request.project_id,
            repository=request.repository,
            username=username,
            encrypted_token=encrypted_token,
            status="active",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        self.db.add(connection)
        await self.db.commit()
        await self.db.refresh(connection)
        
        return GitHubConnectionResponse(
            id=str(connection.id),
            repository=connection.repository,
            username=connection.username,
            connected_at=connection.created_at,
            project_id=connection.project_id,
            status=connection.status
        )
    
    async def get_repository_issues(
        self, 
        owner: str, 
        repo: str, 
        project_id: Optional[str] = None,
        state: str = "open",
        labels: Optional[List[str]] = None,
        page: int = 1,
        limit: int = 50
    ) -> Tuple[List[GitHubIssueResponse], int, bool]:
        """
        Get issues from GitHub repository with optional caching.
        
        Args:
            owner: Repository owner
            repo: Repository name
            project_id: Optional project ID for connection lookup
            state: Issue state filter
            labels: Label filters
            page: Page number
            limit: Issues per page
            
        Returns:
            Tuple of (issues, total_count, has_more)
        """
        repository = f"{owner}/{repo}"
        
        # Find GitHub connection to get token
        connection_query = select(GitHubConnection).where(
            GitHubConnection.repository == repository
        )
        
        if project_id:
            connection_query = connection_query.where(
                GitHubConnection.project_id == project_id
            )
        
        result = await self.db.execute(connection_query)
        connection = result.scalar_one_or_none()
        
        if not connection:
            raise HTTPException(
                status_code=404, 
                detail="GitHub repository not connected to any project"
            )
        
        # Decrypt token and fetch issues
        token = self.token_encryption.decrypt_token(connection.encrypted_token)
        client = GitHubClient(token)
        
        issues_data, has_more = await client.get_repository_issues(
            repository=repository,
            state=state,
            labels=labels,
            page=page,
            per_page=limit
        )
        
        # Convert to response format
        issues = []
        for issue_data in issues_data:
            # Skip pull requests (they appear as issues in GitHub API)
            if "pull_request" in issue_data:
                continue
                
            issue = GitHubIssueResponse(
                number=issue_data["number"],
                title=issue_data["title"],
                body=issue_data.get("body") or "",
                state=issue_data["state"],
                labels=[label["name"] for label in issue_data.get("labels", [])],
                assignees=[assignee["login"] for assignee in issue_data.get("assignees", [])],
                created_at=datetime.fromisoformat(
                    issue_data["created_at"].replace("Z", "+00:00")
                ),
                updated_at=datetime.fromisoformat(
                    issue_data["updated_at"].replace("Z", "+00:00")
                ),
                html_url=issue_data["html_url"]
            )
            issues.append(issue)
        
        return issues, len(issues), has_more
    
    async def create_task_from_issue(
        self, 
        issue_number: int, 
        request: CreateTaskFromIssueRequest
    ) -> Dict[str, str]:
        """
        Create a task from a GitHub issue.
        
        Args:
            issue_number: GitHub issue number
            request: Task creation request data
            
        Returns:
            Dict with task_id, github_issue_number, and created_at
            
        Raises:
            HTTPException: If issue not found or task already exists
        """
        repository = request.repository
        
        # Find GitHub connection
        connection_query = select(GitHubConnection).where(
            and_(
                GitHubConnection.repository == repository,
                GitHubConnection.project_id == request.project_id
            )
        )
        
        result = await self.db.execute(connection_query)
        connection = result.scalar_one_or_none()
        
        if not connection:
            raise HTTPException(
                status_code=404, 
                detail="GitHub repository not connected to this project"
            )
        
        # Check if task already exists for this issue
        task_query = select(Task).where(
            and_(
                Task.project_id == request.project_id,
                Task.github_issue_number == issue_number
            )
        )
        
        result = await self.db.execute(task_query)
        existing_task = result.scalar_one_or_none()
        
        if existing_task:
            raise HTTPException(
                status_code=409, 
                detail=f"Task already exists for GitHub issue #{issue_number}"
            )
        
        # Fetch issue details from GitHub
        token = self.token_encryption.decrypt_token(connection.encrypted_token)
        client = GitHubClient(token)
        
        issues_data, _ = await client.get_repository_issues(
            repository=repository,
            state="all",  # Include both open and closed issues
            page=1,
            per_page=100
        )
        
        # Find the specific issue
        issue_data = None
        for issue in issues_data:
            if issue["number"] == issue_number:
                issue_data = issue
                break
        
        if not issue_data:
            raise HTTPException(
                status_code=404, 
                detail=f"GitHub issue #{issue_number} not found"
            )
        
        # Create task
        task_name = f"Issue #{issue_number}: {issue_data['title']}"
        task_description = issue_data.get("body", "")
        
        # Generate command based on issue
        command = f"# Task created from GitHub issue #{issue_number}\n"
        command += f"# Repository: {repository}\n"
        command += f"# Issue URL: {issue_data['html_url']}\n\n"
        command += f"echo 'Processing GitHub issue: {issue_data['title']}'\n"
        command += "echo 'TODO: Implement solution for this issue'"
        
        # Combine GitHub labels with additional tags
        all_tags = [label["name"] for label in issue_data.get("labels", [])]
        if request.additional_tags:
            all_tags.extend(request.additional_tags)
        
        # Create task instance
        task = Task(
            project_id=request.project_id,
            name=task_name[:255],  # Ensure it fits in database column
            description=task_description,
            command=command,
            status=TaskStatus.PENDING,
            priority=request.priority,
            tags=all_tags,
            github_issue_number=issue_number,
            github_connection_id=connection.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        
        return {
            "task_id": str(task.id),
            "github_issue_number": issue_number,
            "created_at": task.created_at.isoformat()
        }
    
    async def get_connection(self, project_id: str) -> Optional[GitHubConnectionResponse]:
        """
        Get GitHub connection for a project.
        
        Args:
            project_id: Project ID
            
        Returns:
            GitHubConnectionResponse or None if not connected
        """
        query = select(GitHubConnection).where(
            GitHubConnection.project_id == project_id
        )
        
        result = await self.db.execute(query)
        connection = result.scalar_one_or_none()
        
        if not connection:
            return None
        
        return GitHubConnectionResponse(
            id=str(connection.id),
            repository=connection.repository,
            username=connection.username,
            connected_at=connection.created_at,
            project_id=connection.project_id,
            status=connection.status
        )
    
    async def disconnect_repository(self, project_id: str) -> bool:
        """
        Disconnect GitHub repository from project.
        
        Args:
            project_id: Project ID
            
        Returns:
            True if disconnected, False if no connection found
        """
        query = select(GitHubConnection).where(
            GitHubConnection.project_id == project_id
        )
        
        result = await self.db.execute(query)
        connection = result.scalar_one_or_none()
        
        if not connection:
            return False
        
        await self.db.delete(connection)
        await self.db.commit()
        
        return True