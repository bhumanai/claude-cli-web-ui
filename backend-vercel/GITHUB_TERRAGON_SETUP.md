# GitHub & Terragon Integration Setup

This guide explains how to set up GitHub integration for the Claude CLI Web UI to work with Terragon Labs.

## Overview

The system creates GitHub issues that mention @terragon-labs. Terragon then picks up these issues, executes the tasks, and reports back via comments. The system receives these updates via webhooks and updates the task status in real-time.

## Prerequisites

1. GitHub repository where tasks will be created as issues
2. GitHub Personal Access Token with the following permissions:
   - `repo` (full control of private repositories)
   - `write:issues` (create and update issues)
   - `admin:repo_hook` (create webhooks)

## Setup Steps

### 1. Generate GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Give it a descriptive name like "Claude CLI Terragon Integration"
4. Select the following scopes:
   - `repo` (all permissions under repo)
   - `admin:repo_hook` (to create webhooks)
5. Click "Generate token" and copy it immediately

### 2. Connect GitHub Repository in UI

1. Open the Claude CLI Web UI: https://claudeui-1lsyh1v2j-bhuman.vercel.app
2. Login with password: `claude123`
3. Create or select a project
4. Go to project settings
5. In GitHub Integration section, enter:
   - Repository: `owner/repo` (e.g., `myusername/my-tasks-repo`)
   - Token: Your GitHub Personal Access Token
6. Click "Connect"

### 3. Verify Connection

The system will:
1. Validate your GitHub token
2. Verify access to the repository
3. Create a webhook for real-time updates (optional)
4. Show connection status

### 4. Using /plan Command

Once connected, use the `/plan` command to create tasks:

```
/plan Build a user authentication system with OAuth2
```

This will:
1. Create a task in the system
2. Create a GitHub issue with:
   - Task details
   - @terragon-labs mention
   - Structured format for Terragon to parse

### 5. Terragon Execution Flow

1. **Issue Created**: System creates issue mentioning @terragon-labs
2. **Terragon Picks Up**: Terragon detects the mention and starts execution
3. **Progress Updates**: Terragon comments on the issue with progress
4. **Completion**: Terragon comments with results or errors
5. **Real-time Updates**: Webhook receives comments and updates UI

## Webhook Configuration (Automatic)

The system automatically creates a webhook when you connect a repository. The webhook listens for:
- Issue comments (to receive Terragon responses)
- Issue events (to track status changes)

Webhook URL: `https://backend-vercel-vf4akepcn-bhuman.vercel.app/api/github/webhook`

## Security Considerations

1. **Token Storage**: Tokens are stored server-side only, never exposed to frontend
2. **Webhook Verification**: Webhooks can be verified with a secret (set `GITHUB_WEBHOOK_SECRET` env var)
3. **Access Control**: Each project has its own GitHub connection

## Troubleshooting

### GitHub Connection Fails
- Verify token has correct permissions
- Check repository exists and you have access
- Ensure repository format is `owner/repo`

### Tasks Not Creating Issues
- Check GitHub connection is active in project settings
- Verify token hasn't expired
- Check browser console for errors

### Terragon Not Responding
- Ensure @terragon-labs is properly mentioned in issue
- Verify Terragon has access to your repository
- Check if Terragon service is operational

### No Real-time Updates
- Webhook may have failed to create (check GitHub repo settings)
- Firewall might be blocking webhook delivery
- Check Vercel function logs for webhook errors

## Environment Variables (Backend)

Optional environment variables for enhanced security:

```env
GITHUB_WEBHOOK_SECRET=your-webhook-secret  # For webhook signature verification
VERCEL_URL=https://your-deployment.vercel.app  # Auto-set by Vercel
```

## Example Task Flow

1. User: `/plan Create user auth system`
2. System: Creates task & GitHub issue #123
3. GitHub Issue:
   ```
   ## Task Execution Request
   
   **Task ID:** task_123456_abc
   **Priority:** medium
   
   ## Command
   ```
   /plan Create user auth system
   ```
   
   ## Execution
   @terragon-labs execute this task and report results below
   ```
4. Terragon: Comments "Starting execution..."
5. System: Updates task status to "running"
6. Terragon: Comments with results
7. System: Updates task as "completed" with output

## Support

For issues with:
- GitHub Integration: Check token permissions and repository access
- Terragon Execution: Ensure proper @mention format
- Real-time Updates: Verify webhook is active in GitHub settings