---
description: "Purge old test artifacts and logs"
argument-hint: "--before=<YYYY-MM-DD> [--dry-run]"
allowed-tools:
  - "Bash(python scripts/test_runner.py)"
  - "LS"
model: opus
---

# Purge Test Artifacts

Clean up old test artifacts, logs, and screenshots to manage disk usage.

```bash
python scripts/test_runner.py purge $ARGUMENTS
```

**Required Arguments:**
- `--before=<YYYY-MM-DD>`: Delete artifacts created before this date

**Optional Arguments:**
- `--dry-run`: Show what would be deleted without actually deleting
- `--archive`: Archive instead of delete (creates compressed tarball)

**Example:**
```
/test-purge --before=2024-12-01 --dry-run
/test-purge --before=2024-11-01 --archive
```