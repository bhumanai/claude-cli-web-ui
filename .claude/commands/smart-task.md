---
description: Execute a task with intelligent agent chaining and context preservation
argument-hint: "task description or task ID"
---

## Smart Task: $ARGUMENTS

I'll first check if this task already exists, then execute it using intelligent agent chaining where each agent's output becomes context for the next.

### PHASE 0: TASK LOOKUP/CREATION
First, let me find or create the appropriate task:

<Task>
  <description>Find existing task or create new one</description>
  <prompt>
USER REQUEST: $ARGUMENTS

Search for existing tasks that match this request:
1. Check the tasks/ directory for any task folders that match the description
2. Look for similar or related tasks already created
3. If found: Return the task ID and current status, and clearly state "FOUND EXISTING TASK: [task-id]"
4. If NOT found: Create a new task with proper folder structure and clearly state "CREATED NEW TASK: [task-id]"

For new tasks, create:
- Unique task ID (task-YYYYMMDD-HHMMSS format)
- Task folder with subfolders (notes/, code/, docs/, tests/)
- task.md file with proper structure
- Mark as "active" since we're about to work on it

Always clearly state whether this is continuing existing work or starting fresh so the user knows what happened.
  </prompt>
  <subagent_type>taskdoc-handler</subagent_type>
</Task>

### PHASE 1: PROBLEM ANALYSIS
Based on the task lookup results, I'll analyze the requirements:

<Task>
  <description>Analyze task requirements and research codebase</description>
  <prompt>
USER REQUEST: $ARGUMENTS

TASK CONTEXT:
[Task lookup results from Phase 0 will be inserted here]

Based on the task context above, analyze this request:
1. If continuing existing task: Review current progress and next steps
2. If new task: Break down what needs to be accomplished
3. Research the existing codebase structure
4. Identify relevant files and dependencies
5. List potential challenges or considerations
6. Suggest the optimal approach

Format your response with clear sections that can be used as context for planning.
DON'T re-analyze work already done if this is a continuing task.
  </prompt>
  <subagent_type>problem-setup</subagent_type>
</Task>

### PHASE 2: CHAIN PLANNING
Based on the analysis above, I'll now plan the implementation approach:

<Task>
  <description>Plan implementation chain based on analysis</description>
  <prompt>
USER REQUEST: $ARGUMENTS

TASK CONTEXT:
[Task lookup results from Phase 0]

PREVIOUS ANALYSIS:
[The problem-setup agent's complete analysis will be inserted here]

Based on this context and analysis, create a detailed implementation plan:
1. If continuing task: Plan next steps based on current progress
2. If new task: Create full implementation plan
3. Specific agents needed and their roles
4. Order of execution with dependencies
5. Key deliverables from each agent
6. Checkpoint locations for user approval

Design the chain to be efficient, avoiding any duplicate work already completed.
  </prompt>
  <subagent_type>chain-planner</subagent_type>
</Task>

### PHASE 3: AGENT SELECTION
If the plan requires specific agents, I'll select them from available agents:

<Task>
  <description>Select required agents</description>
  <prompt>
Based on the approved plan:
[APPROVED PLAN WILL BE INSERTED HERE]

Select the appropriate agents from /Users/don/.claude/agents/ for:
[LIST OF REQUIRED AGENTS FROM PLAN]

Map each task to the best available agent.
  </prompt>
  <subagent_type>agent-factory</subagent_type>
</Task>

### PHASE 4: EXECUTION
With all agents ready, I'll execute the chain:

<Task>
  <description>Execute agent chain</description>
  <prompt>
Execute the approved chain with these agents:
[AGENT LIST]

Previous context:
- Problem Analysis: [FROM PHASE 1]
- Implementation Plan: [FROM PHASE 2]
- Selected Agents: [FROM PHASE 3]

Run sequentially with checkpoints between each agent. Pass each agent's output as context to the next agent to avoid duplicate work.
  </prompt>
  <subagent_type>chain-executor</subagent_type>
</Task>

### PHASE 5: COMPLETION
After execution:
- Update task documentation with progress
- Summary of all deliverables
- List of files created/modified
- Quality verification
- Next steps and recommendations

<Task>
  <description>Update task completion</description>
  <prompt>
COMPLETED WORK: $ARGUMENTS

TASK CONTEXT:
[Original task lookup/creation results]

EXECUTION RESULTS:
[Results from all previous phases]

Update the task documentation:
1. Log progress made in this session
2. Update task status (completed, in-progress, or paused)
3. Document what was accomplished
4. Note any remaining work or next steps
5. Update CLAUDE.md task tracking

Ensure the task folder reflects the current state of work.
  </prompt>
  <subagent_type>taskdoc-handler</subagent_type>
</Task>

This approach ensures:
- Automatic task lookup/creation
- No duplicate analysis between agents
- Efficient token usage for continuing tasks
- Clear context preservation
- Structured workflow with checkpoints
- Proper task state management