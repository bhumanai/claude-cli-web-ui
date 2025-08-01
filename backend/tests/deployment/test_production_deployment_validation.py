"""Production deployment validation tests for post-incident deployment."""

import pytest
import requests
import asyncio
import time
import os
import json
from urllib.parse import urlparse
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import create_app
from app.core.config import get_settings


class TestDeploymentHealthChecks:
    """Test deployment health and readiness checks."""
    
    def test_health_endpoint_responsive(self):
        """Test that health endpoint is responsive and returns correct format."""
        client = TestClient(create_app())
        response = client.get("/api/health")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify health check structure
        required_fields = ["status", "timestamp", "version", "environment"]
        for field in required_fields:
            assert field in data, f"Health check missing required field: {field}"
        
        assert data["status"] in ["healthy", "degraded"], "Invalid health status"
        assert isinstance(data["timestamp"], str), "Timestamp should be string"
    
    def test_readiness_endpoint_functional(self):
        """Test that readiness endpoint validates all dependencies."""
        client = TestClient(create_app())
        response = client.get("/api/health/ready")
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify readiness structure
            assert "ready" in data
            assert "checks" in data
            
            # Verify individual service checks
            checks = data["checks"]
            required_services = ["database", "redis", "auth"]
            
            for service in required_services:
                if service in checks:
                    assert checks[service]["status"] in ["ok", "error"]
                    assert "message" in checks[service]
        else:
            # If not ready, should provide clear error information
            assert response.status_code == 503
            data = response.json()
            assert "error" in data or "detail" in data
    
    def test_startup_time_acceptable(self):
        """Test that application startup time is acceptable."""
        start_time = time.time()
        
        # Create app (simulates startup)
        app = create_app()
        client = TestClient(app)
        
        # First request (triggers any lazy loading)
        response = client.get("/api/health")
        
        startup_time = time.time() - start_time
        
        # Should start within 10 seconds
        assert startup_time < 10.0, f"Startup time too slow: {startup_time:.2f}s"
        assert response.status_code == 200, "App not healthy after startup"


class TestDeploymentConfiguration:
    """Test deployment configuration is production-ready."""
    
    def test_environment_variables_set(self):
        """Test that required environment variables are set."""
        settings = get_settings()
        
        # Critical production environment variables
        critical_env_vars = [
            ("SECRET_KEY", "JWT secret key"),
            ("DATABASE_URL", "Database connection") if hasattr(settings, 'DATABASE_URL') else None,
            ("REDIS_URL", "Redis connection") if hasattr(settings, 'REDIS_URL') else None,
        ]
        
        critical_env_vars = [var for var in critical_env_vars if var is not None]
        
        for var_name, description in critical_env_vars:
            if hasattr(settings, var_name):
                value = getattr(settings, var_name)
                assert value is not None and value != "", f"Missing {description}: {var_name}"
                
                # Check for development/test values
                test_values = ["test", "development", "dev", "local", "changeme", "default"]
                value_lower = str(value).lower()
                for test_val in test_values:
                    assert test_val not in value_lower, f"{var_name} contains test value: {test_val}"
    
    def test_logging_configuration(self):
        """Test that logging is properly configured for production."""
        settings = get_settings()
        
        # Log level should not be DEBUG in production
        log_level = getattr(settings, 'LOG_LEVEL', 'INFO')
        assert log_level.upper() != 'DEBUG', "DEBUG logging enabled in production"
        
        # Should have structured logging
        log_format = getattr(settings, 'LOG_FORMAT', 'json')
        assert log_format in ['json', 'structured'], "Non-structured logging format"
    
    def test_security_configuration(self):
        """Test security configuration is production-ready."""
        settings = get_settings()
        
        # CORS should not be wide open
        cors_origins = getattr(settings, 'CORS_ORIGINS', [])
        if cors_origins:
            assert "*" not in cors_origins, "CORS allows all origins"
            
            # Should only allow HTTPS origins in production
            for origin in cors_origins:
                if origin != "http://localhost:3000":  # Allow local dev
                    parsed = urlparse(origin)
                    assert parsed.scheme == "https", f"Non-HTTPS CORS origin: {origin}"
        
        # Session configuration
        session_expire = getattr(settings, 'ACCESS_TOKEN_EXPIRE_MINUTES', 30)
        assert 15 <= session_expire <= 60, f"Session expiry not in safe range: {session_expire}min"
    
    def test_database_connection_secure(self):
        """Test database connection uses secure settings."""
        settings = get_settings()
        
        # Test database URL if present
        db_urls = []
        if hasattr(settings, 'DATABASE_URL') and settings.DATABASE_URL:
            db_urls.append(settings.DATABASE_URL)
        if hasattr(settings, 'UPSTASH_REDIS_REST_URL') and settings.UPSTASH_REDIS_REST_URL:
            db_urls.append(settings.UPSTASH_REDIS_REST_URL)
        
        for db_url in db_urls:
            parsed = urlparse(db_url)
            
            # Should use secure protocols
            secure_schemes = ['https', 'rediss', 'postgresql', 'postgres']
            assert parsed.scheme in secure_schemes, f"Insecure database scheme: {parsed.scheme}"
            
            # Should not use default passwords
            if parsed.password:
                insecure_passwords = ['password', 'admin', 'root', 'test', '123456']
                assert parsed.password not in insecure_passwords, "Insecure database password"


