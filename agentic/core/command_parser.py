#!/usr/bin/env python3
"""
Command Parser for Agentic Development System
Parses and validates slash commands for agent orchestration
"""

import re
from typing import Optional, Dict, Tuple, List
from pathlib import Path
import json


class CommandParser:
    """Parse and validate slash commands"""
    
    def __init__(self, commands_dir: str = "/Users/don/.claude/commands"):
        self.commands_dir = Path(commands_dir)
        self.commands = self._load_commands()
    
    def _load_commands(self) -> Dict[str, Dict]:
        """Load all command definitions from markdown files"""
        commands = {}
        
        if not self.commands_dir.exists():
            return commands
            
        for cmd_file in self.commands_dir.glob("*.md"):
            cmd_name = cmd_file.stem
            
            # Parse command metadata from frontmatter
            content = cmd_file.read_text()
            if content.startswith("---"):
                # Extract frontmatter
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    frontmatter = parts[1].strip()
                    body = parts[2].strip()
                    
                    # Parse frontmatter
                    metadata = {}
                    for line in frontmatter.split("\n"):
                        if ":" in line:
                            key, value = line.split(":", 1)
                            metadata[key.strip()] = value.strip()
                    
                    commands[cmd_name] = {
                        "metadata": metadata,
                        "template": body,
                        "file": str(cmd_file)
                    }
        
        return commands
    
    def parse(self, input_text: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Parse a slash command from user input
        
        Returns:
            Tuple of (command_name, arguments, error_message)
        """
        # Trim whitespace
        input_text = input_text.strip()
        
        # Check if it's a slash command
        if not input_text.startswith("/"):
            return None, None, "Not a slash command"
        
        # Extract command and arguments
        match = re.match(r'^/(\S+)(?:\s+(.+))?$', input_text)
        if not match:
            return None, None, "Invalid command format"
        
        command = match.group(1)
        arguments = match.group(2) or ""
        
        # Map common variations to canonical commands
        command_aliases = {
            "start-task": "smart-task",
            "start": "smart-task",
            "task": "smart-task",
            "init": "init-project",
            "complete": "complete-task",
            "test": "redteam",
            "test-task": "redteam"
        }
        
        # Normalize command name
        command = command_aliases.get(command, command)
        
        # Validate command exists
        if command not in self.commands:
            available = ", ".join(sorted(self.commands.keys()))
            return None, None, f"Unknown command: /{command}. Available: {available}"
        
        return command, arguments, None
    
    def get_command_template(self, command: str) -> Optional[str]:
        """Get the template for a command"""
        if command in self.commands:
            return self.commands[command]["template"]
        return None
    
    def expand_template(self, command: str, arguments: str) -> str:
        """Expand a command template with arguments"""
        template = self.get_command_template(command)
        if not template:
            return ""
        
        # Replace $ARGUMENTS placeholder
        expanded = template.replace("$ARGUMENTS", arguments)
        
        # Handle any other variables if needed
        # For now, just return the expanded template
        return expanded
    
    def list_commands(self) -> List[Dict[str, str]]:
        """List all available commands with descriptions"""
        result = []
        for name, cmd_data in self.commands.items():
            result.append({
                "name": name,
                "description": cmd_data["metadata"].get("description", "No description"),
                "hint": cmd_data["metadata"].get("argument-hint", "")
            })
        return sorted(result, key=lambda x: x["name"])