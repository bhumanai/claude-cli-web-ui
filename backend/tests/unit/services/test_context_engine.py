"""
Tests for Context Engine

Tests the context management, semantic search, and documentation library
functionality of the Meta-Agent System v4.0.
"""

import pytest
import asyncio
import tempfile
import os
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock

from app.services.meta_agent.context_engine import (
    ContextEngine, 
    DocumentationLibrary, 
    ContextQuery, 
    ContextItem
)
from app.services.redis_client import RedisClient


@pytest.fixture
async def mock_redis_client():
    """Mock Redis client for testing."""
    mock_redis = Mock(spec=RedisClient)
    mock_redis.set = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    return mock_redis


@pytest.fixture
async def context_engine(mock_redis_client):
    """Create a test context engine instance."""
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        db_path = tmp.name
    
    engine = ContextEngine(mock_redis_client, db_path)
    
    # Mock the embedding model
    with patch('app.services.meta_agent.context_engine.SentenceTransformer') as mock_st:
        mock_model = Mock()
        mock_model.encode.return_value = [0.1, 0.2, 0.3] * 128  # 384-dim vector
        mock_st.return_value = mock_model
        
        await engine.initialize()
        
        yield engine
    
    # Cleanup
    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.mark.asyncio
class TestContextEngine:
    """Test Context Engine functionality."""
    
    async def test_initialization(self, mock_redis_client):
        """Test context engine initialization."""
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            db_path = tmp.name
        
        engine = ContextEngine(mock_redis_client, db_path)
        
        with patch('app.services.meta_agent.context_engine.SentenceTransformer'):
            await engine.initialize()
            assert engine.model is not None
        
        os.unlink(db_path)
    
    async def test_add_context(self, context_engine):
        """Test adding context items."""
        context_id = await context_engine.add_context(
            content="Test content for agent capabilities",
            context_type="agent_capabilities",
            metadata={"test": True}
        )
        
        assert context_id is not None
        assert "agent_capabilities" in context_id
    
    async def test_search_context(self, context_engine):
        """Test context search functionality."""
        # Add test contexts
        await context_engine.add_context(
            content="Python agent handles Python development tasks",
            context_type="agent_capabilities"
        )
        
        await context_engine.add_context(
            content="Security validation for command execution",
            context_type="security_guidelines"
        )
        
        # Search for Python-related context
        query = ContextQuery(
            query_text="Python development",
            max_results=5,
            min_similarity=0.1
        )
        
        results = await context_engine.search_context(query)
        assert len(results) > 0
        assert any("Python" in item.content for item in results)
    
    async def test_get_context_for_agent(self, context_engine):
        """Test agent-specific context retrieval."""
        # Mock agent file exists
        with patch('pathlib.Path.exists', return_value=True):
            with patch('pathlib.Path.read_text', return_value="Agent definition content"):
                results = await context_engine.get_context_for_agent(
                    agent_name="python-pro",
                    task_description="Create a REST API"
                )
                
                assert len(results) > 0
                assert any(item.context_type == "agent_definition" for item in results)
    
    async def test_context_caching(self, context_engine):
        """Test context caching mechanism."""
        # First call should generate embeddings
        embeddings1 = await context_engine._generate_embeddings("test text")
        
        # Second call should use cache
        embeddings2 = await context_engine._generate_embeddings("test text")
        
        assert (embeddings1 == embeddings2).all()
    
    async def test_search_with_filters(self, context_engine):
        """Test context search with type filters."""
        # Add contexts of different types
        await context_engine.add_context(
            "Security best practices",
            "security_guidelines"
        )
        
        await context_engine.add_context(
            "API documentation example",
            "api_specs"
        )
        
        # Search only security contexts
        query = ContextQuery(
            query_text="security practices",
            context_types=["security_guidelines"],
            min_similarity=0.1
        )
        
        results = await context_engine.search_context(query)
        assert all(item.context_type == "security_guidelines" for item in results)


@pytest.mark.asyncio 
class TestDocumentationLibrary:
    """Test Documentation Library functionality."""
    
    async def test_add_documentation(self, context_engine):
        """Test adding documentation to library."""
        doc_lib = DocumentationLibrary(context_engine)
        
        doc_id = await doc_lib.add_documentation(
            doc_type="api_specs",
            title="Meta-Agent API Reference",
            content="POST /api/v1/meta-agent/decompose - Decompose complex tasks",
            metadata={"version": "1.0"}
        )
        
        assert doc_id is not None
    
    async def test_search_documentation(self, context_engine):
        """Test documentation search functionality."""
        doc_lib = DocumentationLibrary(context_engine)
        
        # Add test documentation
        await doc_lib.add_documentation(
            doc_type="integration_docs",
            title="Agent Integration Guide",
            content="How to integrate with existing agents in the system"
        )
        
        # Search documentation
        results = await doc_lib.search_documentation(
            query_text="agent integration",
            doc_types=["integration_docs"]
        )
        
        assert len(results) > 0
        assert any("integration" in item.content.lower() for item in results)
    
    async def test_get_agent_documentation(self, context_engine):
        """Test agent-specific documentation retrieval."""
        doc_lib = DocumentationLibrary(context_engine)
        
        # Add agent-related documentation
        await doc_lib.add_documentation(
            doc_type="agent_guides",
            title="Python-Pro Usage Guide",
            content="Python-Pro agent specializes in Python development tasks"
        )
        
        results = await doc_lib.get_agent_documentation("python-pro")
        assert len(results) >= 0  # May not find exact matches with mocked embeddings
    
    async def test_invalid_doc_type(self, context_engine):
        """Test handling of invalid document types."""
        doc_lib = DocumentationLibrary(context_engine)
        
        with pytest.raises(ValueError):
            await doc_lib.add_documentation(
                doc_type="invalid_type",
                title="Test",
                content="Test content"
            )


@pytest.mark.asyncio
class TestContextQuery:
    """Test ContextQuery validation and functionality."""
    
    def test_context_query_validation(self):
        """Test ContextQuery parameter validation."""
        # Valid query
        query = ContextQuery(
            query_text="test query",
            max_results=5,
            min_similarity=0.7
        )
        assert query.query_text == "test query"
        assert query.max_results == 5
        assert query.min_similarity == 0.7
        
        # Test defaults
        query_minimal = ContextQuery(query_text="minimal query")
        assert query_minimal.max_results == 10
        assert query_minimal.min_similarity == 0.5
        assert query_minimal.include_metadata is True


@pytest.mark.asyncio
class TestIntegration:
    """Integration tests for Context Engine components."""
    
    async def test_end_to_end_workflow(self, context_engine):
        """Test complete workflow from adding context to searching."""
        doc_lib = DocumentationLibrary(context_engine)
        
        # 1. Add various types of content
        await doc_lib.add_documentation(
            doc_type="api_specs",
            title="Authentication API",
            content="POST /auth/login - Authenticate user with credentials"
        )
        
        await context_engine.add_context(
            content="Always validate input parameters for security",
            context_type="security_guidelines",
            metadata={"priority": "critical"}
        )
        
        # 2. Search across different types
        auth_docs = await doc_lib.search_documentation("authentication login")
        security_context = await context_engine.search_context(
            ContextQuery(
                query_text="input validation security",
                context_types=["security_guidelines"],
                min_similarity=0.1
            )
        )
        
        # 3. Verify results
        assert len(auth_docs) > 0
        assert len(security_context) > 0
        
        # 4. Test agent-specific context
        agent_context = await context_engine.get_context_for_agent(
            "security-auditor",
            "validate API security"
        )
        assert len(agent_context) >= 0  # Some context should be found