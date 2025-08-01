#!/usr/bin/env python3
"""
Framework Validation Script
Tests the bulletproof visual testing framework components
"""

import json
import os
import sys
from pathlib import Path
import subprocess

def check_directory_structure():
    """Validate directory structure"""
    print("🔍 Checking directory structure...")
    
    required_dirs = [
        ".claude/commands",
        ".claude/agents", 
        "scripts",
        "artifacts/paths"
    ]
    
    missing_dirs = []
    for dir_path in required_dirs:
        if not Path(dir_path).exists():
            missing_dirs.append(dir_path)
    
    if missing_dirs:
        print(f"❌ Missing directories: {missing_dirs}")
        return False
    
    print("✅ Directory structure valid")
    return True

def validate_commands():
    """Validate slash commands"""
    print("🔍 Checking slash commands...")
    
    command_files = [
        ".claude/commands/test-start.md",
        ".claude/commands/test-audit.md", 
        ".claude/commands/test-replay.md",
        ".claude/commands/test-optimize.md",
        ".claude/commands/test-regenerate.md",
        ".claude/commands/test-purge.md"
    ]
    
    missing_commands = []
    invalid_commands = []
    
    for cmd_file in command_files:
        if not Path(cmd_file).exists():
            missing_commands.append(cmd_file)
            continue
        
        # Check frontmatter
        with open(cmd_file) as f:
            content = f.read()
            if not content.startswith("---"):
                invalid_commands.append(f"{cmd_file} (no frontmatter)")
            elif "description:" not in content:
                invalid_commands.append(f"{cmd_file} (no description)")
    
    if missing_commands:
        print(f"❌ Missing commands: {missing_commands}")
        return False
        
    if invalid_commands:
        print(f"❌ Invalid commands: {invalid_commands}")
        return False
    
    print("✅ All slash commands valid")
    return True

def validate_agents():
    """Validate subagent definitions"""
    print("🔍 Checking subagents...")
    
    agent_files = [
        ".claude/agents/flow-generator.md",
        ".claude/agents/dom-stabilizer.md",
        ".claude/agents/test-executor.md", 
        ".claude/agents/verifier.md",
        ".claude/agents/assertion-checker.md",
        ".claude/agents/ux-reflector.md",
        ".claude/agents/infra-watchdog.md"
    ]
    
    missing_agents = []
    invalid_agents = []
    
    for agent_file in agent_files:
        if not Path(agent_file).exists():
            missing_agents.append(agent_file)
            continue
        
        # Check agent structure
        with open(agent_file) as f:
            content = f.read()
            if not content.startswith("---"):
                invalid_agents.append(f"{agent_file} (no frontmatter)")
            elif "name:" not in content:
                invalid_agents.append(f"{agent_file} (no name)")
            elif "$INPUT" not in content:
                invalid_agents.append(f"{agent_file} (no input schema)")
            elif "$OUTPUT" not in content:
                invalid_agents.append(f"{agent_file} (no output schema)")
    
    if missing_agents:
        print(f"❌ Missing agents: {missing_agents}")
        return False
        
    if invalid_agents:
        print(f"❌ Invalid agents: {invalid_agents}")
        return False
    
    print("✅ All subagents valid")
    return True

def validate_test_runner():
    """Validate test runner script"""
    print("🔍 Checking test runner...")
    
    runner_path = Path("scripts/test_runner.py")
    if not runner_path.exists():
        print("❌ Test runner script missing")
        return False
    
    # Check if executable
    if not os.access(runner_path, os.X_OK):
        print("❌ Test runner not executable")
        return False
    
    # Check basic syntax
    try:
        result = subprocess.run([
            sys.executable, str(runner_path), "--help"
        ], capture_output=True, text=True, timeout=5)
        
        if result.returncode != 0:
            print(f"❌ Test runner help failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Test runner timeout")
        return False
    except Exception as e:
        print(f"❌ Test runner error: {e}")
        return False
    
    print("✅ Test runner valid")
    return True

def validate_flow_catalog():
    """Validate flow catalog configuration"""
    print("🔍 Checking flow catalog...")
    
    catalog_path = Path("flow_catalog.json")
    if not catalog_path.exists():
        print("❌ Flow catalog missing")
        return False
    
    try:
        with open(catalog_path) as f:
            catalog = json.load(f)
        
        # Check required sections
        required_sections = ["personas", "flows", "configuration"]
        for section in required_sections:
            if section not in catalog:
                print(f"❌ Missing section in catalog: {section}")
                return False
        
        # Check personas have required fields
        for persona_id, persona in catalog["personas"].items():
            required_fields = ["name", "goals", "technical_level", "preferences", "pain_points"]
            for field in required_fields:
                if field not in persona:
                    print(f"❌ Persona {persona_id} missing field: {field}")
                    return False
        
        print("✅ Flow catalog valid")
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ Flow catalog JSON error: {e}")
        return False

def validate_dependencies():
    """Check external dependencies"""
    print("🔍 Checking dependencies...")
    
    # Check Python packages
    try:
        import subprocess
        import argparse
        import logging
        from pathlib import Path
        from datetime import datetime
        print("✅ Python packages available")
    except ImportError as e:
        print(f"❌ Missing Python package: {e}")
        return False
    
    # Check Claude Code CLI (if available)
    try:
        result = subprocess.run(["claude", "--version"], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("✅ Claude Code CLI available")
        else:
            print("⚠️  Claude Code CLI not found (install: npm install -g @anthropic-ai/claude-code)")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("⚠️  Claude Code CLI not found")
    
    # Check Playwright (if available)
    try:
        result = subprocess.run(["playwright", "--version"], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("✅ Playwright available")
        else:
            print("⚠️  Playwright not found (install: pip install playwright)")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("⚠️  Playwright not found")
    
    # Check FFmpeg (if available)
    try:
        result = subprocess.run(["ffmpeg", "-version"], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("✅ FFmpeg available")
        else:
            print("⚠️  FFmpeg not found (needed for video replay)")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("⚠️  FFmpeg not found")
    
    return True

def main():
    print("🚀 Validating Bulletproof Visual Testing Framework")
    print("=" * 60)
    
    checks = [
        check_directory_structure,
        validate_commands, 
        validate_agents,
        validate_test_runner,
        validate_flow_catalog,
        validate_dependencies
    ]
    
    results = []
    for check in checks:
        try:
            result = check()
            results.append(result)
        except Exception as e:
            print(f"❌ Check failed with error: {e}")
            results.append(False)
        print()
    
    # Summary
    print("📋 Validation Summary")
    print("=" * 30)
    
    passed = sum(results)
    total = len(results)
    
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All checks passed! Framework is ready to use.")
        print("\nNext steps:")
        print("1. Install Claude Code CLI: npm install -g @anthropic-ai/claude-code")
        print("2. Install Playwright: pip install playwright && playwright install")
        print("3. Run your first test: /test-start --flow=checkout_flow --persona=power_user --url=https://example.com")
        return 0
    else:
        print(f"❌ {total - passed} checks failed. Please fix issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())