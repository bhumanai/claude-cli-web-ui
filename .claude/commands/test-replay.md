---
description: "Replay the video trace of a test path"
argument-hint: "--path=<path_id>"
allowed-tools:
  - "Bash(python scripts/test_runner.py)"
  - "Read"
model: opus
---

# Replay Video Trace

Generate and replay a video trace of the test execution showing all screenshots in sequence.

```bash
python scripts/test_runner.py replay $ARGUMENTS
```

**Required Arguments:**
- `--path=<path_id>`: Unique identifier for the test path to replay

**Optional Arguments:**
- `--speed=<multiplier>`: Playback speed multiplier (default: 1.0)
- `--format=<format>`: Output format (mp4, gif, webm)

**Example:**
```
/test-replay --path=checkout_flow_p1 --speed=2.0 --format=mp4
```