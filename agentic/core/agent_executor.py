#!/usr/bin/env python3
"""
Agent Executor for Agentic Development System
Executes agent chains and manages workflow orchestration
"""

import json
import subprocess
import os
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
import tempfile
import shlex


class AgentExecutor:
    """Execute agent chains and manage workflows"""
    
    def __init__(self, 
                 agents_dir: str = "/Users/don/.claude/agents",
                 chains_dir: str = "/Users/don/D3/chains",
                 logs_dir: str = "/Users/don/D3/agentic/logs"):
        self.agents_dir = Path(agents_dir)
        self.chains_dir = Path(chains_dir)
        self.logs_dir = Path(logs_dir)
        
        # Create directories if they don't exist
        self.chains_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        
    def execute_agent_task(self, agent_type: str, description: str, prompt: str) -> Dict[str, Any]:
        """
        Execute a single agent task using the Task tool
        
        This simulates what Claude would do when using the Task tool
        """
        # Create execution log
        execution_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = self.logs_dir / f"agent_{agent_type}_{execution_id}.log"
        
        # Log the execution
        log_data = {
            "timestamp": datetime.now().isoformat(),
            "agent_type": agent_type,
            "description": description,
            "prompt": prompt,
            "status": "started"
        }
        
        with open(log_file, "w") as f:
            json.dump(log_data, f, indent=2)
        
        # For now, return a mock response
        # In a real implementation, this would interface with Claude's Task tool
        result = {
            "agent_type": agent_type,
            "status": "completed",
            "output": f"[{agent_type}] Task completed: {description}",
            "execution_id": execution_id
        }
        
        # Update log
        log_data["status"] = "completed"
        log_data["result"] = result
        log_data["end_timestamp"] = datetime.now().isoformat()
        
        with open(log_file, "w") as f:
            json.dump(log_data, f, indent=2)
            
        return result
    
    def parse_task_blocks(self, content: str) -> List[Dict[str, str]]:
        """Parse <Task> blocks from command template"""
        tasks = []
        
        # Find all <Task> blocks
        task_pattern = r'<Task>\s*(.*?)\s*</Task>'
        matches = re.finditer(task_pattern, content, re.DOTALL)
        
        for match in matches:
            task_content = match.group(1)
            task_data = {}
            
            # Extract fields from task block
            field_patterns = {
                'description': r'<description>(.*?)</description>',
                'prompt': r'<prompt>(.*?)</prompt>',
                'subagent_type': r'<subagent_type>(.*?)</subagent_type>'
            }
            
            for field, pattern in field_patterns.items():
                field_match = re.search(pattern, task_content, re.DOTALL)
                if field_match:
                    task_data[field] = field_match.group(1).strip()
            
            if all(field in task_data for field in ['description', 'prompt', 'subagent_type']):
                tasks.append(task_data)
        
        return tasks
    
    def execute_chain(self, chain_name: str, tasks: List[Dict[str, str]], 
                     context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute a chain of agent tasks"""
        
        # Create chain execution record
        chain_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        chain_dir = self.chains_dir / f"chain_{chain_name}_{chain_id}"
        chain_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize chain context
        chain_context = context or {}
        chain_results = []
        
        # Log chain start
        chain_log = {
            "chain_id": chain_id,
            "chain_name": chain_name,
            "start_time": datetime.now().isoformat(),
            "tasks": tasks,
            "initial_context": chain_context
        }
        
        with open(chain_dir / "chain.json", "w") as f:
            json.dump(chain_log, f, indent=2)
        
        # Execute each task in sequence
        for i, task in enumerate(tasks):
            print(f"\n[PHASE {i}] Executing: {task['description']}")
            
            # Inject context into prompt
            prompt = task['prompt']
            
            # Replace context placeholders
            for key, value in chain_context.items():
                placeholder = f"[{key}]"
                if placeholder in prompt:
                    prompt = prompt.replace(placeholder, str(value))
            
            # Execute the task
            result = self.execute_agent_task(
                agent_type=task['subagent_type'],
                description=task['description'],
                prompt=prompt
            )
            
            # Store result
            chain_results.append(result)
            
            # Update context for next task
            context_key = f"PHASE_{i}_RESULT"
            chain_context[context_key] = result['output']
            
            # Save intermediate state
            with open(chain_dir / f"phase_{i}_result.json", "w") as f:
                json.dump(result, f, indent=2)
        
        # Complete chain execution
        chain_log["end_time"] = datetime.now().isoformat()
        chain_log["results"] = chain_results
        chain_log["final_context"] = chain_context
        chain_log["status"] = "completed"
        
        with open(chain_dir / "chain.json", "w") as f:
            json.dump(chain_log, f, indent=2)
        
        return {
            "chain_id": chain_id,
            "chain_dir": str(chain_dir),
            "results": chain_results,
            "context": chain_context
        }
    
    def get_agent_info(self, agent_name: str) -> Optional[Dict[str, str]]:
        """Get information about a specific agent"""
        agent_file = self.agents_dir / f"{agent_name}.md"
        
        if not agent_file.exists():
            return None
            
        content = agent_file.read_text()
        
        # Parse frontmatter
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                frontmatter = parts[1].strip()
                body = parts[2].strip()
                
                # Parse metadata
                metadata = {}
                for line in frontmatter.split("\n"):
                    if ":" in line:
                        key, value = line.split(":", 1)
                        metadata[key.strip()] = value.strip()
                
                return {
                    "name": agent_name,
                    "metadata": metadata,
                    "description": body
                }
        
        return None
    
    def list_available_agents(self) -> List[Dict[str, str]]:
        """List all available agents"""
        agents = []
        
        if self.agents_dir.exists():
            for agent_file in self.agents_dir.glob("*.md"):
                agent_info = self.get_agent_info(agent_file.stem)
                if agent_info:
                    agents.append({
                        "name": agent_info["name"],
                        "description": agent_info["metadata"].get("description", "No description")
                    })
        
        return sorted(agents, key=lambda x: x["name"])