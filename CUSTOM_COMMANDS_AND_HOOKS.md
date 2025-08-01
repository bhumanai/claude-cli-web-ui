# Custom Commands and Hooks Documentation

## Slash Commands

### 1. **`/plan`** - Task Planning Command
- **Location**: `.claude/commands/plan.md`
- **Purpose**: Create high-level project plans
- **Features**: 
  - Generates structured implementation plans
  - Integrates with GitHub Issues API (creates issues with @terragon-labs mention)
  - Supports direct task creation from terminal

### 2. **`/plan-continue`** - Continue Planning
- **Location**: `.claude/commands/plan-continue.md`
- **Purpose**: Continue or refine existing plans
- **Usage**: Extends previous planning sessions

### 3. **`/smart-task`** - Intelligent Task Execution
- **Location**: `.claude/commands/smart-task.md`
- **Purpose**: Execute complex tasks with intelligent agent orchestration
- **Features**:
  - Multi-agent chain execution
  - Automatic agent selection based on task
  - Progress tracking and reporting

### 4. **`/init-project`** - Project Initialization
- **Location**: `.claude/commands/init-project.md`
- **Purpose**: Initialize new projects with proper structure
- **Features**:
  - Creates project scaffolding
  - Sets up documentation templates
  - Configures project settings

### 5. **`/complete-task`** - Task Completion
- **Location**: `.claude/commands/complete-task.md`
- **Purpose**: Mark tasks as complete and update documentation
- **Features**:
  - Updates task status
  - Generates completion reports
  - Archives task documentation

### 6. **`/new-task`** - Create New Task
- **Location**: `.claude/commands/new-task.md`
- **Purpose**: Create new tasks with proper tracking
- **Features**:
  - Task documentation creation
  - Priority assignment
  - Integration with task management system

### 7. **`/redteam`** - Red Team Testing
- **Location**: `.claude/commands/redteam.md`
- **Purpose**: Run adversarial testing on implementations
- **Features**:
  - Security vulnerability detection
  - Performance bottleneck identification
  - Code quality assessment

### 8. **`/meta-agent-start`** - Meta-Agent Orchestration
- **Location**: `.claude/commands/meta-agent-start.md`
- **Purpose**: Start the meta-agent system for complex workflows
- **Features**:
  - Coordinates multiple agents
  - Handles failures and retries
  - Fresh context reading

### 9. **`/agent-test`** - Test Agent System
- **Location**: `.claude/commands/agent-test.md`
- **Purpose**: Test agent creation and execution
- **Usage**: Verify agent system functionality

### 10. **`/debug-context-chain`** - Debug Context Chains
- **Location**: `.claude/commands/debug-context-chain.md`
- **Purpose**: Debug agent context passing and chain execution
- **Features**: Trace context flow between agents

### Test Commands Suite:
- **`/test-start`** - Start test execution
- **`/test-audit`** - Audit test results
- **`/test-optimize`** - Optimize test performance
- **`/test-purge`** - Clean up test artifacts
- **`/test-regenerate`** - Regenerate test cases
- **`/test-replay`** - Replay test scenarios

## Hooks

### 1. **Meta-Agent Stop Hook**
- **Files**: 
  - `.claude/hooks/meta_agent_stop_hook.py` (full version)
  - `.claude/hooks/meta_agent_stop_hook_simple.py` (lightweight version - active)
- **Type**: Stop hook
- **Purpose**: Intercepts command completion to orchestrate next steps
- **Features**:
  - Analyzes transcript for errors or completion
  - Manages task progression
  - Triggers follow-up actions
  - JSON-based state management

### 2. **Context Injector Hook**
- **Files**:
  - `.claude/hooks/context_injector.py` (full version)
  - `.claude/hooks/context_injector_simple.py` (lightweight version - active)
- **Type**: UserPromptSubmit hook
- **Purpose**: Injects relevant context before command execution
- **Features**:
  - Injects CLAUDE.md content
  - Adds task-specific context
  - Ensures fresh documentation reads
  - Meta-agent rules injection

## Hook Configuration

**Location**: `.claude/settings.json`

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/meta_agent_stop_hook_simple.py",
        "timeout": 10
      }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/context_injector_simple.py",
        "timeout": 5
      }]
    }]
  }
}
```

## Key Features

### Command Features:
1. **Agent Orchestration**: Multiple commands support multi-agent workflows
2. **GitHub Integration**: `/plan` creates GitHub issues automatically
3. **Task Management**: Complete task lifecycle management
4. **Testing Suite**: Comprehensive testing commands
5. **Adversarial Testing**: Red team capabilities built-in

### Hook Features:
1. **Automatic Context Management**: Ensures fresh, relevant context
2. **Task Flow Control**: Meta-agent manages task progression
3. **Error Detection**: Analyzes outputs for failures
4. **State Persistence**: JSON-based state tracking
5. **Lightweight Implementation**: No heavy dependencies

## Usage Examples

```bash
# Create a plan that generates GitHub issue
/plan Build user authentication system

# Execute complex task with multiple agents
/smart-task Implement OAuth2 authentication

# Run security testing
/redteam Review authentication implementation

# Initialize new project
/init-project my-new-app

# Complete and document task
/complete-task auth-implementation "Added OAuth2 support"
```

## Architecture Notes

1. **Commands** are markdown templates in `.claude/commands/`
2. **Hooks** are Python scripts that intercept Claude's execution flow
3. **Meta-Agent System** coordinates complex multi-step workflows
4. **LLM Competition System** enables adversarial development
5. **Context Management** ensures documentation is always fresh

The system is designed for extensibility - new commands can be added as markdown files, and hooks can be enhanced without heavy dependencies.