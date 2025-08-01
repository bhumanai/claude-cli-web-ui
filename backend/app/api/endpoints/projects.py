"""Project management API endpoints."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models.schemas import (
    ProjectCreateRequest,
    ProjectUpdateRequest,
    ProjectResponse,
    ProjectListResponse,
    ProjectStatsResponse,
    TaskResponse,
    TaskListResponse,
    TaskQueueResponse,
    ErrorResponse
)
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Create a new project.
    
    Args:
        project_data: Project creation data
        db: Database session
        
    Returns:
        Created project
        
    Raises:
        HTTPException: If project name already exists
    """
    service = ProjectService(db)
    
    try:
        project = await service.create_project(
            name=project_data.name,
            description=project_data.description,
            config=project_data.config,
            tags=project_data.tags
        )
        return ProjectResponse.model_validate(project)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    status: Optional[str] = Query(None, description="Filter by project status"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of projects"),
    offset: int = Query(0, ge=0, description="Number of projects to skip"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    List projects with optional filtering.
    
    Args:
        status: Filter by project status
        tags: Filter by tags
        search: Search term
        limit: Maximum number of projects
        offset: Number of projects to skip
        db: Database session
        
    Returns:
        List of projects
    """
    service = ProjectService(db)
    
    # Convert status string to enum if provided
    from app.models.database import ProjectStatus
    status_enum = None
    if status:
        try:
            status_enum = ProjectStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid status '{status}'. Must be one of: {[s.value for s in ProjectStatus]}"
            )
    
    projects = await service.list_projects(
        status=status_enum,
        tags=tags,
        search=search,
        limit=limit,
        offset=offset
    )
    
    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects],
        total=len(projects)
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get project by ID.
    
    Args:
        project_id: Project ID
        db: Database session
        
    Returns:
        Project details
        
    Raises:
        HTTPException: If project not found
    """
    service = ProjectService(db)
    
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectResponse.model_validate(project)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_data: ProjectUpdateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Update project.
    
    Args:
        project_id: Project ID
        project_data: Project update data
        db: Database session
        
    Returns:
        Updated project
        
    Raises:
        HTTPException: If project not found or name already exists
    """
    service = ProjectService(db)
    
    try:
        project = await service.update_project(
            project_id=project_id,
            name=project_data.name,
            description=project_data.description,
            status=project_data.status,
            config=project_data.config,
            tags=project_data.tags
        )
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return ProjectResponse.model_validate(project)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Delete project and all associated data.
    
    Args:
        project_id: Project ID
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If project not found
    """
    service = ProjectService(db)
    
    success = await service.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"message": "Project deleted successfully"}


@router.post("/{project_id}/archive", response_model=ProjectResponse)
async def archive_project(
    project_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Archive project.
    
    Args:
        project_id: Project ID
        db: Database session
        
    Returns:
        Archived project
        
    Raises:
        HTTPException: If project not found
    """
    service = ProjectService(db)
    
    project = await service.archive_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}/stats", response_model=ProjectStatsResponse)
async def get_project_stats(
    project_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get project statistics.
    
    Args:
        project_id: Project ID
        db: Database session
        
    Returns:
        Project statistics
        
    Raises:
        HTTPException: If project not found
    """
    service = ProjectService(db)
    
    stats = await service.get_project_stats(project_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectStatsResponse.model_validate(stats)


@router.get("/{project_id}/tasks", response_model=TaskListResponse)
async def list_project_tasks(
    project_id: str,
    status: Optional[str] = Query(None, description="Filter by task status"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of tasks"),
    offset: int = Query(0, ge=0, description="Number of tasks to skip"),
    db: AsyncSession = Depends(get_db_session)
):
    """
    List tasks for a project.
    
    Args:
        project_id: Project ID
        status: Filter by task status
        limit: Maximum number of tasks
        offset: Number of tasks to skip
        db: Database session
        
    Returns:
        List of tasks
        
    Raises:
        HTTPException: If project not found
    """
    service = ProjectService(db)
    
    # Verify project exists
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    tasks = await service.list_project_tasks(
        project_id=project_id,
        status=status,
        limit=limit,
        offset=offset
    )
    
    return TaskListResponse(
        tasks=[TaskResponse.model_validate(t) for t in tasks],
        total=len(tasks)
    )


@router.get("/{project_id}/queues", response_model=List[TaskQueueResponse])
async def list_project_queues(
    project_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    List task queues for a project.
    
    Args:
        project_id: Project ID
        db: Database session
        
    Returns:
        List of task queues
        
    Raises:
        HTTPException: If project not found
    """
    service = ProjectService(db)
    
    # Verify project exists
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    queues = await service.list_project_queues(project_id)
    
    return [TaskQueueResponse.model_validate(q) for q in queues]


@router.get("/summary/stats")
async def get_projects_summary(
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get summary statistics for all projects.
    
    Args:
        db: Database session
        
    Returns:
        Summary statistics
    """
    service = ProjectService(db)
    
    return await service.get_projects_summary()