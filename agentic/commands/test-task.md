---
description: Run adversarial testing on completed work
argument-hint: "task ID or description"
---

## Adversarial Testing: $ARGUMENTS

I'll run comprehensive testing on the completed work to find issues and edge cases.

<Task>
  <description>Run adversarial testing</description>
  <prompt>
Task to test: $ARGUMENTS

Perform adversarial testing:
1. Identify the task/work to test
2. Find potential vulnerabilities, edge cases, and issues
3. Test error handling and boundary conditions
4. Verify security and performance
5. Report all findings

Be thorough and critical - try to break things!
  </prompt>
  <subagent_type>adversarial-tester</subagent_type>
</Task>