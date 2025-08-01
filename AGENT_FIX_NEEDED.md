# Critical Agent Fix Required

## Problem
The **backend-architect** and **frontend-developer** agents incorrectly placed production code inside the task folder (`/Users/don/D3/tasks/task-001-claude-cli-web-ui/backend/` and `/Users/don/D3/tasks/task-001-claude-cli-web-ui/frontend/`).

## Correct Behavior
- **Task folders** should ONLY contain:
  - Documentation (specifications, reports, guides)
  - Temporary working files
  - Task tracking information
  
- **Production code** should be placed in:
  - Project root directory (`/Users/don/D3/`)
  - Appropriate subdirectories for the actual application

## Agents That Need Fixing
1. **backend-architect** - Created backend code in task folder
2. **frontend-developer** - Created frontend code in task folder
3. **deployment-engineer** - Created deployment scripts in task folder

## Required Changes
These agents need to be updated with clear instructions:

```
CRITICAL: Production code must NEVER be placed in task folders.

Task folders are for documentation and temporary files only.
Task folders should be deletable without affecting functionality.

Production code goes in:
- Project root: /path/to/project/
- Appropriate subdirectories for the application

When creating code, always ask the user where the production code should be located, or place it in the current working directory outside any task folders.
```

## Impact
- Task folders should be deletable without breaking functionality
- Production code was incorrectly mixed with documentation
- This violates the separation of concerns principle

## Fix Applied
✅ Moved production code from `/Users/don/D3/tasks/task-001-claude-cli-web-ui/` to `/Users/don/D3/`
✅ Updated task documentation to reflect correct locations
✅ Task folder now contains only documentation as intended

## Next Steps
Update the agent definitions to prevent this issue in future tasks.