# Meta-Agent System v4.0 Architecture

## Overview
The Meta-Agent System is designed with fresh context reads and micro-task execution at its core.

## Key Principles
1. **Fresh Reads**: All context is read fresh from disk, never cached
2. **Micro-Tasks**: Tasks are 5-20 lines of code maximum
3. **Hook Integration**: Stop hooks and context injection hooks orchestrate the flow
4. **Resource Library**: Centralized documentation at `.claude/meta-agent/resource-library/`

## Components
- **Context Engine**: Semantic search with fresh reads
- **Task Decomposer**: Breaks tasks into 5-20 line chunks
- **Micro-Task Executor**: Sandboxed execution
- **Validation Engine**: External validation with proofs
- **Orchestrator**: Coordinates all components via hooks