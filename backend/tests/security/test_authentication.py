"""Security tests for authentication system."""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta, timezone

from app.core.auth import AuthManager, User
from app.main import create_app


@pytest.fixture
def auth_manager():
    """Create auth manager for testing."""
    return AuthManager()


@pytest.fixture
def client():
    """Create test client."""
    app = create_app()
    return TestClient(app)


@pytest.fixture
def test_user():
    """Create test user."""
    return User(
        user_id="test_user",
        username="testuser",
        hashed_password="$2b$12$test_hash",
        is_active=True,
        created_at=datetime.now(timezone.utc),
        permissions=["execute_commands", "manage_sessions"]
    )


class TestAuthenticationFlow:
    """Test authentication flows."""
    
    def test_login_success(self, client):
        """Test successful login with default admin user."""
        response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert isinstance(data["expires_in"], int)
    
    def test_login_invalid_credentials(self, client):
        """Test login with invalid credentials."""
        response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrong_password"
        })
        
        assert response.status_code == 401
        assert "Invalid username or password" in response.json()["detail"]
    
    def test_login_empty_credentials(self, client):
        """Test login with empty credentials."""
        response = client.post("/api/auth/login", json={
            "username": "",
            "password": ""
        })
        
        assert response.status_code == 400
        assert "Username and password are required" in response.json()["detail"]
    
    def test_login_oversized_credentials(self, client):
        """Test login with oversized credentials."""
        response = client.post("/api/auth/login", json={
            "username": "a" * 101,  # Over 100 chars
            "password": "valid_password"
        })
        
        assert response.status_code == 400
        assert "Username or password too long" in response.json()["detail"]
    
    def test_access_protected_endpoint_without_token(self, client):
        """Test accessing protected endpoint without token."""
        response = client.get("/api/auth/me")
        
        assert response.status_code == 401
        assert "Not authenticated" in response.json()["detail"]
    
    def test_access_protected_endpoint_with_valid_token(self, client):
        """Test accessing protected endpoint with valid token."""
        # First login to get token
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        
        # Use token to access protected endpoint
        response = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"
        assert "admin" in data["permissions"]
    
    def test_access_protected_endpoint_with_invalid_token(self, client):
        """Test accessing protected endpoint with invalid token."""
        response = client.get("/api/auth/me", headers={
            "Authorization": "Bearer invalid_token"
        })
        
        assert response.status_code == 401
        assert "Invalid or expired token" in response.json()["detail"]
    
    def test_token_refresh_success(self, client):
        """Test successful token refresh."""
        # First login to get refresh token
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        refresh_token = login_response.json()["refresh_token"]
        
        # Use refresh token to get new access token
        response = client.post("/api/auth/refresh", headers={
            "Authorization": f"Bearer {refresh_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
    
    def test_token_refresh_with_access_token(self, client):
        """Test token refresh with access token (should fail)."""
        # First login to get access token
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        access_token = login_response.json()["access_token"]
        
        # Try to refresh with access token (should fail)
        response = client.post("/api/auth/refresh", headers={
            "Authorization": f"Bearer {access_token}"
        })
        
        assert response.status_code == 401
        assert "Invalid or expired refresh token" in response.json()["detail"]


class TestAuthManager:
    """Test AuthManager functionality."""
    
    def test_password_hashing(self, auth_manager):
        """Test password hashing and verification."""
        password = "test_password_123"
        hashed = auth_manager.hash_password(password)
        
        assert hashed != password
        assert auth_manager.verify_password(password, hashed)
        assert not auth_manager.verify_password("wrong_password", hashed)
    
    def test_token_creation_and_verification(self, auth_manager, test_user):
        """Test JWT token creation and verification."""
        session_id = "test_session_123"
        
        # Create tokens
        access_token = auth_manager.create_access_token(test_user, session_id)
        refresh_token = auth_manager.create_refresh_token(test_user, session_id)
        
        # Verify tokens
        access_data = auth_manager.verify_token(access_token)
        refresh_data = auth_manager.verify_token(refresh_token)
        
        # Check access token
        assert access_data is not None
        assert access_data.user_id == test_user.user_id
        assert access_data.username == test_user.username
        assert access_data.session_id == session_id
        assert access_data.type == "access"
        
        # Check refresh token
        assert refresh_data is not None
        assert refresh_data.user_id == test_user.user_id
        assert refresh_data.username == test_user.username
        assert refresh_data.session_id == session_id
        assert refresh_data.type == "refresh"
    
    def test_expired_token_verification(self, auth_manager, test_user):
        """Test verification of expired tokens."""
        # Create a token that's already expired
        session_id = "test_session_123"
        
        # Mock an expired token by modifying the expiration time in the payload
        import jwt
        from app.config import get_settings
        
        settings = get_settings()
        expired_payload = {
            "user_id": test_user.user_id,
            "username": test_user.username,
            "session_id": session_id,
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),  # Expired
            "iat": datetime.now(timezone.utc) - timedelta(minutes=1),
            "type": "access"
        }
        
        expired_token = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm="HS256")
        
        # Verify expired token
        token_data = auth_manager.verify_token(expired_token)
        assert token_data is None
    
    def test_malformed_token_verification(self, auth_manager):
        """Test verification of malformed tokens."""
        malformed_tokens = [
            "not.a.jwt.token",
            "invalid_token",
            "",
            "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid.signature"
        ]
        
        for token in malformed_tokens:
            token_data = auth_manager.verify_token(token)
            assert token_data is None


