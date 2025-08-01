---
description: Create a new task with proper tracking and documentation (does not execute the task)
argument-hint: "task name and description"
---

# New Task: $ARGUMENTS

I'll create a new task with proper tracking and documentation. This only creates the task - it does NOT execute it.

## Step 1: Initialize Task Documentation

<Task>
  <description>Create task documentation</description>
  <prompt>
NEW TASK: $ARGUMENTS

Create a new task with proper folder structure:
1. Generate a unique task ID (task-YYYYMMDD-HHMMSS or similar)
2. Create folder tasks/<id>/ in the tasks directory
3. Create task.md inside that folder with:
   - Task title and description
   - Creation timestamp
   - Initial status: pending (not started)
   - Acceptance criteria (inferred from description)
   - Technical approach (high-level)
   - Subtasks breakdown
   - Dependencies
4. Create these subfolders inside tasks/<id>/:
   - notes/ (for research and notes)
   - code/ (for code snippets and examples)
   - docs/ (for task-specific documentation)
   - tests/ (for test files)

Each task gets its own organized workspace. DO NOT execute or work on the task - only create the documentation structure.
  </prompt>
  <subagent_type>taskdoc-handler</subagent_type>
</Task>

## Step 2: Update Project Documentation

<Task>
  <description>Add task to project tracking</description>
  <prompt>
NEW TASK CREATED: $ARGUMENTS

Task documentation has been created. Now update CLAUDE.md:
1. Add this task to the "Current Tasks - Pending" section (not Active)
2. Include the task ID for reference
3. Add brief description
4. Set initial priority

Keep the project documentation synchronized. Mark this as PENDING until someone explicitly starts working on it.
  </prompt>
  <subagent_type>project-doc-manager</subagent_type>
</Task>

## Task Created Successfully

The task has been created and is ready for execution. To work on this task, run:
- `/smart-task [task-id]` to execute with full workflow
- Or manually start working and update the task status

This separation allows you to create tasks first, then decide who/how to execute them later.