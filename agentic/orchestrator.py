#!/usr/bin/env python3
"""
Main Orchestrator for Agentic Development System
Coordinates slash commands, agent execution, and task management
"""

import sys
import argparse
from pathlib import Path
from typing import Optional, Dict, Any

# Add core modules to path
sys.path.insert(0, str(Path(__file__).parent))

from core.command_parser import CommandParser
from core.agent_executor import AgentExecutor


class AgenticOrchestrator:
    """Main orchestrator for the agentic development system"""
    
    def __init__(self):
        self.parser = CommandParser()
        self.executor = AgentExecutor()
        
    def process_command(self, command_text: str) -> Dict[str, Any]:
        """Process a slash command"""
        
        # Parse the command
        command, arguments, error = self.parser.parse(command_text)
        
        if error:
            return {
                "status": "error",
                "message": error,
                "available_commands": self.parser.list_commands()
            }
        
        print(f"\n[ORCHESTRATOR] Processing command: /{command} {arguments}")
        
        # Expand the command template
        expanded_template = self.parser.expand_template(command, arguments)
        
        if not expanded_template:
            return {
                "status": "error",
                "message": f"Failed to expand template for command: {command}"
            }
        
        # Parse task blocks from the expanded template
        tasks = self.executor.parse_task_blocks(expanded_template)
        
        if not tasks:
            # If no task blocks, it's a simple command
            return {
                "status": "success",
                "command": command,
                "arguments": arguments,
                "output": expanded_template
            }
        
        # Execute the task chain
        print(f"\n[ORCHESTRATOR] Found {len(tasks)} tasks to execute")
        
        # Initial context includes the arguments
        initial_context = {
            "USER_REQUEST": arguments,
            "COMMAND": command
        }
        
        # Execute the chain
        result = self.executor.execute_chain(
            chain_name=command,
            tasks=tasks,
            context=initial_context
        )
        
        return {
            "status": "success",
            "command": command,
            "arguments": arguments,
            "chain_result": result
        }
    
    def list_commands(self) -> list:
        """List all available commands"""
        return self.parser.list_commands()
    
    def list_agents(self) -> list:
        """List all available agents"""
        return self.executor.list_available_agents()


def main():
    """CLI interface for the orchestrator"""
    parser = argparse.ArgumentParser(
        description="Agentic Development System Orchestrator"
    )
    
    parser.add_argument(
        "command",
        nargs="?",
        help="Slash command to execute (e.g., '/start-task Create login form')"
    )
    
    parser.add_argument(
        "--list-commands",
        action="store_true",
        help="List all available commands"
    )
    
    parser.add_argument(
        "--list-agents",
        action="store_true",
        help="List all available agents"
    )
    
    parser.add_argument(
        "--interactive",
        "-i",
        action="store_true",
        help="Run in interactive mode"
    )
    
    args = parser.parse_args()
    
    # Initialize orchestrator
    orchestrator = AgenticOrchestrator()
    
    # Handle list operations
    if args.list_commands:
        print("\nAvailable Commands:")
        print("-" * 50)
        for cmd in orchestrator.list_commands():
            hint = f" {cmd['hint']}" if cmd['hint'] else ""
            print(f"/{cmd['name']:<20} - {cmd['description']}{hint}")
        return
    
    if args.list_agents:
        print("\nAvailable Agents:")
        print("-" * 50)
        for agent in orchestrator.list_agents():
            print(f"{agent['name']:<30} - {agent['description']}")
        return
    
    # Handle command execution
    if args.command:
        result = orchestrator.process_command(args.command)
        
        if result["status"] == "error":
            print(f"\nError: {result['message']}")
            if "available_commands" in result:
                print("\nAvailable commands:")
                for cmd in result["available_commands"]:
                    print(f"  /{cmd['name']} - {cmd['description']}")
        else:
            print(f"\nCommand executed successfully!")
            if "chain_result" in result:
                print(f"Chain ID: {result['chain_result']['chain_id']}")
                print(f"Results saved to: {result['chain_result']['chain_dir']}")
    
    # Interactive mode
    elif args.interactive:
        print("Agentic Development System - Interactive Mode")
        print("Type '/help' for available commands or 'exit' to quit")
        print("-" * 50)
        
        while True:
            try:
                command = input("\n> ").strip()
                
                if command.lower() in ["exit", "quit"]:
                    break
                
                if command == "/help":
                    print("\nAvailable Commands:")
                    for cmd in orchestrator.list_commands():
                        hint = f" {cmd['hint']}" if cmd['hint'] else ""
                        print(f"  /{cmd['name']:<20} - {cmd['description']}{hint}")
                    continue
                
                if command:
                    result = orchestrator.process_command(command)
                    
                    if result["status"] == "error":
                        print(f"\nError: {result['message']}")
                    else:
                        print(f"\nSuccess! Check the output above.")
                        
            except KeyboardInterrupt:
                print("\n\nExiting...")
                break
            except Exception as e:
                print(f"\nError: {e}")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()