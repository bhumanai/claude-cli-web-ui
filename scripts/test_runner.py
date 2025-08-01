#!/usr/bin/env python3
"""
Bulletproof LLM-Based Visual Software Testing Framework
Test Runner Orchestration Script
"""

import json
import subprocess
import sys
import os
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import shutil
import logging

# Configure logging - ensure directory exists
os.makedirs('artifacts', exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('artifacts/test_runner.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class TestRunner:
    def __init__(self):
        self.artifacts_dir = Path("artifacts")
        self.paths_dir = self.artifacts_dir / "paths"
        self.archive_dir = self.artifacts_dir / "archive"
        self.max_retries = 3
        self.timeout_seconds = 30
        
        # Ensure directories exist
        self.artifacts_dir.mkdir(exist_ok=True)
        self.paths_dir.mkdir(exist_ok=True)
        self.archive_dir.mkdir(exist_ok=True)

    def save_artifact(self, path_id: str, name: str, data: dict) -> None:
        """Save artifact data to path-specific directory"""
        path_dir = self.paths_dir / path_id
        path_dir.mkdir(exist_ok=True)
        
        artifact_file = path_dir / name
        with open(artifact_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        logger.info(f"Saved artifact: {artifact_file}")

    def invoke_subagent(self, agent_name: str, context: dict) -> dict:
        """Invoke a Claude Code subagent with context and return parsed output"""
        logger.info(f"Invoking subagent: {agent_name}")
        
        try:
            # Use claude code to invoke the subagent
            proc = subprocess.run(
                ['claude', 'code', '--agent', agent_name],
                input=json.dumps(context, default=str),
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds
            )
            
            if proc.returncode != 0:
                error_context = {
                    "path_id": context.get("path_id", "unknown"),
                    "error_type": "subagent_failure", 
                    "error_details": proc.stderr,
                    "failed_subagent": agent_name,
                    "context": context,
                    "retry_count": 0
                }
                return self.invoke_subagent("infra-watchdog", error_context)
            
            # Parse JSON output
            try:
                output = json.loads(proc.stdout)
                logger.info(f"Subagent {agent_name} completed successfully")
                return output
            except json.JSONDecodeError as e:
                error_context = {
                    "path_id": context.get("path_id", "unknown"),
                    "error_type": "invalid_json",
                    "error_details": f"Failed to parse JSON: {e}. Raw output: {proc.stdout}",
                    "failed_subagent": agent_name,
                    "context": context,
                    "retry_count": 0
                }
                return self.invoke_subagent("infra-watchdog", error_context)
                
        except subprocess.TimeoutExpired:
            error_context = {
                "path_id": context.get("path_id", "unknown"),
                "error_type": "timeout",
                "error_details": f"Subagent {agent_name} timed out after {self.timeout_seconds}s",
                "failed_subagent": agent_name,
                "context": context,
                "retry_count": 0
            }
            return self.invoke_subagent("infra-watchdog", error_context)
        
        except Exception as e:
            logger.error(f"Unexpected error invoking {agent_name}: {e}")
            error_context = {
                "path_id": context.get("path_id", "unknown"),
                "error_type": "subagent_failure",
                "error_details": str(e),
                "failed_subagent": agent_name,
                "context": context,
                "retry_count": 0
            }
            return self.invoke_subagent("infra-watchdog", error_context)

    def execute_agent_chain(self, initial_agent: str, initial_context: dict) -> dict:
        """Execute a chain of agents until completion"""
        current_agent = initial_agent
        current_context = initial_context
        execution_log = []
        
        while current_agent:
            start_time = time.time()
            
            # Invoke the current agent
            output = self.invoke_subagent(current_agent, current_context)
            
            execution_time = time.time() - start_time
            
            # Log execution details
            execution_entry = {
                "agent": current_agent,
                "execution_time_seconds": execution_time,
                "timestamp": datetime.now().isoformat(),
                "success": True
            }
            execution_log.append(execution_entry)
            
            # Save agent output as artifact
            path_id = current_context.get("path_id", "unknown")
            self.save_artifact(path_id, f"{current_agent}_output.json", output)
            
            # Update context and get next agent
            current_context = output.get("context", current_context)
            current_agent = output.get("next_subagent")
            
            logger.info(f"Next subagent: {current_agent}")
        
        # Save execution log
        final_context = current_context.copy()
        final_context["execution_log"] = execution_log
        
        return final_context

    def start_flow(self, flow_id: str, persona_id: str, url: str) -> dict:
        """Start a new test flow"""
        logger.info(f"Starting flow: {flow_id} with persona: {persona_id}")
        
        # Load persona profile
        persona_profile = self.load_persona_profile(persona_id)
        
        initial_context = {
            "flow_id": flow_id,
            "persona_profile": persona_profile,
            "entry_url": url
        }
        
        return self.execute_agent_chain("flow-generator", initial_context)

    def audit_path(self, path_id: str) -> dict:
        """Audit a completed test path"""
        logger.info(f"Auditing path: {path_id}")
        
        # Load path artifacts
        path_dir = self.paths_dir / path_id
        if not path_dir.exists():
            raise FileNotFoundError(f"Path artifacts not found: {path_id}")
        
        # Reconstruct context from artifacts
        context = self.load_path_context(path_id)
        
        return self.execute_agent_chain("verifier", context)

    def replay_path(self, path_id: str, speed: float = 1.0, format: str = "mp4") -> str:
        """Generate video replay of test path"""
        logger.info(f"Creating replay for path: {path_id}")
        
        path_dir = self.paths_dir / path_id
        if not path_dir.exists():
            raise FileNotFoundError(f"Path artifacts not found: {path_id}")
        
        # Find all screenshots
        screenshots = sorted(path_dir.glob("screenshot_*.png"))
        
        if not screenshots:
            raise FileNotFoundError(f"No screenshots found for path: {path_id}")
        
        # Create video using ffmpeg
        output_file = path_dir / f"replay.{format}"
        
        # Calculate frame rate based on speed
        fps = max(1, int(2 * speed))  # Base 2 FPS adjusted by speed
        
        subprocess.run([
            "ffmpeg", "-y",
            "-pattern_type", "glob",
            "-i", str(path_dir / "screenshot_*.png"),
            "-r", str(fps),
            "-pix_fmt", "yuv420p",
            str(output_file)
        ], check=True)
        
        logger.info(f"Replay saved: {output_file}")
        return str(output_file)

    def optimize_path(self, path_id: str, focus: str = None) -> dict:
        """Optimize a test path with UX recommendations"""
        logger.info(f"Optimizing path: {path_id}")
        
        context = self.load_path_context(path_id)
        if focus:
            context["optimization_focus"] = focus
        
        return self.execute_agent_chain("ux-reflector", context)

    def regenerate_path(self, path_id: str, retry_count: int = 3, debug: bool = False) -> dict:
        """Regenerate a failed test path"""
        logger.info(f"Regenerating path: {path_id}")
        
        context = self.load_path_context(path_id)
        context["regeneration_mode"] = True
        context["max_retries"] = retry_count
        context["debug_mode"] = debug
        
        return self.execute_agent_chain("test-executor", context)

    def purge_artifacts(self, before_date: str, dry_run: bool = False, archive: bool = False) -> dict:
        """Purge old artifacts"""
        cutoff_date = datetime.strptime(before_date, "%Y-%m-%d")
        logger.info(f"Purging artifacts before: {cutoff_date}")
        
        purged_paths = []
        total_size = 0
        
        for path_dir in self.paths_dir.iterdir():
            if not path_dir.is_dir():
                continue
            
            # Check creation time
            creation_time = datetime.fromtimestamp(path_dir.stat().st_ctime)
            if creation_time >= cutoff_date:
                continue
            
            # Calculate size
            path_size = sum(f.stat().st_size for f in path_dir.rglob("*") if f.is_file())
            total_size += path_size
            
            purged_paths.append({
                "path_id": path_dir.name,
                "creation_time": creation_time.isoformat(),
                "size_bytes": path_size
            })
            
            if not dry_run:
                if archive:
                    # Create archive
                    archive_name = f"{path_dir.name}_{creation_time.strftime('%Y%m%d')}.tar.gz"
                    archive_path = self.archive_dir / archive_name
                    
                    subprocess.run([
                        "tar", "-czf", str(archive_path), 
                        "-C", str(self.paths_dir), path_dir.name
                    ], check=True)
                    
                    logger.info(f"Archived: {archive_path}")
                
                # Remove original
                shutil.rmtree(path_dir)
                logger.info(f"Removed: {path_dir}")
        
        return {
            "action": "archive" if archive else "delete",
            "dry_run": dry_run,
            "purged_paths": purged_paths,
            "total_paths": len(purged_paths),
            "total_size_bytes": total_size,
            "cutoff_date": cutoff_date.isoformat()
        }

    def load_persona_profile(self, persona_id: str) -> dict:
        """Load persona profile from catalog"""
        personas_file = Path("flow_catalog.json")
        if personas_file.exists():
            with open(personas_file) as f:
                catalog = json.load(f)
                return catalog.get("personas", {}).get(persona_id, {})
        
        # Default persona if not found
        return {
            "name": persona_id,
            "goals": ["complete the task efficiently"],
            "technical_level": "intermediate",
            "preferences": ["clear navigation", "fast interactions"],
            "pain_points": ["confusing forms", "slow loading"]
        }

    def load_path_context(self, path_id: str) -> dict:
        """Reconstruct context from saved artifacts"""
        path_dir = self.paths_dir / path_id
        
        # Try to load the most recent context
        context_files = [
            "ux-reflector_output.json",
            "assertion-checker_output.json", 
            "verifier_output.json",
            "test-executor_output.json"
        ]
        
        for context_file in context_files:
            file_path = path_dir / context_file
            if file_path.exists():
                with open(file_path) as f:
                    data = json.load(f)
                    return data.get("context", {})
        
        raise FileNotFoundError(f"No context found for path: {path_id}")

def main():
    parser = argparse.ArgumentParser(description="Visual Test Runner")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Start command
    start_parser = subparsers.add_parser("start", help="Start test flow")
    start_parser.add_argument("--flow", required=True, help="Flow ID")
    start_parser.add_argument("--persona", required=True, help="Persona ID")  
    start_parser.add_argument("--url", required=True, help="Entry URL")
    
    # Audit command
    audit_parser = subparsers.add_parser("audit", help="Audit test path")
    audit_parser.add_argument("--path", required=True, help="Path ID")
    
    # Replay command
    replay_parser = subparsers.add_parser("replay", help="Replay test path")
    replay_parser.add_argument("--path", required=True, help="Path ID")
    replay_parser.add_argument("--speed", type=float, default=1.0, help="Playback speed")
    replay_parser.add_argument("--format", default="mp4", help="Output format")
    
    # Optimize command
    optimize_parser = subparsers.add_parser("optimize", help="Optimize test path")
    optimize_parser.add_argument("--path", required=True, help="Path ID")
    optimize_parser.add_argument("--focus", help="Focus area")
    
    # Regenerate command
    regen_parser = subparsers.add_parser("regenerate", help="Regenerate test path")
    regen_parser.add_argument("--path", required=True, help="Path ID")
    regen_parser.add_argument("--retry-count", type=int, default=3, help="Max retries")
    regen_parser.add_argument("--debug", action="store_true", help="Debug mode")
    
    # Purge command
    purge_parser = subparsers.add_parser("purge", help="Purge old artifacts")
    purge_parser.add_argument("--before", required=True, help="Purge before date (YYYY-MM-DD)")
    purge_parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted")
    purge_parser.add_argument("--archive", action="store_true", help="Archive instead of delete")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    runner = TestRunner()
    
    try:
        if args.command == "start":
            result = runner.start_flow(args.flow, args.persona, args.url)
            print(json.dumps(result, indent=2, default=str))
            
        elif args.command == "audit":
            result = runner.audit_path(args.path)
            print(json.dumps(result, indent=2, default=str))
            
        elif args.command == "replay":
            output_file = runner.replay_path(args.path, args.speed, args.format)
            print(f"Replay created: {output_file}")
            
        elif args.command == "optimize":
            result = runner.optimize_path(args.path, args.focus)
            print(json.dumps(result, indent=2, default=str))
            
        elif args.command == "regenerate":
            result = runner.regenerate_path(args.path, args.retry_count, args.debug)
            print(json.dumps(result, indent=2, default=str))
            
        elif args.command == "purge":
            result = runner.purge_artifacts(args.before, args.dry_run, args.archive)
            print(json.dumps(result, indent=2, default=str))
            
    except Exception as e:
        logger.error(f"Command failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()