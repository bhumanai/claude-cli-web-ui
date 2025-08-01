# Available Tools and Commands for Meta-Agent System

## Slash Commands

The meta-agent can orchestrate these commands as part of task execution:

### Task Management
- `/plan` - Create structured plans with GitHub issue integration
- `/new-task` - Create new tracked tasks
- `/complete-task` - Mark tasks complete and update documentation
- `/smart-task` - Execute complex tasks with multi-agent orchestration

### Testing & Validation
- `/redteam` - Run adversarial security testing
- `/test-start` - Start test execution
- `/test-audit` - Audit test results
- `/test-optimize` - Optimize test performance
- `/test-regenerate` - Regenerate test cases

### Development
- `/init-project` - Initialize new project structure
- `/agent-test` - Test agent functionality
- `/debug-context-chain` - Debug context passing between agents

### Planning & Continuation
- `/plan-continue` - Continue existing planning sessions
- `/meta-agent-start` - Start meta-agent orchestration (self-reference)

## Agent Tools

The meta-agent has access to 60+ specialized agents via the Task tool:

### Core Development Agents
- `code-reviewer` - Reviews code for quality and security
- `python-pro`, `javascript-pro`, `golang-pro` - Language specialists
- `backend-architect`, `frontend-developer` - Architecture specialists
- `database-optimizer` - Database performance optimization

### Security & Testing
- `security-auditor` - Security vulnerability detection
- `adversarial-tester` - Stress testing and edge cases
- `test-automator` - Test suite creation

### Infrastructure
- `devops-troubleshooter` - Debug production issues
- `deployment-engineer` - CI/CD and deployment
- `cloud-architect` - Cloud infrastructure design

### Specialized Agents
- `ai-engineer` - LLM and AI integration
- `performance-engineer` - Performance optimization
- `legacy-modernizer` - Refactor legacy code

## Key Systems Available

### 1. LLM Competition System
- Run parallel implementations with Red/Blue/Green teams
- Purple team objective evaluation
- Use `/redteam` for adversarial testing

### 2. GitHub Integration
- `/plan` automatically creates GitHub issues
- Mentions @terragon-labs for task execution
- Integrates with project management

### 3. Context Management
- Fresh reads from all .md files
- Semantic search across documentation
- No caching - always current

### 4. Task Decomposition
- Break complex tasks into 5-20 line micro-tasks
- Each task independently verifiable
- External validation support

## Usage Patterns

### Complex Task Execution
```
1. Use /plan to create structured plan
2. Use /smart-task for multi-agent execution
3. Use /redteam to validate security
4. Use /complete-task to document results
```

### Test-Driven Development
```
1. Use /test-start to create test suite
2. Implement features with agents
3. Use /test-audit to verify coverage
4. Use /test-optimize for performance
```

### Project Initialization
```
1. Use /init-project for structure
2. Use /plan for roadmap
3. Execute tasks with /smart-task
4. Track with /new-task and /complete-task
```

## Integration Points

1. **Hooks**: Stop hooks and context injection coordinate flow
2. **State Management**: JSON-based state in `.claude/meta_agent_state.json`
3. **Documentation**: All context from CLAUDE.md and task files
4. **Validation**: External tools for objective verification

## Best Practices

1. Always decompose tasks to 5-20 lines maximum
2. Use appropriate specialized agents via Task tool
3. Validate with /redteam for security-critical code
4. Document completion with /complete-task
5. Leverage GitHub integration for team coordination