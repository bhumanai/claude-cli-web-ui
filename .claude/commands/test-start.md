---
description: "Start a bulletproof visual test flow"
argument-hint: "--flow=<flow_id> --persona=<persona_id> --url=<entry_url>"
allowed-tools:
  - "Bash(python scripts/test_runner.py)"
  - "mcp__playwright__*"
model: opus
---

# Initiate Visual Test Flow

Start a comprehensive visual testing workflow using Claude Code subagents and Playwright.

The flow-generator subagent will be invoked automatically to enumerate all user paths and create test execution plans.

```bash
python scripts/test_runner.py start $ARGUMENTS
```

**Required Arguments:**
- `--flow=<flow_id>`: Unique identifier for the test flow
- `--persona=<persona_id>`: User persona profile to simulate  
- `--url=<entry_url>`: Entry point URL to begin testing

**Example:**
```
/test-start --flow=checkout_flow --persona=power_user --url=https://example.com/shop
```