class TestSessionManagement:
    """Test session management security."""
    
    def test_session_creation_and_cleanup(self, auth_manager):
        """Test session creation and cleanup."""
        # Login to create session
        login_result = auth_manager.login("admin", "admin123")
        assert login_result is not None
        
        # Verify session was created
        assert len(auth_manager._active_sessions) > 0
        
        # Test session cleanup
        auth_manager.cleanup_expired_sessions()
        
        # For this test, session should still be active
        assert len(auth_manager._active_sessions) > 0
    
    def test_logout_session_cleanup(self, auth_manager):
        """Test that logout properly cleans up sessions."""
        # Login to create session
        login_result = auth_manager.login("admin", "admin123")
        assert login_result is not None
        
        # Get session ID from token
        token_data = auth_manager.verify_token(login_result.access_token)
        session_id = token_data.session_id
        
        # Logout
        success = auth_manager.logout(session_id)
        assert success
        
        # Verify session was cleaned up
        assert session_id not in auth_manager._active_sessions


class TestRateLimiting:
    """Test rate limiting functionality."""
    
    def test_rate_limiting_login_attempts(self, client):
        """Test rate limiting on login attempts."""
        # Make multiple rapid login attempts
        for i in range(70):  # Exceed rate limit of 60 per minute
            response = client.post("/api/auth/login", json={
                "username": "admin",
                "password": "wrong_password"
            })
            
            if response.status_code == 429:
                # Rate limit hit
                assert "Rate limit exceeded" in response.json()["error"]
                break
        else:
            # If we didn't hit rate limit in 70 attempts, something's wrong
            pytest.fail("Rate limiting not working - should have been blocked")


class TestAuthorizationPermissions:
    """Test authorization and permission checks."""
    
    def test_command_execution_permission_required(self, client):
        """Test that command execution requires proper permission."""
        # Login to get token
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        
        # Try to execute command (should work for admin)
        response = client.post("/api/commands/execute", 
            json={"command": "/help", "session_id": "test"},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should be allowed (admin has all permissions)
        assert response.status_code != 403
    
    def test_session_management_permission_required(self, client):
        """Test that session management requires proper permission."""
        # Login to get token
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        
        # Try to list sessions (requires session management permission)
        response = client.get("/api/sessions/",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should be allowed (admin has all permissions)
        assert response.status_code != 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])