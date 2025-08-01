# Agentic Development System

A slash command system for orchestrating AI agents in development workflows.

## Installation

The system is already set up. Just run:

```bash
cd /Users/don/D3/agentic
./agentic --help
```

## Usage

### Interactive Mode
```bash
./agentic -i
```

### Direct Command Execution
```bash
./agentic "/start-task Create user authentication"
./agentic "/init-project"
./agentic "/test-task authentication"
```

### List Available Commands
```bash
./agentic --list-commands
```

### List Available Agents
```bash
./agentic --list-agents
```

## Core Commands

- `/init-project` - Analyze project and populate documentation
- `/start-task` - Begin a complex task with agent orchestration  
- `/complete-task` - Finalize task and update documentation
- `/test-task` - Run adversarial testing on completed work
- `/smart-task` - Intelligent task execution with context preservation

## How It Works

1. **Command Parser**: Parses slash commands and loads templates from `/Users/don/.claude/commands/`
2. **Agent Executor**: Manages agent execution and chain workflows
3. **Orchestrator**: Coordinates the entire system

## Directory Structure

```
agentic/
├── core/
│   ├── command_parser.py    # Parses slash commands
│   └── agent_executor.py    # Executes agent chains
├── commands/                # Custom command definitions
├── chains/                  # Execution logs
├── logs/                    # Agent execution logs
└── orchestrator.py          # Main coordinator
```

## Integration with Claude

This system is designed to work with Claude's Task tool. When running in Claude:
- Commands trigger agent chains
- Each agent uses the Task tool with specific subagent_type
- Results are logged and tracked
- Documentation is automatically updated

## Adding New Commands

Create a new markdown file in `commands/` or `/Users/don/.claude/commands/`:

```markdown
---
description: Your command description
argument-hint: "expected arguments"
---

Your command template with $ARGUMENTS placeholder

<Task>
  <description>Task description</description>
  <prompt>Agent prompt with $ARGUMENTS</prompt>
  <subagent_type>agent-name</subagent_type>
</Task>
```