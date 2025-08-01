# Debug Issue Command

A systematic debugging command that uses specialized agents to diagnose and fix technical issues.

## Command Structure

```
/debug-issue <issue_description>
```

## Debugging Chain Phases

### Phase 0: Error Pattern Analysis (error-detective)
- Searches for error patterns in logs and console output
- Identifies symptoms vs root causes
- Tracks cascade effects
- Analyzes browser console, network tab, and server logs

### Phase 1: Environment Configuration Check (devops-troubleshooter)
- Compares environment variables across platforms
- Checks for configuration conflicts
- Validates API endpoints and URLs
- Reviews deployment settings

### Phase 2: Code Inspection (code-reviewer)
- Looks for infinite loops and retry logic issues
- Checks defensive programming
- Reviews error handling
- Identifies race conditions

### Phase 3: Integration Testing (test-automator)
- Tests backend endpoints directly
- Validates frontend with mock data
- Checks authentication flows
- Verifies CORS and WebSocket connections

### Phase 4: Fix Implementation (debugger)
- Applies fixes in dependency order
- Tests after each change
- Documents all modifications
- Provides rollback instructions

### Phase 5: Verification and Prevention (adversarial-tester)
- Tests all previously failing scenarios
- Attempts to break fixes with edge cases
- Checks for regressions
- Creates prevention guidelines

## Example Usage

```
/debug-issue App freezes when clicking login button

/debug-issue CORS errors when frontend tries to connect to backend

/debug-issue WebSocket connection keeps disconnecting and reconnecting
```

## Key Features

1. **Systematic Approach**: Each phase builds on previous findings
2. **Context Preservation**: Previous results are passed to each agent
3. **Comprehensive Analysis**: Covers environment, code, and integration issues
4. **Fix Verification**: Tests each fix before proceeding
5. **Prevention Focus**: Documents how to avoid similar issues

## Options

- `--quick`: Run only error analysis and fix implementation
- `--no-fix`: Perform diagnosis only without applying fixes
- `--focus=<area>`: Focus on specific area (frontend/backend/deployment)