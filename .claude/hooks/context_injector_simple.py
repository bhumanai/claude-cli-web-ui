#!/usr/bin/env python3
"""
Simple Context Injector Hook for Claude Code CLI

Injects CLAUDE.md and task.md content without complex dependencies.
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path


class SimpleContextInjector:
    """Simple context injection that works with .md files."""
    
    def __init__(self):
        self.project_dir = Path(os.environ.get('CLAUDE_PROJECT_DIR', ''))
        
    def read_file_safe(self, path):
        """Safely read a file."""
        try:
            if path.exists():
                with open(path, 'r') as f:
                    return f.read()
        except:
            pass
        return None
    
    def inject_context(self, hook_input):
        """Inject relevant context."""
        prompt = hook_input.get('prompt', '').lower()
        
        context_parts = []
        
        # Always include CLAUDE.md
        claude_md = self.project_dir / 'CLAUDE.md'
        content = self.read_file_safe(claude_md)
        if content:
            context_parts.append(f"=== CLAUDE.md (Project Context) ===\n{content}")
        
        # Check for active task
        state_file = self.project_dir / '.claude' / 'meta_agent_state.json'
        if state_file.exists():
            try:
                with open(state_file, 'r') as f:
                    state = json.load(f)
                    
                # Add current task info
                if state.get("active") and state.get("tasks"):
                    current_index = state.get("current_task_index", 0)
                    if current_index < len(state["tasks"]):
                        current_task = state["tasks"][current_index]
                        context_parts.append(f"\n=== Current Meta-Agent Task ===\n{current_task}")
            except:
                pass
        
        # Add meta-agent rules
        if "meta" in prompt or "agent" in prompt or "task" in prompt:
            rules = """
=== Meta-Agent Rules ===
1. Tasks must be 5-20 lines of code maximum
2. Always read fresh from .md files, never cache
3. Use the Task tool for agent execution
4. Check .claude/meta_agent_state.json for current state
"""
            context_parts.append(rules)
        
        if context_parts:
            return {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": "\n\n".join(context_parts)
                }
            }
        
        return {}


def main():
    """Main entry point."""
    try:
        # Read input
        hook_input = json.load(sys.stdin)
        
        # Process
        injector = SimpleContextInjector()
        result = injector.inject_context(hook_input)
        
        # Output only if we have context to inject
        if result:
            print(json.dumps(result))
        
        sys.exit(0)
        
    except:
        # Silent fail - don't inject on errors
        sys.exit(0)


if __name__ == "__main__":
    main()