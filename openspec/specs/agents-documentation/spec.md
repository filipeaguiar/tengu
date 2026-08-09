## ADDED Requirements

### Requirement: Centralized Agent Documentation
The system SHALL provide a central markdown document named `AGENTS.md` at the repository root that explains the purpose, capabilities, and configuration of the Antigravity agent system in this project.

#### Scenario: Contributor seeks agent documentation
- **WHEN** a contributor looks at the repository root
- **THEN** they find an `AGENTS.md` file
- **THEN** the file contains sections on agent definitions, skills, and workflows

### Requirement: README Reference
The project `README.md` SHALL contain a link referencing `AGENTS.md` to guide new developers to the agent guidelines.

#### Scenario: Developer reads the main README
- **WHEN** a developer reads `README.md`
- **THEN** they see a clear pointer or link to `AGENTS.md` for AI agent customizations
