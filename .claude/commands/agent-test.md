# /agent-test Command

## Purpose
Orchestrate a comprehensive agentic testing chain that tests AI-built features through user simulation, detects bugs, and attempts automated fixes.

## Usage
```bash
/agent-test <feature_description> [options]
```

## Parameters
- `feature_description`: Description of the feature to test
- `--target-url`: Target application URL (default: http://localhost:5173)
- `--test-scenarios`: Number of test scenarios to generate (default: 5)
- `--user-personas`: Number of user personas to simulate (default: 3)
- `--fix-attempts`: Enable automated fix attempts (default: true)
- `--validation-rounds`: Number of validation rounds (default: 2)

## Examples
```bash
# Test the task creation feature
/agent-test "Task creation and management workflow"

# Test with specific parameters
/agent-test "User authentication flow" --target-url http://localhost:3000 --test-scenarios 10 --user-personas 5

# Test without automated fixes
/agent-test "Project management dashboard" --fix-attempts false
```

## Agent Chain Flow
1. **Test Coordinator**: Parse requirements and create test plan
2. **User Simulation**: Generate realistic user personas and scenarios
3. **Browser Automation**: Execute automated testing with Playwright
4. **Log Analysis**: Analyze system logs for errors and anomalies
5. **Bug Detection**: Identify and classify discovered issues
6. **Bug Fixing**: Attempt automated fixes for simple issues
7. **Validation**: Verify fixes and generate final report

## Output
- Comprehensive test report with scenarios, results, and metrics
- Bug reports with reproduction steps and severity classification
- Fix attempts documentation with success/failure analysis
- Validation results and regression analysis
- Performance metrics and recommendations

## Integration
- Uses Playwright MCP for browser automation
- Integrates with existing log analysis tools
- Creates GitHub issues for significant bugs
- Updates project documentation with test results