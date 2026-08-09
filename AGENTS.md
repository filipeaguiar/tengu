# Antigravity Agents

Welcome to the Antigravity Agents documentation for this repository. This document outlines what agents are, how they are configured, and the conventions for extending their capabilities via OpenSpec.

## What are Agents?

Agents in Antigravity are autonomous entities that can help you with tasks, from exploring ideas (via `openspec-explore`) to planning and executing code changes (via `openspec-propose` and `openspec-apply-change`). They operate in the background and can use tools to interact with your filesystem, terminal, and APIs.

## Customizations

The Antigravity system allows customizing agent behavior through several mechanisms, typically located in `.agent` or `.gemini/config` directories:

### Skills

Skills are specialized instructions for specific workflows. They contain a `SKILL.md` file with detailed steps on how the agent should handle a particular domain or slash command (like `/openspec-propose`).

### Workflows

Workflows are step-by-step guides for particular tasks. If a workflow seems relevant to a prompt, the agent will load and follow its instructions to ensure consistency.

### OpenSpec Capabilities

When adding new features to the project, you should use the OpenSpec workflow. A capability is formally defined by creating a spec file in the `openspec/specs/<capability>/spec.md` folder.

- **`openspec-explore`**: Use this to brainstorm and clarify requirements.
- **`openspec-propose`**: Use this to create a formal change with a proposal, design, tasks, and specifications.
- **`openspec-apply-change`**: Use this to let the agent implement the tasks from an approved change proposal.

For more details on the Antigravity agent framework, please refer to the core AGY documentation.
