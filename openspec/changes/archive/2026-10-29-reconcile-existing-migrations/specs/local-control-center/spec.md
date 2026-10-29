## ADDED Requirements

### Requirement: Synchronization review
The local application SHALL expose run-bound synchronization analysis, optional subtree selection, searchable change classification, source/destination diff, eligible decisions, Keep continuity, incoming link patches and explicit application through shared jobs. Decision edits SHALL use revision checks.

#### Scenario: Operator reviews a change
- **WHEN** analysis finds additions, changed objects or an unknown baseline
- **THEN** the UI SHALL show the reason, affected resources/comments, actual destination and proposed representation, and SHALL disable apply until required decisions and evidence are complete

#### Scenario: Trash is chosen
- **WHEN** an eligible leaf receives a Trash decision
- **THEN** the UI SHALL show incoming-reference effects and require a separate explicit trash confirmation; unsupported or unproved actions SHALL stay disabled

#### Scenario: Two tabs edit a plan
- **WHEN** a decision update uses a stale revision
- **THEN** the server SHALL reject it without overwriting the current document and the UI SHALL request a refresh
