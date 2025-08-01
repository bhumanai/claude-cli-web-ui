---
name: meta-agent-start
description: Start a meta-agent workflow with micro-tasks
---

# Meta-Agent Start Command

Starts a meta-agent workflow that breaks tasks into 5-20 line micro-tasks.

## Usage

```
/meta-agent-start <task_description>
```

## How it works

1. Updates `.claude/meta_agent_state.json` to activate the workflow
2. Creates micro-tasks based on the description
3. The Stop hook will orchestrate execution after each Claude response
4. Context injector adds fresh CLAUDE.md content to each prompt

## Example

```
/meta-agent-start "Create a Python function to calculate fibonacci numbers with tests"
```

This would create micro-tasks like:
- Task 1: Create basic fibonacci function (10 lines)
- Task 2: Add type hints (5 lines)
- Task 3: Add docstring (5 lines)
- Task 4: Create unit tests (15 lines)
- Task 5: Add edge case handling (10 lines)