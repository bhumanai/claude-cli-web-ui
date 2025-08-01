# Phase 1: Security Audit & Remediation Prompt

## CRITICAL SECURITY AUDIT & REMEDIATION

You are conducting a comprehensive security audit and remediation of a Claude CLI Web UI application before cloud deployment to Terragon/Vercel. The system currently has CRITICAL security vulnerabilities that MUST be fixed.

## CRITICAL VULNERABILITIES IDENTIFIED:

### 1. AUTHENTICATION SYSTEM COMPLETELY MISSING
- No JWT, OAuth2, or any authentication mechanism
- Sessions created without user verification
- API endpoints unprotected
- Command execution without user validation

### 2. COMMAND INJECTION RISKS
- Direct command execution through PTY sessions
- Insufficient command validation in CommandExecutor
- User input directly sent to system shell
- Potential for arbitrary code execution

### 3. INPUT VALIDATION GAPS
- Missing validation across API endpoints
- Insufficient sanitization in command_executor.py
- No parameterized queries protection
- Weak input filtering

### 4. SESSION MANAGEMENT FLAWS
- Sessions not tied to authenticated users
- No session validation or expiration
- Insecure session token generation
- Missing CSRF protection

### 5. MISSING SECURITY HEADERS
- No CORS configuration
- Missing CSP (Content Security Policy)
- No security headers middleware
- Insecure defaults

## YOUR TASKS:

1. **SECURITY AUDIT REPORT**
   - Comprehensive vulnerability assessment
   - Risk severity classification (Critical/High/Medium/Low)
   - OWASP Top 10 compliance review

2. **AUTHENTICATION SYSTEM IMPLEMENTATION**
   - Design secure JWT-based auth system
   - Implement user registration/login
   - Add session validation middleware
   - Create protected route decorators

3. **COMMAND EXECUTION SECURITY**
   - Harden command validation
   - Implement command whitelisting
   - Add user permission checks
   - Secure PTY session management

4. **INPUT VALIDATION & SANITIZATION**
   - API endpoint input validation
   - SQL injection prevention
   - XSS protection
   - Command injection prevention

5. **SECURITY HEADERS & CORS**
   - Implement CORS properly
   - Add CSP headers
   - Security middleware setup
   - Rate limiting integration with auth

## CURRENT SYSTEM CONTEXT:
- Backend: FastAPI with WebSocket support
- Frontend: React TypeScript
- Database: File-based (needs migration to secure DB)
- Command execution: PTY-based Claude CLI integration
- Deployment target: Vercel serverless

## FILES TO AUDIT & SECURE:
- /backend/app/core/security.py (basic security exists)
- /backend/app/services/command_executor.py (CRITICAL vulnerabilities)
- /backend/app/api/endpoints/*.py (all API endpoints)
- /backend/app/core/middleware.py (needs security headers)
- /backend/app/websocket.py (WebSocket security)

## DELIVERABLES REQUIRED:
1. Comprehensive security audit report
2. Secure authentication system implementation
3. Hardened command execution layer
4. Input validation for all endpoints
5. Security headers and CORS configuration
6. Updated middleware with security features
7. Security test cases
8. Security documentation

This is CRITICAL - the system cannot be deployed until these vulnerabilities are fixed. Focus on practical, production-ready security implementations.