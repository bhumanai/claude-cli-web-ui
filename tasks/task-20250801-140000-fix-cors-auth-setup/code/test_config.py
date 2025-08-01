#!/usr/bin/env python3
"""
Test script to verify backend configuration and CORS setup.
"""

import sys
import os
sys.path.append('/Users/don/D3/backend')

from app.config import get_settings
from app.core.auth import auth_manager

def test_configuration():
    """Test that the configuration is working correctly."""
    settings = get_settings()
    
    print("=== Backend Configuration Test ===")
    print(f"DEBUG: {settings.DEBUG}")
    print(f"ENABLE_AUTH: {settings.ENABLE_AUTH}")
    print(f"HOST: {settings.HOST}")
    print(f"PORT: {settings.PORT}")
    print(f"SECRET_KEY: {settings.SECRET_KEY[:20]}...")
    print(f"SIMPLE_PASSWORD: {settings.SIMPLE_PASSWORD}")
    print(f"ALLOWED_ORIGINS: {len(settings.ALLOWED_ORIGINS)} origins configured")
    
    # Test CORS origins
    print("\n=== CORS Origins ===")
    for origin in settings.ALLOWED_ORIGINS[:10]:  # Show first 10
        print(f"  - {origin}")
    if len(settings.ALLOWED_ORIGINS) > 10:
        print(f"  ... and {len(settings.ALLOWED_ORIGINS) - 10} more")
    
    # Test authentication
    print("\n=== Authentication Test ===")
    token_response = auth_manager.login("admin", settings.SIMPLE_PASSWORD)
    if token_response:
        print("✅ Authentication working - login successful")
        print(f"Access token: {token_response.access_token[:20]}...")
        print(f"Token type: {token_response.token_type}")
        print(f"Expires in: {token_response.expires_in}s")
    else:
        print("❌ Authentication failed")
    
    return True

if __name__ == "__main__":
    test_configuration()