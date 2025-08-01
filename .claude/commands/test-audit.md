---
description: "Audit a completed test path for verification"
argument-hint: "--path=<path_id>"
allowed-tools:
  - "Bash(python scripts/test_runner.py)"
  - "Read"
model: opus
---

# Audit Completed Test Path

Audit and verify a completed test path by analyzing artifacts, DOM snapshots, and assertion results.

The verifier subagent will be invoked to cross-check results against expected checkpoints.

```bash
python scripts/test_runner.py audit $ARGUMENTS
```

**Required Arguments:**
- `--path=<path_id>`: Unique identifier for the test path to audit

**Example:**
```
/test-audit --path=checkout_flow_p1
```