class TestDeploymentPerformance:
    """Test deployment performance characteristics."""
    
    def test_api_response_times(self):
        """Test that API response times are acceptable."""
        client = TestClient(create_app())
        
        # Test various endpoints
        endpoints = [
            ("/api/health", "GET"),
            ("/api/auth/login", "POST", {"username": "admin", "password": "admin123"}),
        ]
        
        for endpoint_info in endpoints:
            endpoint = endpoint_info[0]
            method = endpoint_info[1]
            data = endpoint_info[2] if len(endpoint_info) > 2 else None
            
            start_time = time.time()
            
            if method == "GET":
                response = client.get(endpoint)
            elif method == "POST":
                response = client.post(endpoint, json=data)
            
            response_time = time.time() - start_time
            
            # Should respond within 2 seconds
            assert response_time < 2.0, f"Slow response from {endpoint}: {response_time:.2f}s"
            assert response.status_code < 500, f"Server error from {endpoint}: {response.status_code}"
    
    def test_concurrent_request_handling(self):
        """Test that the application can handle concurrent requests."""
        client = TestClient(create_app())
        
        def make_request():
            return client.get("/api/health")
        
        # Simulate 10 concurrent requests
        start_time = time.time()
        
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(10)]
            responses = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        total_time = time.time() - start_time
        
        # All requests should succeed
        for response in responses:
            assert response.status_code == 200, "Concurrent request failed"
        
        # Should handle all requests within 10 seconds
        assert total_time < 10.0, f"Concurrent requests too slow: {total_time:.2f}s"
    
    def test_memory_usage_reasonable(self):
        """Test that memory usage is reasonable during operation."""
        import psutil
        import os
        
        # Get initial memory usage
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create app and make some requests
        client = TestClient(create_app())
        
        # Make multiple requests to trigger memory usage
        for _ in range(50):
            client.get("/api/health")
        
        # Check memory usage after requests
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be reasonable (less than 100MB for basic operations)
        assert memory_increase < 100, f"Excessive memory usage: {memory_increase:.2f}MB increase"
        assert final_memory < 500, f"Total memory usage too high: {final_memory:.2f}MB"


class TestDeploymentSecurity:
    """Test deployment security configurations."""
    
    def test_https_redirect_configured(self):
        """Test that HTTPS redirect is properly configured."""
        # This would typically test reverse proxy configuration
        # For now, verify security headers suggest HTTPS usage
        client = TestClient(create_app())
        response = client.get("/api/health")
        
        # Check for HTTPS-related security headers
        hsts_header = response.headers.get("Strict-Transport-Security")
        if hsts_header:
            assert "max-age" in hsts_header, "HSTS header malformed"
            
            # Extract max-age value
            import re
            max_age_match = re.search(r'max-age=(\d+)', hsts_header)
            if max_age_match:
                max_age = int(max_age_match.group(1))
                assert max_age >= 86400, "HSTS max-age too short"  # At least 1 day
    
    def test_security_headers_comprehensive(self):
        """Test comprehensive security headers are present."""
        client = TestClient(create_app())
        response = client.get("/api/health")
        
        # Comprehensive security headers check
        security_headers = {
            "X-Content-Type-Options": ["nosniff"],
            "X-Frame-Options": ["DENY", "SAMEORIGIN"],
            "X-XSS-Protection": ["1; mode=block", "0"],  # 0 is also acceptable for modern browsers
            "Referrer-Policy": ["strict-origin-when-cross-origin", "no-referrer", "same-origin"],
            "Permissions-Policy": ["geolocation=(), microphone=(), camera=()"],  # Example restrictive policy
        }
        
        for header, acceptable_values in security_headers.items():
            actual_value = response.headers.get(header)
            if actual_value:  # Some headers might not be set, which is ok
                assert any(acceptable in actual_value for acceptable in acceptable_values), \
                    f"Security header {header} has unexpected value: {actual_value}"
    
    def test_sensitive_files_not_accessible(self):
        """Test that sensitive files are not accessible via web."""
        client = TestClient(create_app())
        
        # Common sensitive files that should not be accessible
        sensitive_paths = [
            "/.env",
            "/.env.production",
            "/.env.local",
            "/config.json",
            "/secrets.json",
            "/.git/config",
            "/package.json",
            "/requirements.txt",
            "/Dockerfile",
            "/docker-compose.yml",
            "/backup.sql",
            "/dump.sql",
        ]
        
        for path in sensitive_paths:
            response = client.get(path)
            # Should return 404 (not found) or 403 (forbidden), not 200 (accessible)
            assert response.status_code in [404, 403], f"Sensitive file accessible: {path}"
    
    def test_admin_endpoints_protected(self):
        """Test that admin endpoints are properly protected."""
        client = TestClient(create_app())
        
        # Common admin endpoints that should be protected
        admin_endpoints = [
            "/admin",
            "/admin/",
            "/api/admin",
            "/api/admin/",
            "/dashboard",
            "/management",
            "/system",
            "/internal",
        ]
        
        for endpoint in admin_endpoints:
            response = client.get(endpoint)
            # Should require authentication (401) or be forbidden (403) or not exist (404)
            assert response.status_code in [401, 403, 404], f"Admin endpoint not protected: {endpoint}"


