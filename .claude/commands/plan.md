---
description: Research and plan a task with clarifying questions and current best practices
argument-hint: "feature or task to plan"
---

# Plan Task: $ARGUMENTS

I'll research current best practices, ask clarifying questions, and create a detailed specification for this task.

## Phase 1: Initial Analysis & Research

<Task>
  <description>Research current best practices and approaches</description>
  <prompt>
TASK TO PLAN: $ARGUMENTS

Perform comprehensive research and initial analysis:
1. Break down the task into key components and decisions needed
2. Research current best practices using web search for:
   - Latest approaches and frameworks for this type of task
   - Common pitfalls and how to avoid them
   - Industry standards and recommendations
   - Performance and security considerations
3. Identify what information is missing or unclear
4. List the key decisions that need to be made
5. Note any constraints or dependencies to consider

Format your findings clearly to inform the next phase of questioning.
  </prompt>
  <subagent_type>research-analyst</subagent_type>
</Task>

## Phase 2: Clarifying Questions

Based on research, I'll ask targeted questions to clarify requirements:

<Task>
  <description>Ask clarifying questions based on research</description>
  <prompt>
TASK: $ARGUMENTS

RESEARCH FINDINGS:
[Research results from Phase 1 will be inserted here]

Based on the research above, generate specific clarifying questions for the user:
1. Review the research findings and identify key decision points
2. Create targeted questions about:
   - Technical approach preferences
   - Functional requirements and scope
   - Non-functional requirements (performance, security, scalability)
   - Integration needs and constraints
   - User experience expectations
   - Timeline and resource constraints

Present questions in a clear, organized format that helps the user make informed decisions.
Ask 5-8 focused questions - not too many to overwhelm, but enough to clarify the approach.
  </prompt>
  <subagent_type>problem-setup</subagent_type>
</Task>

## Phase 3: Interactive Planning

**I'll wait for your answers to the clarifying questions, then automatically continue with the detailed specification.**

To continue with your answers, simply respond with your preferences for each question. I'll then generate:
- Detailed architecture and technical approach
- Step-by-step implementation plan  
- File structure and component breakdown
- Testing strategy
- Risk assessment and mitigation strategies

The final specification will be stored and ready for execution with `/smart-task`.