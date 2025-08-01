"""GitHub integration API endpoints."""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models.schemas import (
    GitHubConnectionRequest,
    GitHubConnectionResponse,
    GitHubIssueResponse,
    GitHubIssuesListResponse,
    CreateTaskFromIssueRequest,
    CreateTaskFromIssueResponse,
    ErrorResponse
)
from app.services.github_service import GitHubService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/github", tags=["github"])


@router.post("/connect", response_model=GitHubConnectionResponse)
async def connect_github_repository(
    request: GitHubConnectionRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Connect a GitHub repository to a project.
    
    Args:
        request: GitHub connection request data
        db: Database session
        
    Returns:
        GitHubConnectionResponse with connection details
        
    Raises:
        HTTPException: If connection fails or already exists
    """
    logger.info(f"Connecting GitHub repository {request.repository} to project {request.project_id}")
    
    service = GitHubService(db)
    
    try:
        connection = await service.connect_repository(request)
        logger.info(f"Successfully connected repository {request.repository}")
        return connection
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to connect repository {request.repository}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error connecting to GitHub")


@router.get("/repositories/{owner}/{repo}/issues", response_model=GitHubIssuesListResponse)
async def get_repository_issues(
    owner: str,
    repo: str,
    project_id: Optional[str] = Query(None, description="Project ID for connection lookup"),
    state: str = Query("open", description="Issue state filter", enum=["open", "closed", "all"]),
    labels: Optional[str] = Query(None, description="Comma-separated list of labels"),
    page: int = Query(1, description="Page number", ge=1),
    limit: int = Query(50, description="Issues per page", ge=1, le=100),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get issues from a GitHub repository.
    
    Args:
        owner: Repository owner
        repo: Repository name
        project_id: Optional project ID for connection lookup
        state: Issue state filter (open, closed, all)
        labels: Comma-separated list of labels to filter by
        page: Page number for pagination
        limit: Number of issues per page
        db: Database session
        
    Returns:
        GitHubIssuesListResponse with issues data
        
    Raises:
        HTTPException: If repository not connected or GitHub API fails
    """
    logger.info(f"Fetching issues for repository {owner}/{repo}, page {page}")
    
    service = GitHubService(db)
    
    try:
        # Parse labels if provided
        labels_list = []
        if labels:
            labels_list = [label.strip() for label in labels.split(',') if label.strip()]
        
        issues, total, has_more = await service.get_repository_issues(
            owner=owner,
            repo=repo,
            project_id=project_id,
            state=state,
            labels=labels_list,
            page=page,
            limit=limit
        )
        
        logger.info(f"Retrieved {len(issues)} issues from {owner}/{repo}")
        
        return GitHubIssuesListResponse(
            issues=issues,
            total=total,
            page=page,
            has_more=has_more
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch issues for {owner}/{repo}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error fetching GitHub issues")


@router.post("/issues/{issue_number}/create-task", response_model=CreateTaskFromIssueResponse)
async def create_task_from_issue(
    issue_number: int,
    request: CreateTaskFromIssueRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Create a task from a GitHub issue.
    
    Args:
        issue_number: GitHub issue number
        request: Task creation request data
        db: Database session
        
    Returns:
        CreateTaskFromIssueResponse with task details
        
    Raises:
        HTTPException: If issue not found or task already exists
    """
    logger.info(f"Creating task from GitHub issue #{issue_number} in repository {request.repository}")
    
    service = GitHubService(db)
    
    try:
        task_data = await service.create_task_from_issue(issue_number, request)
        
        logger.info(f"Successfully created task {task_data['task_id']} from issue #{issue_number}")
        
        return CreateTaskFromIssueResponse(
            task_id=task_data['task_id'],
            github_issue_number=issue_number,
            created_at=task_data['created_at']
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create task from issue #{issue_number}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error creating task from issue")


@router.get("/connections/{project_id}", response_model=Optional[GitHubConnectionResponse])
async def get_github_connection(
    project_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get GitHub connection for a project.
    
    Args:
        project_id: Project ID
        db: Database session
        
    Returns:
        GitHubConnectionResponse or None if not connected
        
    Raises:
        HTTPException: If project not found
    """
    logger.info(f"Getting GitHub connection for project {project_id}")
    
    service = GitHubService(db)
    
    try:
        connection = await service.get_connection(project_id)
        
        if connection:
            logger.info(f"Found GitHub connection for project {project_id}: {connection.repository}")
        else:
            logger.info(f"No GitHub connection found for project {project_id}")
        
        return connection
    
    except Exception as e:
        logger.error(f"Failed to get GitHub connection for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error getting GitHub connection")


@router.delete("/connections/{project_id}")
async def disconnect_github_repository(
    project_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Disconnect GitHub repository from project.
    
    Args:
        project_id: Project ID
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If no connection found
    """
    logger.info(f"Disconnecting GitHub repository for project {project_id}")
    
    service = GitHubService(db)
    
    try:
        success = await service.disconnect_repository(project_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="No GitHub connection found for this project")
        
        logger.info(f"Successfully disconnected GitHub repository for project {project_id}")
        
        return {"message": "GitHub repository disconnected successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to disconnect GitHub repository for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error disconnecting GitHub repository")


@router.get("/health")
async def github_health_check():
    """
    GitHub integration health check.
    
    Returns:
        Health status information
    """
    return {
        "status": "healthy",
        "service": "github-integration",
        "features": {
            "repository_connection": True,
            "issue_fetching": True,
            "task_creation": True,
            "token_encryption": True
        }
    }