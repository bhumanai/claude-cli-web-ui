"""
Meta-Agent System v4.0

A comprehensive system for agent orchestration with context management,
micro-task execution, and external validation.
"""

from .context_engine import ContextEngine, DocumentationLibrary, ContextQuery, ContextItem

__version__ = "4.0.0"
__all__ = [
    "ContextEngine",
    "DocumentationLibrary", 
    "ContextQuery",
    "ContextItem"
]