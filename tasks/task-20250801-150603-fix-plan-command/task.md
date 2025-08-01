# Task: Fix /plan Command in Task Terminal

**ID**: task-20250801-150603-fix-plan-command  
**Created**: 2025-08-01 15:06  
**Status**: In Progress  

## Description

Fix the `/plan` command in Task Terminal so it creates tasks via the API which then create GitHub issues with @terragon-labs mention, instead of executing as a mock command.

## Current State Analysis

**Current Implementation:**
- `/plan` command exists as mock simulation in `filesystem_server_enhanced.py`
- Returns simulated planning messages but doesn't create real tasks
- Task creation API exists in `backend-vercel/api/projects/[project_id]/tasks.ts`
- GitHub integration exists in `backend-vercel/api/github.ts` with real API connections
- Comprehensive GitHub Issues specification exists in `GITHUB_ISSUES_INTEGRATION.md`

**Problems:**
1. `/plan` command is mock-only - doesn't create actual tasks
2. No connection between `/plan` command and task creation API
3. No GitHub Issues creation when tasks are created
4. Missing @terragon-labs mention functionality in GitHub issues

## Technical Requirements

1. **Command Integration**: Connect `/plan` command to real task creation API
2. **GitHub Issues**: Create GitHub issues when tasks are created via `/plan`
3. **Terragon Mention**: Add @terragon-labs mention to created GitHub issues
4. **API Workflow**: Ensure proper API call chain: `/plan` → Task API → GitHub Issues API
5. **Error Handling**: Graceful fallback if GitHub integration unavailable

## Progress Log

- 2025-08-01 15:06 - Task created and current state analyzed
- 2025-08-01 15:06 - Identified existing mock implementation and GitHub infrastructure
- 2025-08-01 15:06 - Mapped required changes: command execution → API integration → GitHub Issues
- 2025-08-01 15:12 - Updated task creation endpoint to integrate GitHub Issues creation
- 2025-08-01 15:13 - Created new `/api/commands/plan` endpoint to intercept /plan commands
- 2025-08-01 15:14 - Modified frontend PollingService to route /plan commands to new endpoint
- 2025-08-01 15:15 - Updated ProjectSelector to store current project ID for command context
- 2025-08-01 15:16 - Fixed Vercel deployment compatibility issues in plan endpoint

## Implementation Plan

### Phase 1: API Integration
- Modify command handler to call task creation API instead of simulation
- Update `/plan` command to parse task details and make API calls
- Add proper error handling for API failures

### Phase 2: GitHub Issues Integration  
- Extend task creation API to automatically create GitHub issues
- Implement @terragon-labs mention in issue creation
- Add proper label assignment (status:pending, priority:medium, type:command)

### Phase 3: Testing & Validation
- Test `/plan` command creates real tasks
- Verify GitHub issues are created with proper mentions
- Ensure fallback behavior when GitHub unavailable

## Implementation Details

### Changes Made:

1. **Backend Task Creation Enhancement** (`/backend-vercel/api/projects/[project_id]/tasks.ts`):
   - Added GitHub integration import
   - Modified task creation to automatically create GitHub issues
   - Added @terragon-labs mention via GitHubServiceWithConnections
   - Graceful error handling if GitHub sync fails

2. **New Plan Command Endpoint** (`/backend-vercel/api/commands/plan.ts`):
   - Created dedicated endpoint to handle /plan commands
   - Parses task details from command text
   - Creates task with GitHub issue directly
   - Returns user-friendly success/error messages

3. **Frontend Command Routing** (`/frontend/src/services/PollingService.ts`):
   - Added logic to detect /plan commands
   - Routes /plan to new endpoint instead of regular command execution
   - Includes project_id from localStorage in requests

4. **Project Context Management** (`/frontend/src/components/ProjectSelector.tsx`):
   - Stores current project ID in localStorage
   - Ensures project context available for command execution

## Expected Outcomes

- ✅ `/plan` command creates real tasks via API calls
- ✅ Tasks automatically generate GitHub issues with @terragon-labs mention
- ✅ Seamless integration between terminal commands and issue tracking
- ✅ Proper error handling and user feedback

## Next Steps

1. Deploy changes to Vercel
2. Test /plan command with real GitHub repository
3. Verify GitHub issues are created with @terragon-labs mention
4. Monitor Terragon execution of created tasks