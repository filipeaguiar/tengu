## Context

The repository currently lacks a centralized location detailing what agents are, how to configure them, and the structure of their configurations (such as defining new agents and creating skill and workflow capabilities). Contributors require a single, clear source of truth to streamline development and onboarding with the Antigravity agent system in this workspace.

## Goals / Non-Goals

**Goals:**
- Provide a clear, accessible markdown document (`AGENTS.md`) at the repository root explaining agent definitions, customizations, and capabilities.
- Formalize the structure and intent of `AGENTS.md` through an OpenSpec specification (`specs/agents-documentation/spec.md`).
- Ensure the project README accurately references `AGENTS.md`.

**Non-Goals:**
- We are not changing any underlying agent code or implementation mechanics in this change.
- We will not migrate existing, scattered agent documentation outside of creating this primary reference file.

## Decisions

- **File Location:** Placed at the repository root (`AGENTS.md`) to maximize visibility alongside `README.md`.
- **Content Structure:** It will include an overview of the agent system, definitions of customizations (like Skills and Workflows), and guidelines on how to contribute new capabilities using OpenSpec. This structure mirrors standard project conventions, making it predictable for developers.
- **Specification:** A dedicated capability spec (`agents-documentation`) will be written in the `openspec/specs/` directory to formally document the requirement, ensuring that the standard is maintained over time.

## Risks / Trade-offs

- **Risk:** The document may quickly become outdated if the agent system evolves rapidly.
  - **Mitigation:** The presence of a formal specification (`specs/agents-documentation/spec.md`) ensures that any changes to agent guidelines are explicitly reviewed as requirement updates.
