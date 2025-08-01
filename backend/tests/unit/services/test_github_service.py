"""Unit tests for GitHub service."""

import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime

from app.services.github_service import GitHubService, GitHubClient, GitHubTokenEncryption
from app.models.schemas import GitHubConnectionRequest, TaskPriority
from fastapi import HTTPException


class TestGitHubTokenEncryption:
    """Test token encryption functionality."""
    
    def test_encrypt_decrypt_token(self):
        """Test token encryption and decryption."""
        encryption = GitHubTokenEncryption()
        original_token = "ghp_test_token_123456789"
        
        # Encrypt token
        encrypted = encryption.encrypt_token(original_token)
        assert encrypted != original_token
        assert isinstance(encrypted, str)
        
        # Decrypt token
        decrypted = encryption.decrypt_token(encrypted)
        assert decrypted == original_token


class TestGitHubClient:
    """Test GitHub API client."""
    
    @pytest.fixture
    def github_client(self):
        """Create GitHub client for testing."""
        return GitHubClient("ghp_test_token")
    
    @pytest.mark.asyncio
    async def test_validate_token_and_repo_success(self, github_client):
        """Test successful token and repository validation."""
        mock_responses = [
            Mock(status_code=200, json=lambda: {"login": "testuser"}),
            Mock(status_code=200, json=lambda: {"name": "test-repo"})
        ]
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                side_effect=mock_responses
            )
            
            username, is_valid = await github_client.validate_token_and_repo("owner/repo")
            
            assert username == "testuser"
            assert is_valid is True
    
    @pytest.mark.asyncio
    async def test_validate_token_invalid(self, github_client):
        """Test invalid token handling."""
        mock_response = Mock(status_code=401)
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )
            
            with pytest.raises(HTTPException) as exc_info:
                await github_client.validate_token_and_repo("owner/repo")
            
            assert exc_info.value.status_code == 401
            assert "Invalid GitHub token" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_validate_repo_not_found(self, github_client):
        """Test repository not found handling."""
        mock_responses = [
            Mock(status_code=200, json=lambda: {"login": "testuser"}),
            Mock(status_code=404)
        ]
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                side_effect=mock_responses
            )
            
            with pytest.raises(HTTPException) as exc_info:
                await github_client.validate_token_and_repo("owner/repo")
            
            assert exc_info.value.status_code == 404
            assert "Repository not found" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_get_repository_issues_success(self, github_client):
        """Test successful issue fetching."""
        mock_issues = [
            {
                "number": 1,
                "title": "Test Issue",
                "body": "Test body",
                "state": "open",
                "labels": [{"name": "bug"}],
                "assignees": [{"login": "developer"}],
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z",
                "html_url": "https://github.com/owner/repo/issues/1"
            }
        ]
        
        mock_response = Mock(
            status_code=200,
            json=lambda: mock_issues,
            headers={"Link": ""}
        )
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )
            
            issues, has_more = await github_client.get_repository_issues("owner/repo")
            
            assert len(issues) == 1
            assert issues[0]["number"] == 1
            assert issues[0]["title"] == "Test Issue"
            assert has_more is False


class TestGitHubService:
    """Test GitHub service business logic."""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session."""
        return AsyncMock()
    
    @pytest.fixture
    def github_service(self, mock_db):
        """Create GitHub service for testing."""
        return GitHubService(mock_db)
    
    @pytest.mark.asyncio
    async def test_connect_repository_success(self, github_service, mock_db):
        """Test successful repository connection."""
        request = GitHubConnectionRequest(
            token="ghp_test_token",
            repository="owner/repo",
            project_id="project-123"
        )
        
        # Mock GitHubClient validation
        with patch('app.services.github_service.GitHubClient') as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.validate_token_and_repo = AsyncMock(return_value=("testuser", True))
            
            # Mock database query (no existing connection)
            mock_db.execute = AsyncMock()
            mock_db.execute.return_value.scalar_one_or_none.return_value = None
            
            # Mock database operations
            mock_db.add = Mock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock()
            
            # Mock the connection object that gets created
            mock_connection = Mock()
            mock_connection.id = "conn-123"
            mock_connection.repository = "owner/repo"
            mock_connection.username = "testuser"
            mock_connection.created_at = datetime.now()
            mock_connection.project_id = "project-123"
            mock_connection.status = "active"
            
            # Make refresh set up the mock connection
            async def mock_refresh(obj):
                obj.id = mock_connection.id
                obj.repository = mock_connection.repository
                obj.username = mock_connection.username
                obj.created_at = mock_connection.created_at
                obj.project_id = mock_connection.project_id
                obj.status = mock_connection.status
            
            mock_db.refresh.side_effect = mock_refresh
            
            response = await github_service.connect_repository(request)
            
            assert response.repository == "owner/repo"
            assert response.username == "testuser"
            assert response.project_id == "project-123"
            assert response.status == "active"
    
    @pytest.mark.asyncio
    async def test_connect_repository_already_exists(self, github_service, mock_db):
        """Test connection when repository already connected."""
        request = GitHubConnectionRequest(
            token="ghp_test_token",
            repository="owner/repo",
            project_id="project-123"
        )
        
        # Mock existing connection
        existing_connection = Mock()
        mock_db.execute = AsyncMock()
        mock_db.execute.return_value.scalar_one_or_none.return_value = existing_connection
        
        with pytest.raises(HTTPException) as exc_info:
            await github_service.connect_repository(request)
        
        assert exc_info.value.status_code == 409
        assert "already connected" in str(exc_info.value.detail)


if __name__ == "__main__":
    pytest.main([__file__])