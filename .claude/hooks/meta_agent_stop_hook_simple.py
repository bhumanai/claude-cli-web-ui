#!/usr/bin/env python3
"""
Simple Meta-Agent Stop Hook for Claude Code CLI

Works with .md files and JSON state - no complex dependencies.
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path


class SimpleMetaAgentStopHook:
    """Simple hook that works with .md files and basic JSON state."""
    
    def __init__(self):
        self.project_dir = Path(os.environ.get('CLAUDE_PROJECT_DIR', ''))
        self.state_file = self.project_dir / '.claude' / 'meta_agent_state.json'
        self.tasks_dir = self.project_dir / '.claude' / 'meta_agent_tasks'
        
    def load_state(self):
        """Load state from JSON file."""
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {
            "active": False,
            "current_task_index": 0,
            "tasks": [],
            "completed_tasks": []
        }
    
    def save_state(self, state):
        """Save state to JSON file."""
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, 'w') as f:
            json.dump(state, f, indent=2)
    
    def load_task_file(self, task_name):
        """Load a task definition from .md file."""
        task_file = self.tasks_dir / f"{task_name}.md"
        if task_file.exists():
            with open(task_file, 'r') as f:
                return f.read()
        return None
    
    def analyze_transcript(self, transcript_path):
        """Simple transcript analysis."""
        try:
            with open(transcript_path, 'r') as f:
                content = f.read()
            
            # Simple checks
            has_error = "error" in content.lower() or "failed" in content.lower()
            has_completion = "completed" in content.lower() or "done" in content.lower()
            
            return {
                "has_error": has_error,
                "has_completion": has_completion
            }
        except:
            return {"has_error": False, "has_completion": False}
    
    def make_decision(self, hook_input):
        """Decide whether to continue with next task."""
        # Prevent loops
        if hook_input.get("stop_hook_active", False):
            return {"continue": True}
        
        # Load state
        state = self.load_state()
        
        # If not active, stop
        if not state["active"] or not state["tasks"]:
            return {"continue": True}
        
        # Analyze what happened
        transcript_path = hook_input.get("transcript_path", "")
        if transcript_path:
            analysis = self.analyze_transcript(transcript_path)
            
            # Stop on errors
            if analysis["has_error"]:
                state["active"] = False
                self.save_state(state)
                return {"continue": True}
            
            # If task completed, move to next
            if analysis["has_completion"]:
                current_index = state["current_task_index"]
                if current_index < len(state["tasks"]) - 1:
                    # Mark current as complete
                    state["completed_tasks"].append(state["tasks"][current_index])
                    
                    # Move to next
                    state["current_task_index"] = current_index + 1
                    next_task = state["tasks"][current_index + 1]
                    self.save_state(state)
                    
                    return {
                        "decision": "block",
                        "reason": f"Next micro-task: {next_task}"
                    }
                else:
                    # All tasks done
                    state["active"] = False
                    state["completed_tasks"] = state["tasks"]
                    self.save_state(state)
                    return {"continue": True}
        
        return {"continue": True}


def main():
    """Main entry point."""
    try:
        # Read input
        hook_input = json.load(sys.stdin)
        
        # Process
        hook = SimpleMetaAgentStopHook()
        result = hook.make_decision(hook_input)
        
        # Output
        print(json.dumps(result))
        sys.exit(0)
        
    except Exception as e:
        # Let Claude stop on errors
        print(json.dumps({"continue": True}))
        sys.exit(0)


if __name__ == "__main__":
    main()