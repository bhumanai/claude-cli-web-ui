# Claude CLI Web UI - Security Implementation Guide

## Overview

This document outlines the comprehensive security measures implemented in the Claude CLI Web UI to address critical vulnerabilities and ensure production-ready security.

## Security Architecture

### Authentication & Authorization
- **JWT-based Authentication**: Secure token-based authentication with access and refresh tokens
- **Role-based Access Control**: Permission-based authorization (execute_commands, manage_sessions, admin)
- **Session Management**: Secure session tracking with automatic cleanup
- **Password Security**: bcrypt hashing with proper salt generation

### Command Injection Prevention
- **Multi-layer Command Validation**: 
  - Basic pattern matching in SecurityManager
  - Advanced sanitization in CommandSanitizer
  - Claude CLI-specific command whitelisting
- **Input Sanitization**: Control character removal, length limits, encoding validation
- **Path Traversal Protection**: Restricted file operations within project boundaries

### Network Security
- **Rate Limiting**: Per-IP request throttling (configurable, default 60/minute)
- **CORS Configuration**: Strict origin control for cross-origin requests
- **Security Headers**: Comprehensive security headers implementation
- **IP Blocking**: Dynamic IP blocking for malicious actors

## Implementation Details

### 1. Authentication System

#### Components
- `app/core/auth.py`: Authentication manager and JWT handling
- `app/api/endpoints/auth.py`: Authentication endpoints
- Default admin user: `admin/admin123` (development only)

#### Token Structure
```json
{
  "user_id": "string",
  "username": "string", 
  "session_id": "string",
  "exp": "timestamp",
  "iat": "timestamp",
  "type": "access|refresh",
  "permissions": ["array"]
}
```

#### Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - Session termination
- `GET /api/auth/me` - Current user info
- `POST /api/auth/validate-token` - Token validation

### 2. Command Security

#### CommandSanitizer (`app/services/claude_cli/security.py`)
- **Dangerous Pattern Detection**: Regex-based blocking of malicious commands
- **Command Whitelisting**: Only approved Claude CLI commands allowed
- **Input Validation**: Length limits, null byte detection, ANSI sequence removal
- **Argument Validation**: Limit argument count, validate file operations

#### Blocked Patterns
```python
DANGEROUS_PATTERNS = [
    r'rm\s+-rf\s+/',     # File system destruction
    r'sudo',             # Privilege escalation  
    r'curl.*\|\s*sh',    # Code execution
    r'eval\s*\(',        # Dynamic evaluation
    r';\s*cat\s+/etc/passwd', # Command injection
    # ... and many more
]
```

#### Allowed Claude Commands
```python
ALLOWED_CLAUDE_COMMANDS = {
    '/plan', '/smart-task', '/init-project',
    '/complete-task', '/test-task', '/help',
    '/status', '/cancel', '/clear', '/exit'
    # ... full whitelist
}
```

### 3. Security Headers

#### Implemented Headers
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: [comprehensive policy]
Strict-Transport-Security: max-age=31536000; includeSubDomains (production)
```

#### Content Security Policy
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self' ws://localhost:* wss://*;
media-src 'none';
object-src 'none';
frame-src 'none'
```

### 4. Rate Limiting

#### Implementation
- **Per-IP tracking**: Memory-based rate limiting
- **Configurable limits**: Default 60 requests/minute
- **Sliding window**: Time-based request counting
- **Rate limit headers**: Client feedback on limits

#### Headers
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1234567890
```

### 5. Session Security

#### Features
- **User-scoped sessions**: Sessions prefixed with user ID
- **Session isolation**: Users can only access their own sessions
- **Automatic cleanup**: Expired session removal
- **Activity tracking**: Last activity timestamps

#### Session ID Format
```
{user_id}_{session_type}_{suffix}
```

## Security Testing

### Automated Tests

#### Authentication Tests (`tests/security/test_authentication.py`)
- Login/logout flows
- Token validation and expiration
- Permission checks
- Rate limiting
- Session management

#### Command Injection Tests (`tests/security/test_command_injection.py`)
- Dangerous command blocking
- Input sanitization validation
- Bypass attempt detection
- Unicode and encoding attacks
- Case variation attempts

### Manual Security Testing

#### Command Injection Testing
```bash
# Test dangerous commands (should be blocked)
curl -X POST http://localhost:8000/api/commands/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "rm -rf /", "session_id": "test"}'

