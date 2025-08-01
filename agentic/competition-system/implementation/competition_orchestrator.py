#!/usr/bin/env python3
"""
LLM Coders Competition Orchestrator
Manages competitive coding between Red, Blue, Green teams with Purple team judging
"""

import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

# Competition data structures
class TeamType(Enum):
    RED = "RED"      # Attacker/Breaker
    BLUE = "BLUE"    # Builder/Defender  
    GREEN = "GREEN"  # Optimizer/Improver
    PURPLE = "PURPLE" # Judge/Evaluator

@dataclass
class TeamAction:
    """Record of a team's action in the competition"""
    team: TeamType
    round: int
    timestamp: datetime
    action_type: str
    input_context: Dict[str, Any]
    output: Dict[str, Any]
    metrics: Dict[str, float]
    
@dataclass
class CompetitionTask:
    """Task definition for competition"""
    id: str
    name: str
    description: str
    requirements: List[str]
    constraints: List[str]
    evaluation_criteria: Dict[str, float]
    max_rounds: int = 10
    
@dataclass
class TestResult:
    """Results from objective testing"""
    category: str
    passed: int
    total: int
    score: float
    details: List[Dict[str, Any]]
    
@dataclass
class CompetitionRound:
    """Single round of competition"""
    round_number: int
    blue_action: Optional[TeamAction] = None
    red_action: Optional[TeamAction] = None
    green_action: Optional[TeamAction] = None
    purple_evaluation: Optional[Dict[str, Any]] = None
    round_score: float = 0.0
    
class ActionHistory:
    """Maintains history of all team actions"""
    
    def __init__(self):
        self.actions: List[TeamAction] = []
        self.insights: Dict[str, Any] = {}
        self.patterns: Dict[str, List[str]] = {
            "vulnerabilities": [],
            "defenses": [],
            "optimizations": []
        }
        
    def add(self, action: TeamAction):
        """Add action and extract insights"""
        self.actions.append(action)
        self._extract_insights(action)
        
    def _extract_insights(self, action: TeamAction):
        """Extract learnings from each action"""
        if action.team == TeamType.RED:
            if "vulnerabilities" in action.output:
                self.patterns["vulnerabilities"].extend(
                    action.output["vulnerabilities"]
                )
                
        elif action.team == TeamType.BLUE:
            if "security_measures" in action.output:
                self.patterns["defenses"].extend(
                    action.output["security_measures"]
                )
                
        elif action.team == TeamType.GREEN:
            if "optimizations" in action.output:
                self.patterns["optimizations"].extend(
                    action.output["optimizations"]
                )
                
    def get_context_for_team(self, team: TeamType, round_num: int) -> Dict[str, Any]:
        """Get relevant context for a team"""
        context = {
            "round": round_num,
            "previous_actions": [],
            "patterns": {}
        }
        
        # Add relevant previous actions
        for action in self.actions[-10:]:  # Last 10 actions
            if action.round < round_num:
                context["previous_actions"].append({
                    "team": action.team.value,
                    "type": action.action_type,
                    "summary": action.output.get("summary", "")
                })
                
        # Add relevant patterns based on team
        if team == TeamType.BLUE:
            context["patterns"]["known_vulnerabilities"] = self.patterns["vulnerabilities"][-5:]
        elif team == TeamType.RED:
            context["patterns"]["implemented_defenses"] = self.patterns["defenses"][-5:]
        elif team == TeamType.GREEN:
            context["patterns"]["previous_optimizations"] = self.patterns["optimizations"][-5:]
            
        return context

