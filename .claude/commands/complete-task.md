---
description: Complete task with proper documentation and context preservation
argument-hint: task-name "description"
---

# Complete Task: $ARGUMENTS

I'll complete this task with proper documentation and context preservation from the implementation.

## Step 1: Gather Implementation Context

<Task>
  <description>Analyze completed implementation</description>
  <prompt>
COMPLETED TASK: $ARGUMENTS

Please analyze the completed implementation:
1. List all files created or modified
2. Summarize key changes and features implemented
3. Identify any technical decisions made
4. Note any TODOs or future improvements
5. Capture lessons learned or patterns discovered

This analysis will inform our documentation.
  </prompt>
  <subagent_type>code-reviewer</subagent_type>
</Task>

## Step 2: Update Documentation

Using the context from Step 1:

<Task>
  <description>Update project documentation</description>
  <prompt>
TASK: $ARGUMENTS

IMPLEMENTATION ANALYSIS:
[Output from code-reviewer will be inserted here]

Based on this analysis, update documentation:
1. Create or update task documentation in tasks/
2. Update CLAUDE.md if new patterns were established
3. Document any new agents created
4. Add to project.md if significant features were added
5. Update any API documentation if endpoints changed

Use the implementation details to create accurate, useful documentation.
  </prompt>
  <subagent_type>project-doc-manager</subagent_type>
</Task>

## Step 3: Optional Quality Checks

If requested, run additional verification:
- Adversarial testing
- Performance benchmarks
- Security audit
- Code cleanup

## Step 4: Task Closure

Final checklist:
- [ ] All code changes committed
- [ ] Documentation updated
- [ ] Tests passing
- [ ] No console errors
- [ ] Temporary agents cleaned up
- [ ] Next steps documented

This ensures completed tasks are properly documented with full context preservation.