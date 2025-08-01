"""Custom middleware for security and monitoring."""

import time
from typing import Callable

from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.core.logging_config import get_logger
from app.core.security import security_manager

logger = get_logger(__name__)


class SecurityMiddleware(BaseHTTPMiddleware):
    """Middleware for security checks including rate limiting."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request through security checks.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler
            
        Returns:
            Response from next handler or error response
        """
        start_time = time.time()
        client_ip = request.client.host if request.client else "unknown"
        settings = get_settings()
        
        try:
            # Skip security checks for health endpoints
            if request.url.path.startswith("/api/health"):
                response = await call_next(request)
                return response
            
            # Rate limiting check
            try:
                security_manager.check_rate_limit(request)
            except HTTPException as e:
                # Return rate limit error as JSON
                return JSONResponse(
                    status_code=e.status_code,
                    content={
                        "error": e.detail,
                        "code": "RATE_LIMIT_EXCEEDED"
                    },
                    headers=e.headers or {}
                )
            
            # Process request
            response = await call_next(request)
            
            # Add comprehensive security headers
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
            
            # Content Security Policy
            csp_directives = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  # Allow inline scripts for development
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                "font-src 'self'",
                "connect-src 'self' ws://localhost:* wss://*",  # Allow WebSocket connections
                "media-src 'none'",
                "object-src 'none'",
                "frame-src 'none'",
                "base-uri 'self'",
                "form-action 'self'"
            ]
            response.headers["Content-Security-Policy"] = "; ".join(csp_directives)
            
            # HSTS header for HTTPS (only in production)
            if not settings.DEBUG:
                response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            
            # Log request
            process_time = time.time() - start_time
            logger.info("Request processed",
                       method=request.method,
                       path=request.url.path,
                       client_ip=client_ip,
                       status_code=response.status_code,
                       process_time=round(process_time, 3))
            
            return response
            
        except Exception as e:
            # Log unexpected errors
            process_time = time.time() - start_time
            logger.error("Request failed",
                        method=request.method,
                        path=request.url.path,
                        client_ip=client_ip,
                        error=str(e),
                        process_time=round(process_time, 3))
            
            # Return generic error response
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "code": "INTERNAL_ERROR"
                }
            )


class CORSSecurityMiddleware(BaseHTTPMiddleware):
    """Enhanced CORS middleware with security considerations."""
    
    def __init__(self, app, allowed_origins=None):
        super().__init__(app)
        self.allowed_origins = allowed_origins or ["http://localhost:5173"]
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Handle CORS with security checks.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler
            
        Returns:
            Response with appropriate CORS headers
        """
        origin = request.headers.get("origin")
        
        # Handle preflight requests
        if request.method == "OPTIONS":
            response = Response()
            if origin in self.allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
                response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
                response.headers["Access-Control-Max-Age"] = "86400"  # 24 hours
            return response
        
        # Process normal request
        response = await call_next(request)
        
        # Add CORS headers for allowed origins
        if origin in self.allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for detailed request logging."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Log request details for monitoring.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler
            
        Returns:
            Response from next handler
        """
        start_time = time.time()
        
        # Extract request info
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        # Log request start
        logger.debug("Request started",
                    method=request.method,
                    path=request.url.path,
                    query=str(request.query_params),
                    client_ip=client_ip,
                    user_agent=user_agent)
        
        # Process request
        response = await call_next(request)
        
        # Calculate processing time
        process_time = time.time() - start_time
        
        # Log response
        logger.info("Request completed",
                   method=request.method,
                   path=request.url.path,
                   client_ip=client_ip,
                   status_code=response.status_code,
                   process_time=round(process_time, 3),
                   response_size=response.headers.get("content-length", "unknown"))
        
        # Add timing header
        response.headers["X-Process-Time"] = str(round(process_time, 3))
        
        return response