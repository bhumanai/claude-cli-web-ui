---
description: Begin a complex task with agent orchestration
argument-hint: "task description"
---

## Starting Task: $ARGUMENTS

I'll use the smart-task command to handle this request with full agent orchestration.

<Task>
  <description>Execute smart task workflow</description>
  <prompt>
Execute the smart-task workflow for: $ARGUMENTS

This includes:
1. Task lookup/creation
2. Problem analysis
3. Chain planning
4. Agent selection
5. Execution
6. Completion tracking
  </prompt>
  <subagent_type>chain-master</subagent_type>
</Task>