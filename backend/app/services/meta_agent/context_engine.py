"""
Context Engine for Meta-Agent System v4.0

Manages context retrieval, embeddings, and semantic search for agent operations.
Addresses Brooklyn guy's criticism about lack of real documentation.
"""

import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from pathlib import Path
import logging

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import sqlite3
from pydantic import BaseModel, Field

from app.core.logging_config import get_logger
from app.services.redis_client import RedisClient
from app.services.meta_agent.fresh_context_reader import FreshContextReader, fresh_reader

logger = get_logger(__name__)


@dataclass
class ContextItem:
    """Context item with embeddings and metadata."""
    id: str
    content: str
    context_type: str
    embeddings: np.ndarray
    metadata: Dict[str, Any]
    created_at: datetime
    relevance_score: Optional[float] = None


class ContextQuery(BaseModel):
    """Context query parameters."""
    query_text: str = Field(..., description="Query text for context retrieval")
    context_types: List[str] = Field(default=[], description="Filter by context types")
    max_results: int = Field(default=10, description="Maximum results to return")
    min_similarity: float = Field(default=0.5, description="Minimum similarity threshold")
    include_metadata: bool = Field(default=True, description="Include metadata in results")


class ContextEngine:
    """
    Context Engine for Meta-Agent System v4.0
    
    Provides semantic search, context retrieval, and documentation management
    for agent operations. Uses local embeddings model for privacy.
    """
    
    def __init__(self, redis_client: RedisClient, db_path: str = "context_engine.db"):
        self.redis_client = redis_client
        self.db_path = db_path
        self.model = None
        self._embedding_cache = {}
        self._init_database()
        
    async def initialize(self):
        """Initialize the context engine with embedding model."""
        try:
            logger.info("Initializing Context Engine with SentenceTransformers model")
            # Use a lightweight, fast model for embeddings
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            await self._load_default_contexts()
            logger.info("Context Engine initialization completed")
        except Exception as e:
            logger.error(f"Failed to initialize Context Engine: {e}")
            raise
    
    def _init_database(self):
        """Initialize SQLite database for context storage."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS context_items (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    context_type TEXT NOT NULL,
                    embeddings BLOB,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_context_type 
                ON context_items(context_type)
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_created_at 
                ON context_items(created_at)
            """)
    
    async def add_context(
        self, 
        content: str, 
        context_type: str, 
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Add context item with embeddings."""
        try:
            # Generate unique ID
            context_id = f"{context_type}_{hash(content)}_{int(datetime.now().timestamp())}"
            
            # Generate embeddings
            embeddings = await self._generate_embeddings(content)
            
            # Store in database
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO context_items 
                    (id, content, context_type, embeddings, metadata)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    context_id,
                    content,
                    context_type,
                    embeddings.tobytes(),
                    json.dumps(metadata or {})
                ))
            
            # Cache in Redis for fast access
            await self.redis_client.set(
                f"context:{context_id}",
                json.dumps({
                    "content": content,
                    "context_type": context_type,
                    "metadata": metadata or {}
                }),
                expire=3600  # 1 hour cache
            )
            
            logger.info(f"Added context item: {context_id}")
            return context_id
            
        except Exception as e:
            logger.error(f"Failed to add context: {e}")
            raise
    
    async def search_context(self, query: ContextQuery) -> List[ContextItem]:
        """Search for relevant context items using semantic similarity."""
        try:
            # Generate query embeddings
            query_embeddings = await self._generate_embeddings(query.query_text)
            
            # Retrieve candidates from database
            candidates = self._get_context_candidates(query.context_types)
            
            # Calculate similarities
            similarities = []
            for candidate in candidates:
                candidate_embeddings = np.frombuffer(candidate[3], dtype=np.float32)
                similarity = cosine_similarity(
                    query_embeddings.reshape(1, -1),
                    candidate_embeddings.reshape(1, -1)
                )[0][0]
                
                if similarity >= query.min_similarity:
                    similarities.append((candidate, similarity))
            
            # Sort by similarity and limit results
            similarities.sort(key=lambda x: x[1], reverse=True)
            top_results = similarities[:query.max_results]
            
            # Create ContextItem objects
            results = []
            for (item_data, similarity) in top_results:
                metadata = json.loads(item_data[4]) if item_data[4] else {}
                
                context_item = ContextItem(
                    id=item_data[0],
                    content=item_data[1],
                    context_type=item_data[2],
                    embeddings=np.frombuffer(item_data[3], dtype=np.float32),
                    metadata=metadata if query.include_metadata else {},
                    created_at=datetime.fromisoformat(item_data[5]),
                    relevance_score=similarity
                )
                results.append(context_item)
            
            logger.info(f"Found {len(results)} relevant context items for query")
            return results
            
        except Exception as e:
            logger.error(f"Context search failed: {e}")
            return []
    
    async def get_context_for_agent(
        self, 
        agent_name: str, 
        task_description: str
    ) -> List[ContextItem]:
        """Get relevant context for specific agent and task."""
        try:
            # Combine agent name and task for comprehensive context search
            combined_query = f"Agent: {agent_name} Task: {task_description}"
            
            query = ContextQuery(
                query_text=combined_query,
                context_types=[
                    "agent_capabilities",
                    "task_patterns",
                    "best_practices",
                    "security_guidelines",
                    "integration_docs"
                ],
                max_results=15,
                min_similarity=0.3
            )
            
            context_items = await self.search_context(query)
            
            # Add agent-specific context
            agent_context = await self._get_agent_specific_context(agent_name)
            context_items.extend(agent_context)
            
            # Sort by relevance
            context_items.sort(key=lambda x: x.relevance_score or 0, reverse=True)
            
            return context_items[:10]  # Return top 10 most relevant
            
        except Exception as e:
            logger.error(f"Failed to get context for agent {agent_name}: {e}")
            return []
    
    async def _generate_embeddings(self, text: str) -> np.ndarray:
        """Generate embeddings for text with caching."""
        # Check cache first
        text_hash = str(hash(text))
        if text_hash in self._embedding_cache:
            return self._embedding_cache[text_hash]
        
        # Generate embeddings
        embeddings = self.model.encode(text, convert_to_numpy=True)
        
        # Cache embeddings (limit cache size)
        if len(self._embedding_cache) < 1000:
            self._embedding_cache[text_hash] = embeddings
        
        return embeddings
    
    def _get_context_candidates(self, context_types: List[str]) -> List[tuple]:
        """Get context candidates from database."""
        with sqlite3.connect(self.db_path) as conn:
            if context_types:
                placeholders = ','.join('?' * len(context_types))
                query = f"""
                    SELECT id, content, context_type, embeddings, metadata, created_at
                    FROM context_items 
                    WHERE context_type IN ({placeholders})
                    ORDER BY created_at DESC
                """
                return conn.execute(query, context_types).fetchall()
            else:
                return conn.execute("""
                    SELECT id, content, context_type, embeddings, metadata, created_at
                    FROM context_items 
                    ORDER BY created_at DESC
                """).fetchall()
    
    async def _get_agent_specific_context(self, agent_name: str) -> List[ContextItem]:
        """Get agent-specific context and capabilities."""
        try:
            # Load agent definition from file system
            agent_path = Path(f"/Users/don/.claude/agents/{agent_name}.md")
            if not agent_path.exists():
                return []
            
            agent_content = agent_path.read_text()
            
            # Create context item for agent capabilities
            context_item = ContextItem(
                id=f"agent_def_{agent_name}",
                content=agent_content,
                context_type="agent_definition",
                embeddings=await self._generate_embeddings(agent_content),
                metadata={"agent_name": agent_name},
                created_at=datetime.now(),
                relevance_score=1.0  # Highest relevance for agent's own definition
            )
            
            return [context_item]
            
        except Exception as e:
            logger.warning(f"Could not load agent-specific context for {agent_name}: {e}")
            return []
    
    async def _load_default_contexts(self):
        """Load default contexts for common patterns and best practices."""
        default_contexts = [
            {
                "content": "When breaking down complex tasks, create micro-tasks that are verifiable, atomic, and can be completed in under 10 minutes.",
                "context_type": "task_patterns",
                "metadata": {"source": "best_practices", "priority": "high"}
            },
            {
                "content": "Always validate user inputs and sanitize commands before execution to prevent injection attacks.",
                "context_type": "security_guidelines",
                "metadata": {"owasp_category": "A03_Injection", "priority": "critical"}
            },
            {
                "content": "Generate external validation URLs and cryptographic proofs for all micro-task executions to address external verification requirements.",
                "context_type": "best_practices",
                "metadata": {"addresses": "brooklyn_guy_criticism", "priority": "high"}
            },
            {
                "content": "Document all API endpoints with OpenAPI schemas and provide comprehensive testing examples.",
                "context_type": "integration_docs",
                "metadata": {"documentation_type": "api", "priority": "medium"}
            }
        ]
        
        for context in default_contexts:
            await self.add_context(**context)


class DocumentationLibrary:
    """
    Documentation Library for Meta-Agent System v4.0
    
    Manages structured documentation, API specs, and knowledge base
    for agent operations and system integration.
    """
    
    def __init__(self, context_engine: ContextEngine):
        self.context_engine = context_engine
        self.doc_types = {
            "api_specs": "API documentation and OpenAPI schemas",
            "agent_guides": "Agent usage guides and examples",
            "integration_docs": "System integration documentation",
            "troubleshooting": "Common issues and solutions",
            "security_docs": "Security guidelines and best practices"
        }
    
    async def add_documentation(
        self,
        doc_type: str,
        title: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Add documentation to the library."""
        if doc_type not in self.doc_types:
            raise ValueError(f"Invalid doc_type. Must be one of: {list(self.doc_types.keys())}")
        
        # Enhanced metadata for documentation
        doc_metadata = {
            "title": title,
            "doc_type": doc_type,
            "last_updated": datetime.now().isoformat(),
            **(metadata or {})
        }
        
        return await self.context_engine.add_context(
            content=content,
            context_type=doc_type,
            metadata=doc_metadata
        )
    
    async def search_documentation(
        self,
        query_text: str,
        doc_types: Optional[List[str]] = None
    ) -> List[ContextItem]:
        """Search documentation by text query."""
        valid_doc_types = doc_types or list(self.doc_types.keys())
        
        query = ContextQuery(
            query_text=query_text,
            context_types=valid_doc_types,
            max_results=20,
            min_similarity=0.4
        )
        
        return await self.context_engine.search_context(query)
    
    async def get_agent_documentation(self, agent_name: str) -> List[ContextItem]:
        """Get all documentation related to a specific agent."""
        query = ContextQuery(
            query_text=f"agent {agent_name} usage guide examples",
            context_types=["agent_guides", "api_specs", "integration_docs"],
            max_results=15,
            min_similarity=0.3
        )
        
        return await self.context_engine.search_context(query)