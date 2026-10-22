# Spec Delta

## ADDED Requirements

### Requirement: Canonical internal-reference verification
Destination verification SHALL compare internal page references by their proven canonical destination identity and anchor rather than provider-specific title, URL, or serialized resource-identifier form.

#### Scenario: Provider adds an immutable page ID
- **WHEN** ywtc renders an internal link using a mapped page title and the destination returns the same link with its immutable page ID
- **THEN** verification SHALL treat the references as equivalent while still requiring the visible label and anchor payload to remain represented

#### Scenario: Reference targets differ
- **WHEN** expected and actual internal links resolve to different immutable destination pages
- **THEN** verification SHALL fail with the affected reference identified

### Requirement: Evidence-preserving resource verification
The system SHALL keep confirmed upload response evidence separate from destination read-back verification and SHALL NOT report a transferred resource as absent solely because later attachment listing or download is forbidden or temporarily unavailable.

#### Scenario: Upload succeeds but read-back is forbidden
- **WHEN** upload returns a destination resource identity and size but verification receives a permission error
- **THEN** the resource SHALL remain recorded as uploaded but unverified, the page SHALL remain incomplete until verification succeeds, and retry SHALL target verification without duplicating the upload

#### Scenario: Read-back disproves upload evidence
- **WHEN** destination read-back finds no matching resource or proves a size or content mismatch
- **THEN** the resource SHALL receive a retryable failed outcome and the rendered page SHALL retain a safe source fallback

### Requirement: Confirmed destination operation recovery
Operations against an already confirmed destination space, parent, or mapped page SHALL use bounded read-after-write consistency recovery before becoming a terminal staging failure.

#### Scenario: Confirmed space or parent is temporarily missing
- **WHEN** page creation or update returns a not-found response for a space or parent already confirmed in the current transfer
- **THEN** the system SHALL re-read the dependency, reconcile its mapping, and retry within bounds before failing the page

#### Scenario: Provider denies page creation
- **WHEN** creation returns a permission-like response that does not prove whether the parent, policy, or body caused rejection
- **THEN** the diagnostic SHALL distinguish confirmed permission denial from ambiguous provider rejection and SHALL NOT classify it as an ownership conflict

### Requirement: Current issue lifecycle accounting
Issue totals SHALL distinguish unresolved failures from successful recovery events and SHALL derive retryable counts from current unresolved object outcomes.

#### Scenario: Consistency retry succeeds
- **WHEN** a page or resource initially fails but a bounded recovery attempt verifies the intended outcome
- **THEN** the original diagnostic SHALL be retained as a recovered event and SHALL NOT increase current warning, error, or remaining-retryable totals

#### Scenario: Recovery remains unsuccessful
- **WHEN** all bounded attempts finish without verification
- **THEN** one deduplicated unresolved issue SHALL contribute to the final outcome and retry plan

### Requirement: Complete Grid outcome reconciliation
Every discovered Grid resource SHALL have exactly one explicit current outcome included consistently in terminal, state, report, and retry totals.

#### Scenario: Grid data is unavailable
- **WHEN** a Grid is discovered but its payload cannot be read
- **THEN** it SHALL be reported as failed, blocked, or unavailable with an actionable source fallback rather than disappearing from the outcome sum

#### Scenario: Grid snapshot is complete
- **WHEN** all Grid rows, cells, links, and representable values are preserved in a static destination table
- **THEN** the Grid SHALL be complete with an adaptation notice and no degradation

### Requirement: Literal template syntax isolation
Source text that is not an explicitly supported YFM variable construct SHALL remain literal through vendor transformation and SHALL not be evaluated as an undocumented template expression.

#### Scenario: Configuration template is documented as text
- **WHEN** source content contains Helm, Jinja, Go-template, shell, or similar brace syntax in prose or code
- **THEN** the syntax and surrounding text SHALL be preserved without an interpolation error

#### Scenario: Preferred renderer produces no meaningful body
- **WHEN** non-empty source content yields an empty preferred render
- **THEN** the system SHALL attempt a safe structural render before using the complete raw snapshot fallback and SHALL record the chosen representation

### Requirement: Replacement-safe report serialization
The HTML report generator SHALL inject arbitrary serialized source-derived data without interpreting replacement-string metacharacters or emitting additional document boundaries.

#### Scenario: Report data contains replacement metacharacters
- **WHEN** report metadata or previews contain `$&`, `$'`, `$```, script-like text, Unicode separators, or HTML closing tokens
- **THEN** the generated report SHALL contain exactly one application data payload and one HTML document whose decoded data round-trips exactly

#### Scenario: Large report is generated
- **WHEN** a run contains thousands of pages or large previews
- **THEN** report generation SHALL bound eagerly embedded preview data while retaining complete diagnostics and an explicit local path to any deferred preview artifact
