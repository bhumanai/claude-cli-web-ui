#!/usr/bin/env python3
"""
Claude Integration Example for Agentic Development System

This shows how the agentic system would integrate with Claude's Task tool.
In practice, Claude would use the Task tool to execute these agent chains.
"""

import json
from typing import Dict, Any
from pathlib import Path
from orchestrator import AgenticOrchestrator


class ClaudeAgenticInterface:
    """
    Interface between Claude and the Agentic Development System
    
    This simulates how Claude would interact with the system:
    1. User types a slash command
    2. Claude recognizes it and calls this interface
    3. Interface parses and executes the command chain
    4. Results are returned to Claude for display
    """
    
    def __init__(self):
        self.orchestrator = AgenticOrchestrator()
        
    def process_user_command(self, user_input: str) -> Dict[str, Any]:
        """
        Process a user's slash command input
        
        This would be called by Claude when it detects a slash command
        """
        print(f"\n[CLAUDE] User input: {user_input}")
        
        # Check if it's a slash command
        if not user_input.strip().startswith("/"):
            return {
                "type": "normal_message",
                "content": user_input
            }
        
        # Process the command
        result = self.orchestrator.process_command(user_input)
        
        # Format response for Claude
        if result["status"] == "error":
            response = {
                "type": "command_error",
                "error": result["message"],
                "suggestions": result.get("available_commands", [])
            }
        else:
            response = {
                "type": "command_success",
                "command": result["command"],
                "arguments": result["arguments"]
            }
            
            # If there's a chain result, include task instructions
            if "chain_result" in result:
                chain_tasks = []
                for i, task_result in enumerate(result["chain_result"]["results"]):
                    chain_tasks.append({
                        "phase": i,
                        "agent_type": task_result["agent_type"],
                        "description": f"Execute {task_result['agent_type']} agent",
                        "status": task_result["status"]
                    })
                
                response["claude_instructions"] = {
                    "message": "Execute the following agent chain using the Task tool:",
                    "tasks": chain_tasks,
                    "chain_id": result["chain_result"]["chain_id"]
                }
        
        return response
    
    def generate_claude_response(self, command_result: Dict[str, Any]) -> str:
        """
        Generate a response that Claude would give to the user
        
        This shows how Claude would format the response after processing
        """
        if command_result["type"] == "command_error":
            response = f"I couldn't process that command: {command_result['error']}\n\n"
            
            if command_result.get("suggestions"):
                response += "Available commands:\n"
                for cmd in command_result["suggestions"]:
                    response += f"- /{cmd['name']} - {cmd['description']}\n"
            
            return response
        
        elif command_result["type"] == "command_success":
            response = f"I'll {command_result['command']} for: {command_result['arguments']}\n\n"
            
            if "claude_instructions" in command_result:
                instructions = command_result["claude_instructions"]
                response += f"{instructions['message']}\n\n"
                
                for task in instructions["tasks"]:
                    response += f"[PHASE {task['phase']}] {task['description']}\n"
                
                response += f"\nChain ID: {instructions['chain_id']}"
            
            return response
        
        else:
            return "Processing your request..."


def example_usage():
    """Show example usage of the Claude integration"""
    
    # Create interface
    claude_interface = ClaudeAgenticInterface()
    
    # Example commands
    test_commands = [
        "/start-task Create a user authentication system",
        "/init-project",
        "/test-task authentication module",
        "/invalid-command test",
        "This is not a command"
    ]
    
    print("=== Claude Agentic Integration Example ===\n")
    
    for command in test_commands:
        print(f"\n{'='*60}")
        print(f"USER: {command}")
        print(f"{'='*60}")
        
        # Process command
        result = claude_interface.process_user_command(command)
        
        # Generate Claude's response
        claude_response = claude_interface.generate_claude_response(result)
        print(f"\nCLAUDE: {claude_response}")
        
        # Show internal details
        print(f"\n[DEBUG] Command result type: {result['type']}")
        if "claude_instructions" in result:
            print(f"[DEBUG] Would execute {len(result['claude_instructions']['tasks'])} tasks")


if __name__ == "__main__":
    example_usage()