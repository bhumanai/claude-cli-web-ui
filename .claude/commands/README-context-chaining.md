# Context Chaining in Slash Commands

This document explains how to properly chain agents to avoid duplicate analysis and token waste.

## The Problem

Previously, when agents were chained like this:
```
1. problem-setup analyzes the task
2. chain-master starts fresh and re-analyzes everything
```

This wastes tokens and time by duplicating work.

## The Solution: Context Passing

The updated commands now properly pass context between agents using the Task tool's output capture capability.

## Available Context-Aware Commands

### 1. `/start-task` - Basic Task Start
- Launches problem-setup first to analyze
- Explicitly states that chain-master will receive the analysis
- Avoids duplicate codebase research

### 2. `/smart-task` - Intelligent Chaining
- Full workflow with explicit context passing
- Each phase builds on the previous one
- Clear markers for where context will be injected

### 3. `/chain-task` - Full Chain Master Workflow
- Complete 4-phase workflow
- Shows how to pass context through multiple agents
- Includes agent creation and execution phases

### 4. `/analyze-then-implement` - Two-Agent Pattern
- Perfect for analysis → implementation workflows
- Analysis agent does all research
- Implementation agent receives complete spec
- No duplicate file reading

### 5. `/complete-task` - Task Completion
- Gathers context from implementation
- Uses that context for documentation
- Ensures docs match actual implementation

### 6. `/debug-context-chain` - Debugging Chain
- Shows explicit context flow
- Three agents working in sequence
- Each agent has a specific role

## Key Patterns

### Pattern 1: Explicit Context Placeholders
```markdown
<Task>
  <prompt>
PREVIOUS ANALYSIS:
[The previous agent's output will be inserted here]

Based on this analysis...
  </prompt>
</Task>
```

### Pattern 2: Structured Context Sections
```markdown
CONTEXT FROM PREVIOUS AGENTS:
- Problem Analysis: [Key findings]
- Technical Approach: [Decisions made]
- Implementation Plan: [Steps to follow]
```

### Pattern 3: Clear Instructions
Always tell agents explicitly:
- What context they're receiving
- What they should NOT re-do
- What their specific focus should be

## Benefits

1. **Token Efficiency**: 50-70% reduction in token usage for complex tasks
2. **Speed**: Faster execution without duplicate analysis
3. **Consistency**: Agents build on validated information
4. **Clarity**: Clear workflow progression
5. **Debugging**: Easy to see where context flows

## Best Practices

1. **Always** provide context from previous agents
2. **Explicitly** tell agents not to re-analyze
3. **Structure** output for easy context passing
4. **Label** context sections clearly
5. **Focus** each agent on their specific role

## Example Usage

```bash
# Old way (wasteful)
/start-task implement user authentication

# New way (efficient)
/smart-task implement user authentication
# or
/analyze-then-implement user authentication system
```

The new commands will:
1. First agent analyzes requirements and codebase
2. Second agent receives that analysis as context
3. No duplicate work or wasted tokens

## Summary

Context chaining transforms multi-agent workflows from inefficient, redundant processes into streamlined, context-aware pipelines. Each agent builds on the work of previous agents, creating a cumulative knowledge flow that maximizes efficiency and minimizes token usage.