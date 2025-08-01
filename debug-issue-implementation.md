# /debug-issue Implementation

When you encounter technical issues, use this systematic debugging approach:

## Usage in Claude Code

```
/debug-issue <description of the problem>
```

## Implementation Chain

### PHASE 0: ERROR PATTERN ANALYSIS

<Task>
  <description>Analyze error patterns</description>
  <prompt>
ISSUE DESCRIPTION: $ISSUE_DESCRIPTION

Analyze this issue systematically:
1. Search for error patterns in:
   - Browser console logs
   - Network tab (failed requests, CORS errors)
   - Server/backend logs
   - Build output
2. Identify if errors are symptoms or root causes
3. Look for cascade effects (one error triggering others)
4. Note the sequence of failures
5. List ALL error messages with full context
6. Check for patterns from similar past issues

Important: Look beyond the obvious error. For example:
- CORS errors might indicate backend is down
- "undefined" errors might indicate failed API calls
- Freezing might indicate infinite loops

Format your findings clearly for the next agent.
  </prompt>
  <subagent_type>error-detective</subagent_type>
</Task>

### PHASE 1: ENVIRONMENT CONFIGURATION CHECK

<Task>
  <description>Check environment configurations</description>
  <prompt>
ISSUE DESCRIPTION: $ISSUE_DESCRIPTION

ERROR ANALYSIS:
$PHASE_0_RESULTS

Check all environment configurations:
1. Environment Variables:
   - Compare .env files with deployed environment variables
   - Check Vercel/AWS/deployment platform settings
   - Look for variable overrides and precedence issues
2. Configuration Files:
   - tsconfig.json, vite.config.js, vercel.json
   - Package.json scripts and dependencies
   - API endpoint configurations
3. Build vs Runtime:
   - Variables available at build time
   - Variables needed at runtime
   - Hardcoded values that should be dynamic
4. Common Issues:
   - VITE_ prefix for Vite apps
   - NEXT_PUBLIC_ prefix for Next.js
   - Path aliases breaking in production

Document all mismatches and potential issues.
  </prompt>
  <subagent_type>devops-troubleshooter</subagent_type>
</Task>

### PHASE 2: CODE INSPECTION

<Task>
  <description>Inspect code for issues</description>
  <prompt>
ISSUE DESCRIPTION: $ISSUE_DESCRIPTION

PREVIOUS FINDINGS:
$PHASE_0_RESULTS
$PHASE_1_RESULTS

Inspect code for common issues related to the errors found:
1. Connection/Retry Logic:
   - Infinite retry loops
   - Missing max attempt limits
   - No exponential backoff
   - Missing circuit breakers
2. Defensive Programming:
   - Array operations without guards (arr || [])
   - Object access without null checks
   - Unhandled promise rejections
3. State Management:
   - Race conditions
   - Stale closures
   - Memory leaks from listeners/intervals
4. Integration Issues:
   - WebSocket connection handling
   - API error handling
   - CORS configuration
5. TypeScript Issues:
   - Path aliases in production
   - Type assertions hiding errors
   - Build vs runtime type issues

Focus on code that could cause the reported symptoms.
  </prompt>
  <subagent_type>code-reviewer</subagent_type>
</Task>

### PHASE 3: INTEGRATION TESTING

<Task>
  <description>Test components and integrations</description>
  <prompt>
ISSUE DESCRIPTION: $ISSUE_DESCRIPTION

DIAGNOSTIC FINDINGS:
$PHASE_0_RESULTS
$PHASE_1_RESULTS
$PHASE_2_RESULTS

Create and run tests to isolate the issue:
1. Backend Testing:
   - Use curl to test each endpoint
   - Check CORS headers in responses
   - Verify authentication flows
   - Test with and without auth tokens
2. Frontend Testing:
   - Test with mock data (no backend)
   - Test API calls individually
   - Check WebSocket connections
   - Verify environment variables are loaded
3. Integration Testing:
   - Test full user flows
   - Check timing and race conditions
   - Verify error handling paths
4. Create minimal reproducible examples

Document exactly what works and what fails.
Run the tests and report results.
  </prompt>
  <subagent_type>test-automator</subagent_type>
</Task>

### PHASE 4: FIX IMPLEMENTATION

<Task>
  <description>Implement fixes</description>
  <prompt>
ISSUE DESCRIPTION: $ISSUE_DESCRIPTION

COMPLETE DIAGNOSTIC REPORT:
$PHASE_0_RESULTS
$PHASE_1_RESULTS
$PHASE_2_RESULTS
$PHASE_3_RESULTS

Based on all findings, implement fixes:
1. Order of Operations:
   - Fix environment/config issues first
   - Then fix code issues
   - Finally fix integration issues
2. For each fix:
   - Explain why this fixes the root cause
   - Show the exact changes
   - Test immediately after applying
   - Provide rollback if needed
3. Common fixes:
   - Add connection limits and timeouts
   - Fix environment variable loading
   - Add defensive programming
   - Fix CORS configuration
   - Handle errors properly
4. Document all changes made

Apply fixes one at a time and verify each works.
  </prompt>
  <subagent_type>debugger</subagent_type>
</Task>

### PHASE 5: VERIFICATION AND PREVENTION

<Task>
  <description>Verify fixes and prevent recurrence</description>
  <prompt>
FIXES APPLIED:
$PHASE_4_RESULTS

Verify the fixes and create prevention guidelines:
1. Test all scenarios that failed before:
   - Run original reproduction steps
   - Try edge cases
   - Test under load
   - Check error handling
2. Look for regressions:
   - Did fixes break anything else?
   - Are there performance impacts?
   - Check related functionality
3. Create prevention guidelines:
   - What patterns to avoid
   - What checks to add to CI/CD
   - Monitoring/alerting needs
   - Documentation updates needed
4. Architectural improvements:
   - Better error boundaries
   - Improved retry strategies
   - Better state management
   - Service health checks

Create a checklist to prevent similar issues.
  </prompt>
  <subagent_type>adversarial-tester</subagent_type>
</Task>

## Quick Reference

When debugging, remember:
1. **Environment variables are often the culprit** - Check them first
2. **CORS errors lie** - They often hide the real problem
3. **Infinite loops freeze apps** - Always limit retries
4. **TypeScript paths break in production** - Use relative imports
5. **Test in isolation** - Backend alone, frontend alone, then together

## Example Usage

```
# When app freezes
/debug-issue App freezes when trying to login, browser becomes unresponsive

# When getting CORS errors  
/debug-issue CORS errors but backend seems to be running fine

# When builds fail in production
/debug-issue TypeScript build works locally but fails on Vercel
```