# Test valid commands (should work)
curl -X POST http://localhost:8000/api/commands/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "/help", "session_id": "test"}'
```

#### Authentication Testing
```bash
# Test unauthenticated access (should fail)
curl -X GET http://localhost:8000/api/sessions/

# Test with valid token (should work)
curl -X GET http://localhost:8000/api/sessions/ \
  -H "Authorization: Bearer $TOKEN"

# Test with invalid token (should fail)
curl -X GET http://localhost:8000/api/sessions/ \
  -H "Authorization: Bearer invalid_token"
```

## Production Deployment

### Environment Configuration

Copy and customize the production environment file:
```bash
cp .env.production .env
```

#### Critical Settings
1. **SECRET_KEY**: Generate a secure random key
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

2. **ALLOWED_ORIGINS**: Restrict to your domains
   ```
   ALLOWED_ORIGINS=["https://yourdomain.com"]
   ```

3. **Database**: Use PostgreSQL in production
   ```
   DATABASE_URL=postgresql+asyncpg://user:pass@host/db
   ```

4. **Redis**: Enable for session and task management
   ```
   USE_REDIS=true
   REDIS_URL=redis://localhost:6379/0
   ```

### SSL/TLS Configuration

#### Using Reverse Proxy (Recommended)
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Direct SSL (Alternative)
```bash
uvicorn main:create_app \
  --factory \
  --host 0.0.0.0 \
  --port 8000 \
  --ssl-keyfile /path/to/key.pem \
  --ssl-certfile /path/to/cert.pem
```

### Security Checklist

#### Pre-deployment
- [ ] Change default SECRET_KEY
- [ ] Configure ALLOWED_ORIGINS
- [ ] Set up production database
- [ ] Configure Redis
- [ ] Set DEBUG=false
- [ ] Review rate limits
- [ ] Set up SSL certificates
- [ ] Configure firewall rules
- [ ] Set up monitoring/logging

#### Post-deployment
- [ ] Test authentication flows
- [ ] Verify command injection protection
- [ ] Check security headers
- [ ] Validate CORS configuration
- [ ] Test rate limiting
- [ ] Monitor security logs
- [ ] Set up automated security scanning

### Monitoring & Logging

#### Key Metrics to Monitor
- Failed authentication attempts
- Rate limit violations
- Blocked dangerous commands
- Session anomalies
- Error rates

#### Log Analysis
```bash
# Monitor security-related logs
tail -f /var/log/claude-cli/security.log | grep -E "(BLOCKED|FAILED|RATE_LIMIT)"

# Authentication monitoring
grep "Failed password attempt" /var/log/claude-cli/auth.log

# Command injection attempts
grep "Blocked dangerous command" /var/log/claude-cli/commands.log
```

### Security Maintenance

#### Regular Tasks
1. **Token Rotation**: Rotate JWT secret keys periodically
2. **Log Review**: Weekly security log analysis
3. **Dependency Updates**: Monthly security patch updates
4. **Rate Limit Tuning**: Adjust based on usage patterns
5. **Session Cleanup**: Monitor and clean expired sessions

#### Incident Response
1. **Immediate Actions**:
   - Block malicious IPs
   - Revoke compromised tokens
   - Escalate to security team

2. **Investigation**:
   - Analyze attack patterns
   - Review security logs
   - Identify vulnerabilities

3. **Recovery**:
   - Patch vulnerabilities
   - Update security rules
   - Document lessons learned

## Security Contacts

For security issues, please contact:
- Security Team: security@yourdomain.com
- Emergency: security-emergency@yourdomain.com

## Version History

- **v1.0** (2025-01-31): Initial security implementation
  - JWT authentication
  - Command injection protection
  - Security headers
  - Rate limiting
  - Session management