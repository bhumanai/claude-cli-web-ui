---
description: Debug an issue using chained analysis with explicit context passing
argument-hint: "error or issue description"
---

# Debug with Context Chain: $ARGUMENTS

This command demonstrates explicit context passing between debugging agents.

## Agent 1: Error Analysis

<Task>
  <description>Analyze error and gather context</description>
  <prompt>
ERROR/ISSUE: $ARGUMENTS

Perform initial error analysis:
1. Parse error message/symptoms
2. Identify affected files/components
3. Research similar patterns in codebase
4. List potential root causes
5. Suggest investigation paths

Output a structured analysis that the next agent can use.
  </prompt>
  <subagent_type>error-detective</subagent_type>
</Task>

## Agent 2: Deep Debugging

Context from Agent 1 will be passed here:

<Task>
  <description>Deep dive debugging based on analysis</description>
  <prompt>
ORIGINAL ISSUE: $ARGUMENTS

ERROR ANALYSIS FROM PREVIOUS AGENT:
[Complete output from error-detective]

Based on the analysis above:
1. Investigate the suggested root causes (no need to re-analyze)
2. Check the identified files for issues
3. Test the hypotheses provided
4. Find the actual bug
5. Propose a fix

Focus on investigation and solution, not re-analysis.
  </prompt>
  <subagent_type>debugger</subagent_type>
</Task>

## Agent 3: Implementation

Final fix with full context:

<Task>
  <description>Implement the debugging solution</description>
  <prompt>
ISSUE: $ARGUMENTS

CONTEXT FROM DEBUGGING CHAIN:
- Error Analysis: [Key findings from Agent 1]
- Root Cause: [Findings from Agent 2]
- Proposed Fix: [Solution from Agent 2]

Implement the fix based on the debugging findings. Do not re-investigate - trust the debugging chain's analysis.
  </prompt>
  <subagent_type>full-stack-engineer</subagent_type>
</Task>

## Key Pattern Benefits:
- Each agent builds on previous work
- No repeated analysis or file reading
- Clear context flow through the chain
- Efficient token usage
- Faster resolution time