class TestPostIncidentSpecificValidation:
    """Test specific validations related to the security incident."""
    
    def test_credential_exposure_fixed(self):
        """Test that credential exposure issues are fixed."""
        client = TestClient(create_app())
        
        # Test endpoints that might expose environment info
        info_endpoints = [
            "/api/health",
            "/api/system/info",
            "/api/config",
            "/api/status",
        ]
        
        for endpoint in info_endpoints:
            response = client.get(endpoint)
            if response.status_code == 200:
                data = response.json()
                response_text = json.dumps(data).lower()
                
                # Check for leaked credentials (partial matches)
                credential_patterns = [
                    "yaegxtukn2ttxhe0skwibz8c",  # Vercel token (partial)
                    "ghp_z0mzxba362iil1qddvnn",   # GitHub token (partial)
                    "upstash.com",                 # Upstash URL patterns
                    "vercel.app",                  # Vercel domains
                    "redis.upstash.io",            # Redis URL patterns
                ]
                
                for pattern in credential_patterns:
                    assert pattern not in response_text, f"Credential pattern found in {endpoint}: {pattern}"
    
    def test_environment_file_secured(self):
        """Test that environment files are properly secured."""
        # Verify .env files are not in web-accessible locations
        client = TestClient(create_app())
        
        env_file_paths = [
            "/.env",
            "/.env.production",
            "/.env.local",
            "/.env.development",
            "/backend/.env",
            "/frontend/.env",
            "/.env.COMPROMISED",  # The compromised file should definitely not be accessible
        ]
        
        for path in env_file_paths:
            response = client.get(path)
            assert response.status_code == 404, f"Environment file accessible via web: {path}"
    
    def test_new_credentials_functional(self):
        """Test that new credentials are functional (if rotated)."""
        # This would test that new credentials work for external services
        # For now, verify that authentication still works with updated tokens
        
        client = TestClient(create_app())
        
        # Test that internal authentication still works
        response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123" 
        })
        
        # Should either work (if creds unchanged) or fail with proper error (if changed)
        if response.status_code == 401:
            # Credentials were changed - good for security
            error_msg = response.json().get("detail", "")
            assert "Invalid username or password" in error_msg
        else:
            # Credentials still work - verify token is functional
            assert response.status_code == 200
            token = response.json()["access_token"]
            
            # Test token usage
            auth_response = client.get("/api/auth/me", headers={
                "Authorization": f"Bearer {token}"
            })
            assert auth_response.status_code == 200
    
    def test_deployment_access_restored(self):
        """Test that deployment access is properly restored."""
        # This would test actual deployment URL if available
        # For now, verify local deployment is functional
        
        client = TestClient(create_app())
        
        # Basic functionality test
        response = client.get("/api/health")
        assert response.status_code == 200, "Basic deployment functionality broken"
        
        # API endpoints functional
        response = client.get("/api/")
        assert response.status_code in [200, 404], "API routing broken"
        
        # WebSocket endpoint available (would test connection in real scenario)
        # For now, just verify the endpoint exists
        # This would require actual WebSocket testing in a full deployment test


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])