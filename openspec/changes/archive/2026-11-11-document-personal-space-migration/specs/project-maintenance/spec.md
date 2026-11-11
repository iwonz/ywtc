# Spec Delta

## MODIFIED Requirements

### Requirement: Personal-source documentation and regressions
Canonical documentation and package checks SHALL cover personal-page and space-root sources, scope differences, separate container accounting, stable identity and read-only inventory boundaries using neutral fixtures. The README SHALL provide a dedicated concise workflow for both remote-provider directions.

#### Scenario: Operator reads source guidance
- **WHEN** an operator opens the dedicated README personal-space subsection
- **THEN** it SHALL distinguish the Yandex Wiki `/users/<login>/` page root from Confluence Data Center and Cloud personal-space roots
- **AND** it SHALL identify the destination as an existing parent page rather than a space-root source locator
- **AND** it SHALL describe full-space subtree selection, homepage page/linked scopes, generated destination structure, API permission limits and excluded space settings without new flags or duplicate general examples

#### Scenario: Operator starts personal-space migration
- **WHEN** an operator follows the dedicated README personal-space workflow
- **THEN** it SHALL provide copyable dry-run and live `subtree` commands for Yandex Wiki → Confluence and Confluence → Yandex Wiki

#### Scenario: Isolated package executes personal export
- **WHEN** the packed CLI runs against a deterministic personal-space fixture
- **THEN** tests SHALL verify independent branches, exact real-page totals, no synthetic page API calls and no provider mutation during dry-run or mention-only export