class CompetitionOrchestrator:
    """Main orchestrator for LLM coding competitions"""
    
    def __init__(self, project_root: str = "/Users/don/D3/agentic"):
        self.project_root = Path(project_root)
        self.competition_dir = self.project_root / "competition-system"
        self.results_dir = self.competition_dir / "results"
        self.results_dir.mkdir(exist_ok=True)
        
        # Initialize teams (would connect to actual LLM agents)
        self.teams = {
            TeamType.RED: self._create_red_team(),
            TeamType.BLUE: self._create_blue_team(),
            TeamType.GREEN: self._create_green_team(),
            TeamType.PURPLE: self._create_purple_team()
        }
        
        self.history = ActionHistory()
        self.current_task: Optional[CompetitionTask] = None
        self.rounds: List[CompetitionRound] = []
        
    def _create_red_team(self):
        """Create Red Team agent configuration"""
        return {
            "name": "Red Team Attacker",
            "prompt_file": self.competition_dir / "team-prompts" / "red_team_attacker.md",
            "tools": ["code_analyzer", "fuzzer", "exploit_db"],
            "objective": "Find and exploit vulnerabilities"
        }
        
    def _create_blue_team(self):
        """Create Blue Team agent configuration"""
        return {
            "name": "Blue Team Builder",
            "prompt_file": self.competition_dir / "team-prompts" / "blue_team_builder.md",
            "tools": ["secure_coding", "testing_framework", "auth_libs"],
            "objective": "Build secure functionality"
        }
        
    def _create_green_team(self):
        """Create Green Team agent configuration"""
        return {
            "name": "Green Team Optimizer",
            "prompt_file": self.competition_dir / "team-prompts" / "green_team_optimizer.md",
            "tools": ["profiler", "refactoring", "benchmarks"],
            "objective": "Optimize performance and quality"
        }
        
    def _create_purple_team(self):
        """Create Purple Team judge configuration"""
        return {
            "name": "Purple Team Judge",
            "prompt_file": self.competition_dir / "team-prompts" / "purple_team_judge.md",
            "tools": ["test_runner", "security_scanner", "metrics_collector"],
            "objective": "Objectively evaluate submissions"
        }
        
    async def run_competition(self, task: CompetitionTask) -> Dict[str, Any]:
        """Run a full competition for the given task"""
        self.current_task = task
        competition_id = f"COMP-{uuid.uuid4().hex[:8]}"
        
        print(f"\n🏁 Starting Competition: {task.name}")
        print(f"📋 Task: {task.description}")
        print(f"🔄 Max Rounds: {task.max_rounds}\n")
        
        # Run competition rounds
        for round_num in range(1, task.max_rounds + 1):
            print(f"\n--- Round {round_num} ---")
            
            round_result = await self._execute_round(round_num)
            self.rounds.append(round_result)
            
            # Check if task is complete
            if self._is_task_complete(round_result):
                print("\n✅ Task completed successfully!")
                break
                
            # Early termination if score is too low
            if round_result.round_score < 40:
                print("\n❌ Competition terminated - quality too low")
                break
                
        # Calculate final results
        results = self._calculate_final_results(competition_id)
        
        # Save results
        self._save_results(competition_id, results)
        
        return results
        
    async def _execute_round(self, round_num: int) -> CompetitionRound:
        """Execute a single competition round"""
        round_result = CompetitionRound(round_number=round_num)
        
        # Phase 1: Blue Team builds/improves
        print("🔵 Blue Team: Building...")
        blue_context = self.history.get_context_for_team(TeamType.BLUE, round_num)
        blue_action = await self._blue_team_act(blue_context)
        round_result.blue_action = blue_action
        self.history.add(blue_action)
        
        # Phase 2: Red Team attacks
        print("🔴 Red Team: Attacking...")
        red_context = {
            **self.history.get_context_for_team(TeamType.RED, round_num),
            "target_code": blue_action.output.get("code", "")
        }
        red_action = await self._red_team_act(red_context)
        round_result.red_action = red_action
        self.history.add(red_action)
        
        # Phase 3: Green Team optimizes
        print("🟢 Green Team: Optimizing...")
        green_context = {
            **self.history.get_context_for_team(TeamType.GREEN, round_num),
            "code": blue_action.output.get("code", ""),
            "vulnerabilities": red_action.output.get("vulnerabilities", [])
        }
        green_action = await self._green_team_act(green_context)
        round_result.green_action = green_action
        self.history.add(green_action)
        
        # Phase 4: Purple Team evaluates
        print("🟣 Purple Team: Evaluating...")
        evaluation = await self._purple_team_evaluate(
            green_action.output.get("code", blue_action.output.get("code", ""))
        )
        round_result.purple_evaluation = evaluation
        round_result.round_score = evaluation["total_score"]
        
        print(f"\n📊 Round Score: {round_result.round_score:.1f}/100")
        
        return round_result
        
    async def _blue_team_act(self, context: Dict[str, Any]) -> TeamAction:
        """Blue Team builds secure functionality"""
        # In real implementation, this would call the LLM agent
        # For now, return mock action
        return TeamAction(
            team=TeamType.BLUE,
            round=context["round"],
            timestamp=datetime.now(),
            action_type="build",
            input_context=context,
            output={
                "code": "# Secure implementation\n...",
                "security_measures": ["input_validation", "parameterized_queries"],
                "test_coverage": 85,
                "summary": "Implemented secure authentication with rate limiting"
            },
            metrics={"lines_of_code": 150, "complexity": 12}
        )
        
    async def _red_team_act(self, context: Dict[str, Any]) -> TeamAction:
        """Red Team finds vulnerabilities"""
        # In real implementation, this would call the LLM agent
        return TeamAction(
            team=TeamType.RED,
            round=context["round"],
            timestamp=datetime.now(),
            action_type="attack",
            input_context=context,
            output={
                "vulnerabilities": [
                    {
                        "type": "timing_attack",
                        "severity": "medium",
                        "description": "Username enumeration via timing"
                    }
                ],
                "exploits_found": 1,
                "summary": "Found timing attack in login endpoint"
            },
            metrics={"tests_run": 50, "payloads_tried": 200}
        )
        
    async def _green_team_act(self, context: Dict[str, Any]) -> TeamAction:
        """Green Team optimizes code"""
        # In real implementation, this would call the LLM agent
        return TeamAction(
            team=TeamType.GREEN,
            round=context["round"],
            timestamp=datetime.now(),
            action_type="optimize",
            input_context=context,
            output={
                "code": "# Optimized implementation\n...",
                "optimizations": ["query_optimization", "caching_added"],
                "performance_gain": 35,
                "summary": "Reduced response time by 35% with caching"
            },
            metrics={"response_time_ms": 65, "memory_usage_mb": 45}
        )
        
    async def _purple_team_evaluate(self, code: str) -> Dict[str, Any]:
        """Purple Team runs objective tests"""
        # In real implementation, this would run actual tests
        return {
            "total_score": 78.5,
            "breakdown": {
                "functionality": {"score": 92, "weight": 0.3},
                "security": {"score": 70, "weight": 0.25},
                "performance": {"score": 85, "weight": 0.2},
                "code_quality": {"score": 75, "weight": 0.15},
                "reliability": {"score": 80, "weight": 0.1}
            },
            "feedback": "Good implementation with minor security concerns"
        }
        
    def _is_task_complete(self, round_result: CompetitionRound) -> bool:
        """Check if task meets completion criteria"""
        if not round_result.purple_evaluation:
            return False
            
        score = round_result.purple_evaluation["total_score"]
        security_score = round_result.purple_evaluation["breakdown"]["security"]["score"]
        
        # Task is complete if score > 85 and security > 80
        return score > 85 and security_score > 80
        
    def _calculate_final_results(self, competition_id: str) -> Dict[str, Any]:
        """Calculate final competition results"""
        team_scores = {
            TeamType.BLUE.value: 0,
            TeamType.RED.value: 0,
            TeamType.GREEN.value: 0
        }
        
        # Calculate scores based on contributions
        for round_result in self.rounds:
            if round_result.blue_action:
                # Blue gets points for functionality
                team_scores[TeamType.BLUE.value] += (
                    round_result.purple_evaluation["breakdown"]["functionality"]["score"] * 0.5
                )
                
            if round_result.red_action:
                # Red gets points for finding vulnerabilities
                vulns = len(round_result.red_action.output.get("vulnerabilities", []))
                team_scores[TeamType.RED.value] += vulns * 10
                
            if round_result.green_action:
                # Green gets points for optimizations
                perf_gain = round_result.green_action.output.get("performance_gain", 0)
                team_scores[TeamType.GREEN.value] += perf_gain * 0.5
                
        # Determine winner
        winner = max(team_scores, key=team_scores.get)
        
        return {
            "competition_id": competition_id,
            "task": self.current_task.name,
            "rounds_completed": len(self.rounds),
            "team_scores": team_scores,
            "winner": winner,
            "final_code_score": self.rounds[-1].round_score if self.rounds else 0,
            "timestamp": datetime.now().isoformat()
        }
        
    def _save_results(self, competition_id: str, results: Dict[str, Any]):
        """Save competition results to file"""
        results_file = self.results_dir / f"{competition_id}_results.json"
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n📁 Results saved to: {results_file}")

# Example usage
async def main():
    """Run example competition"""
    orchestrator = CompetitionOrchestrator()
    
    # Define competition task
    task = CompetitionTask(
        id="TASK-001",
        name="Secure File Upload API",
        description="Build a secure file upload API with virus scanning",
        requirements=[
            "Support multiple file types",
            "Virus scanning before storage",
            "Rate limiting per user",
            "Secure file storage"
        ],
        constraints=[
            "Max file size: 10MB",
            "Allowed types: pdf, jpg, png, docx",
            "Must complete in < 5 seconds"
        ],
        evaluation_criteria={
            "functionality": 0.3,
            "security": 0.25,
            "performance": 0.2,
            "code_quality": 0.15,
            "reliability": 0.1
        },
        max_rounds=5
    )
    
    # Run competition
    results = await orchestrator.run_competition(task)
    
    print("\n🏆 Competition Complete!")
    print(f"Winner: {results['winner']}")
    print(f"Final Code Score: {results['final_code_score']:.1f}/100")

if __name__ == "__main__":
    asyncio.run(main())