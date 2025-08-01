# Agentic Development System

Orchestrate AI agents for development tasks using simple slash commands in Claude Code.

## Install

```bash
mkdir -p .claude/commands
cp -r /path/to/agentic-dev/.claude/commands/* .claude/commands/
mkdir -p tasks chains
```

## Commands

- `/init-project` - Analyze and document your project
- `/start-task` - Start complex development tasks
- `/complete-task` - Finalize and document completed work
- `/test-task` - Run adversarial testing

## How It Works

1. Commands trigger agent chains (60+ specialized agents)
2. Agents research, plan, and execute tasks
3. Documentation auto-updates in `tasks/` and `CLAUDE.md`

## Example

```bash
claude code
> /start-task Add user authentication
# Agents research, plan, and guide implementation
> /complete-task auth "OAuth2 implemented"
# Documentation created, tests optional
```

## Requirements

- Claude Code CLI
- Global `.claude/agents/` directory with agents

That's it. Simple, powerful, clean.