---
description: "Optimize a test path based on persona feedback"
argument-hint: "--path=<path_id>"
allowed-tools:
  - "Bash(python scripts/test_runner.py)"
  - "Read"
model: opus
---

# Optimize Test Flow

Analyze a test path's thought logs and UX friction points to generate optimization recommendations.

The ux-reflector subagent will analyze interaction patterns and suggest improvements.

```bash
python scripts/test_runner.py optimize $ARGUMENTS
```

**Required Arguments:**
- `--path=<path_id>`: Unique identifier for the test path to optimize

**Optional Arguments:**
- `--focus=<area>`: Focus area (navigation, forms, performance, accessibility)

**Example:**
```
/test-optimize --path=checkout_flow_p1 --focus=forms
```