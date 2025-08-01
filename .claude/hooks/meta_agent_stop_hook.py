#!/usr/bin/env python3
"""
Meta-Agent Stop Hook for Claude Code CLI

This hook is triggered when Claude finishes responding (Stop event).
It analyzes the transcript and decides whether to continue with the next
micro-task or stop for human review.
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', ''), 'backend'))

try:
    from app.services.meta_agent.orchestrator import MetaAgentOrchestrator
    from app.services.redis_client import RedisClient
    from app.services.command_executor import CommandExecutor
except ImportError as e:
    # If imports fail, just let Claude stop normally
    print(json.dumps({"continue": True, "error": f"Import error: {e}"}))
    sys.exit(0)


class MetaAgentStopHook:
    """Handles Stop hook events for meta-agent orchestration."""
    
    def __init__(self):
        self.project_dir = os.environ.get('CLAUDE_PROJECT_DIR', '')
        self.state_file = Path(self.project_dir) / '.claude' / 'meta_agent_state.json'
        
    def load_state(self):
        """Load meta-agent state from file."""
        if self.state_file.exists():
            with open(self.state_file, 'r') as f:
                return json.load(f)
        return {
            "active": False,
            "current_workflow": None,
            "current_task": None,
            "tasks_queue": []
        }
    
    def save_state(self, state):
        """Save meta-agent state to file."""
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, 'w') as f:
            json.dump(state, f, indent=2)
    
    def analyze_transcript(self, transcript_path):
        """Analyze the transcript to understand what happened."""
        try:
            with open(transcript_path, 'r') as f:
                transcript_lines = f.readlines()
            
            # Parse JSONL transcript
            entries = []
            for line in transcript_lines:
                if line.strip():
                    try:
                        entries.append(json.loads(line))
                    except:
                        continue
            
            # Look for task completion, errors, etc.
            analysis = {
                "task_completed": False,
                "errors_found": [],
                "files_created": [],
                "files_modified": []
            }
            
            for entry in entries:
                if entry.get("type") == "tool_use":
                    tool = entry.get("tool", "")
                    if tool in ["Write", "MultiEdit", "Edit"]:
                        if "file_path" in entry.get("input", {}):
                            if tool == "Write":
                                analysis["files_created"].append(entry["input"]["file_path"])
                            else:
                                analysis["files_modified"].append(entry["input"]["file_path"])
                    
                    # Check for errors
                    if "error" in entry.get("result", {}):
                        analysis["errors_found"].append(entry["result"]["error"])
                
                elif entry.get("type") == "assistant" and entry.get("role") == "assistant":
                    content = entry.get("content", {})
                    if isinstance(content, dict):
                        text = content.get("text", "").lower()
                    else:
                        text = str(content).lower()
                    
                    # Simple completion detection
                    if any(word in text for word in ["completed", "finished", "done"]):
                        analysis["task_completed"] = True
            
            return analysis
            
        except Exception as e:
            return {"error": str(e)}
    
    def make_decision(self, hook_input):
        """Decide whether to continue with next task or stop."""
        # Prevent infinite loops
        if hook_input.get("stop_hook_active", False):
            return {"continue": True}
        
        # Load current state
        state = self.load_state()
        
        # If no active workflow, let Claude stop
        if not state["active"] or not state["tasks_queue"]:
            return {"continue": True}
        
        # Analyze what just happened
        transcript_path = hook_input.get("transcript_path", "")
        if transcript_path and os.path.exists(transcript_path):
            analysis = self.analyze_transcript(transcript_path)
            
            # If errors found, stop for human review
            if analysis.get("errors_found"):
                state["active"] = False
                self.save_state(state)
                return {
                    "decision": "block",
                    "reason": f"Errors detected: {analysis['errors_found'][0]}. Stopping for human review."
                }
            
            # If task completed successfully, move to next
            if analysis.get("task_completed") and state["tasks_queue"]:
                next_task = state["tasks_queue"].pop(0)
                state["current_task"] = next_task
                self.save_state(state)
                
                return {
                    "decision": "block",
                    "reason": f"Continuing with next micro-task: {next_task['description']}"
                }
        
        # Default: let Claude stop
        return {"continue": True}


def main():
    """Main entry point for the hook."""
    try:
        # Read hook input from stdin
        hook_input = json.load(sys.stdin)
        
        # Create hook handler
        hook = MetaAgentStopHook()
        
        # Make decision
        result = hook.make_decision(hook_input)
        
        # Output result
        print(json.dumps(result))
        sys.exit(0)
        
    except Exception as e:
        # On any error, let Claude stop normally
        print(json.dumps({"continue": True, "error": str(e)}))
        sys.exit(0)


if __name__ == "__main__":
    main()