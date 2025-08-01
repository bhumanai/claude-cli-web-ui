---
description: "Regenerate a failing test path with updated context"
argument-hint: "--path=<path_id>"
allowed-tools:
  - "Bash(python scripts/test_runner.py)"
  - "mcp__playwright__*"
model: opus
---

# Regenerate Failed Test Path

Regenerate and re-execute a failing test path with updated context and improved error handling.

The test-executor subagent will rerun the steps with lessons learned from previous failures.

```bash
python scripts/test_runner.py regenerate $ARGUMENTS
```

**Required Arguments:**
- `--path=<path_id>`: Unique identifier for the test path to regenerate

**Optional Arguments:**
- `--retry-count=<num>`: Maximum retry attempts (default: 3)
- `--debug`: Enable verbose debugging output

**Example:**
```
/test-regenerate --path=checkout_flow_p1 --retry-count=5 --debug
```