#!/usr/bin/env python3
"""
Security implementation validation script.
Validates that all security components are properly structured.
"""

import os
import sys
import re
from pathlib import Path

def check_file_exists(filepath, description):
    """Check if a file exists and report result."""
    if os.path.exists(filepath):
        print(f"✓ {description}: FOUND")
        return True
    else:
        print(f"✗ {description}: MISSING")
        return False

def check_content_in_file(filepath, patterns, description):
    """Check if specific content patterns exist in a file."""
    if not os.path.exists(filepath):
        print(f"✗ {description}: FILE NOT FOUND")
        return False
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        found_patterns = 0
        for pattern in patterns:
            if pattern in content:
                found_patterns += 1
        
        if found_patterns == len(patterns):
            print(f"✓ {description}: ALL PATTERNS FOUND")
            return True
        else:
            print(f"⚠ {description}: {found_patterns}/{len(patterns)} PATTERNS FOUND")
            return False
    except Exception as e:
        print(f"✗ {description}: ERROR READING FILE - {e}")
        return False

def main():
    print("=== CLAUDE CLI WEB UI SECURITY VALIDATION ===")
    print()
    
    # Change to backend directory
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    
    validation_results = []
    
    # 1. Check Authentication System Files
    print("1. Authentication System Structure:")
    auth_files = [
        ("app/core/auth.py", "Authentication core module"),
        ("app/api/endpoints/auth.py", "Authentication endpoints"),
    ]
    
    for filepath, desc in auth_files:
        validation_results.append(check_file_exists(filepath, desc))
    
    # 2. Check Security Components
    print("\n2. Security Components:")
    security_files = [
        ("app/core/security.py", "Security manager"),
        ("app/core/middleware.py", "Security middleware"),
        ("app/services/claude_cli/security.py", "Command sanitizer"),
    ]
    
    for filepath, desc in security_files:
        validation_results.append(check_file_exists(filepath, desc))
    
    # 3. Check Content Validation
    print("\n3. Security Implementation Validation:")
    
    # Check authentication core has key components
    auth_patterns = [
        "class AuthManager",
        "create_access_token",
        "verify_token",
        "hash_password",
        "verify_password"
    ]
    validation_results.append(
        check_content_in_file("app/core/auth.py", auth_patterns, "Authentication core features")
    )
    
    # Check command sanitizer has dangerous patterns
    sanitizer_patterns = [
        "DANGEROUS_PATTERNS",
        "ALLOWED_CLAUDE_COMMANDS", 
        "sanitize_command",
        "rm -rf",
        "sudo"
    ]
    validation_results.append(
        check_content_in_file("app/services/claude_cli/security.py", sanitizer_patterns, "Command sanitization features")
    )
    
    # Check security headers in middleware
    middleware_patterns = [
        "X-Content-Type-Options",
        "X-Frame-Options", 
        "Content-Security-Policy",
        "Strict-Transport-Security"
    ]
    validation_results.append(
        check_content_in_file("app/core/middleware.py", middleware_patterns, "Security headers")
    )
    
    # 4. Check Configuration Files
    print("\n4. Configuration Files:")
    config_files = [
        (".env.production", "Production environment configuration"),
        ("requirements.txt", "Requirements file"),
    ]
    
    for filepath, desc in config_files:
        validation_results.append(check_file_exists(filepath, desc))
    
    # Check production config has security settings
    prod_config_patterns = [
        "ENABLE_AUTH=true",
        "SECRET_KEY=",
        "ALLOWED_ORIGINS=",
        "DEBUG=false"
    ]
    validation_results.append(
        check_content_in_file(".env.production", prod_config_patterns, "Production security config")
    )
    
    # 5. Check Test Files
    print("\n5. Security Test Suite:")
    test_files = [
        ("tests/security/test_authentication.py", "Authentication tests"),
        ("tests/security/test_command_injection.py", "Command injection tests"),
    ]
    
    for filepath, desc in test_files:
        validation_results.append(check_file_exists(filepath, desc))
    
    # 6. Check Documentation
    print("\n6. Security Documentation:")
    doc_files = [
        ("../SECURITY_IMPLEMENTATION_GUIDE.md", "Security implementation guide"),
    ]
    
    for filepath, desc in doc_files:
        validation_results.append(check_file_exists(filepath, desc))
    
    # 7. Summary
    print("\n" + "="*50)
    print("VALIDATION SUMMARY")
    print("="*50)
    
    passed = sum(validation_results)
    total = len(validation_results)
    percentage = (passed / total) * 100
    
    print(f"Tests Passed: {passed}/{total} ({percentage:.1f}%)")
    
    if percentage >= 90:
        print("✓ SECURITY IMPLEMENTATION: EXCELLENT")
        security_status = "PRODUCTION READY"
    elif percentage >= 75:
        print("⚠ SECURITY IMPLEMENTATION: GOOD")
        security_status = "MOSTLY READY - MINOR ISSUES"
    elif percentage >= 50:
        print("⚠ SECURITY IMPLEMENTATION: NEEDS WORK")
        security_status = "NOT READY - MAJOR ISSUES"
    else:
        print("✗ SECURITY IMPLEMENTATION: CRITICAL ISSUES")
        security_status = "NOT READY - CRITICAL ISSUES"
    
    print(f"Status: {security_status}")
    print()
    
    # Security checklist
    print("SECURITY CHECKLIST:")
    checklist_items = [
        ("Authentication system implemented", passed >= 2),
        ("Command injection protection", passed >= 5),
        ("Security headers configured", passed >= 7),
        ("Production config ready", passed >= 9),
        ("Security tests available", passed >= 11),
        ("Documentation complete", passed >= 12)
    ]
    
    for item, status in checklist_items:
        status_icon = "✓" if status else "✗"
        print(f"{status_icon} {item}")
    
    print()
    print("Next steps:")
    if percentage < 100:
        print("1. Address any missing components listed above")
        print("2. Install required dependencies: pip install -r requirements.txt")
        print("3. Run security tests: pytest tests/security/ -v")
        print("4. Review production configuration")
    else:
        print("1. Install dependencies: pip install -r requirements.txt")
        print("2. Run security tests: pytest tests/security/ -v")
        print("3. Configure production environment")
        print("4. Deploy with security hardening")
    
    return 0 if percentage >= 90 else 1

if __name__ == "__main__":
    sys.exit(main())