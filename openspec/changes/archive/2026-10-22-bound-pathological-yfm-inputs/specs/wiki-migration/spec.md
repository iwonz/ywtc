# Spec Delta

## ADDED Requirements

### Requirement: Bounded source-content transformation
The system SHALL bound synchronous vendor-parser and implicit-link work for untrusted source content so one pathological token cannot monopolize the process, suppress progress, or prevent independent pages from transferring. Any payload removed from the rendered view MUST remain available in the unmodified raw source snapshot and MUST produce an actionable degradation.

#### Scenario: Oversized inline payload
- **WHEN** YFM contains an inline data payload or another lexical token larger than the safe parser bound
- **THEN** the system SHALL replace only that token with a readable deterministic marker before vendor parsing
- **AND** it SHALL preserve the surrounding content and formatting as far as the bounded parser permits
- **AND** the page SHALL be `partial` with the complete original source attached or exported as its raw snapshot

#### Scenario: Bounded implicit-link processing
- **WHEN** source text contains ordinary implicit links and an unrelated oversized token
- **THEN** the system SHALL continue detecting and rendering ordinary links from bounded text regions
- **AND** it SHALL NOT submit the oversized token to an unbounded link-matching operation

#### Scenario: Independent transfer continuity
- **WHEN** one page requires bounded transformation because its source payload is pathological
- **THEN** the system SHALL checkpoint that page's explicit degradation and continue processing independent pages
- **AND** progress rendering, heartbeat timers, and termination signals SHALL remain responsive

#### Scenario: Normal source content
- **WHEN** source content remains within the safe parser bounds
- **THEN** the system SHALL pass it through the existing fidelity pipeline without adding a bounded-input degradation
