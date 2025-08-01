#!/usr/bin/env python3
"""
Context Injector Hook for Claude Code CLI

This hook is triggered when the user submits a prompt (UserPromptSubmit event).
It ensures that FRESH copies of CLAUDE.md and task.md are injected into the
context, along with any relevant documentation from the resource library.
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path


class ContextInjectorHook:
    """Injects fresh context into user prompts."""
    
    def __init__(self):
        self.project_dir = Path(os.environ.get('CLAUDE_PROJECT_DIR', ''))
        self.resource_library = self.project_dir / '.claude' / 'meta-agent' / 'resource-library'
        
    def read_fresh(self, file_path):
        """Read file content with timestamp to ensure freshness."""
        try:
            if os.path.exists(file_path):
                with open(file_path, 'r') as f:
                    content = f.read()
                return f"\n[Fresh read at {datetime.now().isoformat()}]\n{content}\n"
            return None
        except Exception as e:
            return f"[Error reading {file_path}: {e}]"
    
    def get_active_task(self):
        """Get the currently active task if any."""
        state_file = self.project_dir / '.claude' / 'meta_agent_state.json'
        if state_file.exists():
            try:
                with open(state_file, 'r') as f:
                    state = json.load(f)
                return state.get('current_task')
            except:
                pass
        return None
    
    def find_relevant_docs(self, prompt):
        """Find relevant documentation based on prompt content."""
        relevant_docs = []
        
        # Check for keywords in prompt
        prompt_lower = prompt.lower()
        
        # Map keywords to documentation
        doc_mapping = {
            'auth': ['nextauth', 'oauth', 'jwt'],
            'database': ['postgresql', 'prisma', 'sql'],
            'api': ['fastapi', 'rest', 'endpoints'],
            'react': ['react', 'component', 'frontend'],
            'test': ['pytest', 'testing', 'validation']
        }
        
        # Find matching docs
        for keyword, doc_names in doc_mapping.items():
            if keyword in prompt_lower:
                for doc_name in doc_names:
                    doc_path = self.resource_library / 'dependencies' / f'{doc_name}.md'
                    if doc_path.exists():
                        relevant_docs.append(doc_path)
        
        return relevant_docs[:3]  # Limit to 3 most relevant
    
    def inject_context(self, hook_input):
        """Main context injection logic."""
        prompt = hook_input.get('prompt', '')
        
        # Start building additional context
        context_parts = []
        
        # 1. ALWAYS inject fresh CLAUDE.md
        claude_md_path = self.project_dir / 'CLAUDE.md'
        claude_content = self.read_fresh(claude_md_path)
        if claude_content:
            context_parts.append("=== PROJECT CONTEXT (CLAUDE.md) ===")
            context_parts.append(claude_content)
        
        # 2. Inject current task.md if there's an active task
        active_task = self.get_active_task()
        if active_task:
            task_dir = self.project_dir / 'tasks' / active_task.get('task_id', '')
            task_md_path = task_dir / 'task.md'
            task_content = self.read_fresh(task_md_path)
            if task_content:
                context_parts.append(f"=== CURRENT TASK CONTEXT ({active_task.get('task_id', 'unknown')}) ===")
                context_parts.append(task_content)
        
        # 3. Find and inject relevant documentation
        relevant_docs = self.find_relevant_docs(prompt)
        for doc_path in relevant_docs:
            doc_content = self.read_fresh(doc_path)
            if doc_content:
                context_parts.append(f"=== DOCUMENTATION: {doc_path.stem} ===")
                context_parts.append(doc_content)
        
        # 4. Add meta-agent specific context
        meta_agent_context = f"""
=== META-AGENT CONTEXT ===
[Injected at {datetime.now().isoformat()}]

CRITICAL RULES FOR META-AGENT SYSTEM:
1. All tasks must be broken into micro-tasks of 5-20 LINES OF CODE (not minutes!)
2. Every decision must be based on FRESH reads of documentation (not cached)
3. Resource library is at: {self.resource_library}
4. Use the Task tool to execute micro-tasks with proper agent selection

Current resource library structure:
- {self.resource_library}/project/ - Project-wide resources
- {self.resource_library}/dependencies/ - External service documentation
- {self.resource_library}/tasks/ - Task-specific resources
"""
        context_parts.append(meta_agent_context)
        
        # Combine all context
        if context_parts:
            additional_context = "\n\n".join(context_parts)
            
            return {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": additional_context
                }
            }
        
        # No additional context needed
        return {}


def main():
    """Main entry point for the hook."""
    try:
        # Read hook input from stdin
        hook_input = json.load(sys.stdin)
        
        # Create hook handler
        hook = ContextInjectorHook()
        
        # Inject context
        result = hook.inject_context(hook_input)
        
        # Output result (empty dict means no injection)
        if result:
            print(json.dumps(result))
        
        sys.exit(0)
        
    except Exception as e:
        # On error, don't inject anything
        # Don't output anything if we don't want to inject
        sys.exit(0)


if __name__ == "__main__":
    main()