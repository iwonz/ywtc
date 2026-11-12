# Spec Delta

## ADDED Requirements

### Requirement: Progressive and bounded operator README
The maintained `README.md` SHALL lead an unfamiliar operator from the shortest safe start to the applicable scenario and only then to detailed reference material. It MUST contain no more than 6,500 whitespace-delimited words while preserving every README contract already required by this capability.

#### Scenario: New operator reaches an applicable workflow
- **WHEN** an unfamiliar operator reads the README from the beginning
- **THEN** the document presents the guided first run before a compact scenario selector
- **AND** the selector identifies the minimum entry point for a normal migration, a personal-space migration in either direction, a static export, and continuation or recovery of an existing migration
- **AND** detailed configuration, CLI, state, outcome, and contributor references follow in increasing depth

#### Scenario: Narrative material is compacted without contract loss
- **WHEN** maintainers simplify repeated explanations or descriptive UI prose
- **THEN** each operational rule remains in one canonical location
- **AND** the document retains required commands, options, configuration fields, safety boundaries, compatibility guidance, personal-space examples, state and retry semantics, exhaustive status conditions and actions, and release guidance
- **AND** decorative UI behavior and prose that merely restates a table are not required

#### Scenario: README growth is validated
- **WHEN** repository checks validate `README.md`
- **THEN** validation fails if the document exceeds 6,500 whitespace-delimited words
- **AND** validation fails if the scenario selector or any existing structural, example, personal-space, or status-table contract is missing
