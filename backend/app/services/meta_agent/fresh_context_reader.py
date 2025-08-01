"""
Fresh Context Reader for Meta-Agent System v4.0

Ensures that all context is read fresh from disk, not from cache.
Addresses the criticism about stale context and cached reads.
"""

import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
import logging

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class FreshContextReader:
    """
    Reads context files fresh from disk every time.
    
    No caching, no memory storage - just fresh reads.
    This ensures decisions are based on current state, not stale data.
    """
    
    def __init__(self, project_dir: Optional[Path] = None):
        self.project_dir = Path(project_dir) if project_dir else Path.cwd()
        self.reads_log = []  # Track all reads for audit
        
    def read_fresh(self, file_path: str, relative_to_project: bool = True) -> Optional[str]:
        """
        Read a file fresh from disk with timestamp.
        
        Args:
            file_path: Path to the file
            relative_to_project: If True, path is relative to project directory
            
        Returns:
            File content with timestamp header, or None if file doesn't exist
        """
        try:
            if relative_to_project:
                full_path = self.project_dir / file_path
            else:
                full_path = Path(file_path)
                
            if not full_path.exists():
                logger.warning(f"File not found for fresh read: {full_path}")
                return None
                
            # Read the file fresh
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Log the read
            read_timestamp = datetime.utcnow()
            self.reads_log.append({
                "file": str(full_path),
                "timestamp": read_timestamp.isoformat(),
                "size": len(content)
            })
            
            # Return with timestamp header
            header = f"[FRESH READ at {read_timestamp.isoformat()}]\n"
            header += f"[File: {full_path}]\n"
            header += f"[Size: {len(content)} bytes]\n"
            header += "-" * 80 + "\n"
            
            return header + content
            
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return None
    
    def read_claude_md(self) -> Optional[str]:
        """Read CLAUDE.md fresh from disk."""
        return self.read_fresh("CLAUDE.md")
    
    def read_task_md(self, task_id: str) -> Optional[str]:
        """Read task.md for a specific task fresh from disk."""
        task_path = f"tasks/{task_id}/task.md"
        return self.read_fresh(task_path)
    
    def read_resource(self, resource_type: str, resource_name: str) -> Optional[str]:
        """
        Read from resource library fresh.
        
        Args:
            resource_type: 'project', 'dependencies', or 'tasks'
            resource_name: Name of the resource file
        """
        resource_path = f".claude/meta-agent/resource-library/{resource_type}/{resource_name}"
        return self.read_fresh(resource_path)
    
    def get_all_project_docs(self) -> Dict[str, Optional[str]]:
        """Read all key project documents fresh."""
        docs = {
            "CLAUDE.md": self.read_claude_md(),
            "README.md": self.read_fresh("README.md"),
            "project-structure.md": self.read_fresh("docs/project-structure.md"),
        }
        
        # Remove None values
        return {k: v for k, v in docs.items() if v is not None}
    
    def get_read_history(self) -> list:
        """Get history of all reads performed."""
        return self.reads_log.copy()


# Global instance for easy access
fresh_reader = FreshContextReader()


def ensure_fresh_context(func):
    """
    Decorator to ensure fresh context is available to functions.
    
    Usage:
        @ensure_fresh_context
        def my_function(fresh_context, ...):
            claude_md = fresh_context['CLAUDE.md']
    """
    def wrapper(*args, **kwargs):
        reader = FreshContextReader()
        fresh_context = reader.get_all_project_docs()
        return func(fresh_context=fresh_context, *args, **kwargs)
    return wrapper