"""Project management service."""

from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging_config import get_logger
from app.models.database import Project, ProjectStatus, Task, TaskQueue

logger = get_logger(__name__)


class ProjectService:
    """Service for managing projects."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create_project(
        self,
        name: str,
        description: Optional[str] = None,
        config: Optional[Dict] = None,
        tags: Optional[List[str]] = None
    ) -> Project:
        """
        Create a new project.
        
        Args:
            name: Project name
            description: Project description
            config: Project configuration
            tags: Project tags
            
        Returns:
            Created project
            
        Raises:
            ValueError: If project name already exists
        """
        logger.info("Creating project", name=name)
        
        # Check if project name already exists
        existing = await self.get_project_by_name(name)
        if existing:
            raise ValueError(f"Project with name '{name}' already exists")
        
        # Create project
        project = Project(
            name=name,
            description=description,
            config=config or {},
            tags=tags or [],
            status=ProjectStatus.ACTIVE
        )
        
        self.session.add(project)
        await self.session.commit()
        await self.session.refresh(project)
        
        logger.info("Project created successfully", 
                   project_id=project.id, name=name)
        
        return project
    
    async def get_project(self, project_id: str) -> Optional[Project]:
        """
        Get project by ID.
        
        Args:
            project_id: Project ID
            
        Returns:
            Project if found, None otherwise
        """
        result = await self.session.execute(
            select(Project)
            .options(
                selectinload(Project.task_queues),
                selectinload(Project.tasks)
            )
            .where(Project.id == project_id)
        )
        return result.scalar_one_or_none()
    
    async def get_project_by_name(self, name: str) -> Optional[Project]:
        """
        Get project by name.
        
        Args:
            name: Project name
            
        Returns:
            Project if found, None otherwise
        """
        result = await self.session.execute(
            select(Project)
            .where(Project.name == name)
        )
        return result.scalar_one_or_none()
    
    async def list_projects(
        self,
        status: Optional[ProjectStatus] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Project]:
        """
        List projects with optional filtering.
        
        Args:
            status: Filter by project status
            tags: Filter by tags (projects must have all specified tags)
            search: Search in name and description
            limit: Maximum number of projects to return
            offset: Number of projects to skip
            
        Returns:
            List of projects
        """
        query = select(Project).options(
            selectinload(Project.task_queues),
            selectinload(Project.tasks)
        )
        
        # Apply filters
        conditions = []
        
        if status:
            conditions.append(Project.status == status)
        
        if tags:
            # Projects must have all specified tags
            for tag in tags:
                conditions.append(Project.tags.contains([tag]))
        
        if search:
            search_term = f"%{search}%"
            conditions.append(
                or_(
                    Project.name.ilike(search_term),
                    Project.description.ilike(search_term)
                )
            )
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # Apply ordering and pagination
        query = query.order_by(desc(Project.created_at)).limit(limit).offset(offset)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_project(
        self,
        project_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[ProjectStatus] = None,
        config: Optional[Dict] = None,
        tags: Optional[List[str]] = None
    ) -> Optional[Project]:
        """
        Update project.
        
        Args:
            project_id: Project ID
            name: New project name
            description: New project description
            status: New project status
            config: New project configuration
            tags: New project tags
            
        Returns:
            Updated project if found, None otherwise
            
        Raises:
            ValueError: If new name already exists for another project
        """
        project = await self.get_project(project_id)
        if not project:
            return None
        
        logger.info("Updating project", project_id=project_id)
        
        # Check if new name conflicts with existing project
        if name and name != project.name:
            existing = await self.get_project_by_name(name)
            if existing and existing.id != project_id:
                raise ValueError(f"Project with name '{name}' already exists")
            project.name = name
        
        # Update fields
        if description is not None:
            project.description = description
        
        if status is not None:
            project.status = status
            if status == ProjectStatus.ARCHIVED:
                project.archived_at = datetime.utcnow()
            elif project.archived_at:
                project.archived_at = None
        
        if config is not None:
            project.config = config
        
        if tags is not None:
            project.tags = tags
        
        await self.session.commit()
        await self.session.refresh(project)
        
        logger.info("Project updated successfully", project_id=project_id)
        
        return project
    
    async def delete_project(self, project_id: str) -> bool:
        """
        Delete project and all associated data.
        
        Args:
            project_id: Project ID
            
        Returns:
            True if project was deleted, False if not found
        """
        project = await self.get_project(project_id)
        if not project:
            return False
        
        logger.warning("Deleting project", project_id=project_id, name=project.name)
        
        await self.session.delete(project)
        await self.session.commit()
        
        logger.warning("Project deleted successfully", project_id=project_id)
        
        return True
    
    async def archive_project(self, project_id: str) -> Optional[Project]:
        """
        Archive project.
        
        Args:
            project_id: Project ID
            
        Returns:
            Archived project if found, None otherwise
        """
        return await self.update_project(
            project_id=project_id,
            status=ProjectStatus.ARCHIVED
        )
    
    async def get_project_stats(self, project_id: str) -> Optional[Dict]:
        """
        Get project statistics.
        
        Args:
            project_id: Project ID
            
        Returns:
            Project statistics if project found, None otherwise
        """
        project = await self.get_project(project_id)
        if not project:
            return None
        
        # Get task counts by status
        task_stats_result = await self.session.execute(
            select(
                Task.status,
                func.count(Task.id).label('count')
            )
            .where(Task.project_id == project_id)
            .group_by(Task.status)
        )
        
        task_stats = {row.status: row.count for row in task_stats_result}
        
        # Get queue count
        queue_count_result = await self.session.execute(
            select(func.count(TaskQueue.id))
            .where(TaskQueue.project_id == project_id)
        )
        queue_count = queue_count_result.scalar() or 0
        
        # Get total task count
        total_tasks = sum(task_stats.values())
        
        return {
            "project_id": project_id,
            "name": project.name,
            "status": project.status,
            "total_tasks": total_tasks,
            "total_queues": queue_count,
            "task_stats": task_stats,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
            "archived_at": project.archived_at
        }
    
    async def list_project_tasks(
        self,
        project_id: str,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Task]:
        """
        List tasks for a project.
        
        Args:
            project_id: Project ID
            status: Filter by task status
            limit: Maximum number of tasks to return
            offset: Number of tasks to skip
            
        Returns:
            List of tasks
        """
        query = select(Task).where(Task.project_id == project_id)
        
        if status:
            query = query.where(Task.status == status)
        
        query = query.order_by(desc(Task.created_at)).limit(limit).offset(offset)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_project_queues(self, project_id: str) -> List[TaskQueue]:
        """
        List task queues for a project.
        
        Args:
            project_id: Project ID
            
        Returns:
            List of task queues
        """
        result = await self.session.execute(
            select(TaskQueue)
            .where(TaskQueue.project_id == project_id)
            .order_by(TaskQueue.name)
        )
        return list(result.scalars().all())
    
    async def get_projects_summary(self) -> Dict:
        """
        Get summary statistics for all projects.
        
        Returns:
            Summary statistics
        """
        # Count projects by status
        project_stats_result = await self.session.execute(
            select(
                Project.status,
                func.count(Project.id).label('count')
            )
            .group_by(Project.status)
        )
        
        project_stats = {row.status: row.count for row in project_stats_result}
        
        # Get total counts
        total_projects = sum(project_stats.values())
        
        total_tasks_result = await self.session.execute(
            select(func.count(Task.id))
        )
        total_tasks = total_tasks_result.scalar() or 0
        
        total_queues_result = await self.session.execute(
            select(func.count(TaskQueue.id))
        )
        total_queues = total_queues_result.scalar() or 0
        
        return {
            "total_projects": total_projects,
            "total_tasks": total_tasks,
            "total_queues": total_queues,
            "project_stats": project_stats
        }