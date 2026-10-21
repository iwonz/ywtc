# Spec Delta

## ADDED Requirements

### Requirement: Credential-free effective request evidence
Each migration report SHALL retain enough redacted effective-request metadata to reproduce its canonical transfer locally without storing credentials or changing automatic state identity.

#### Scenario: New report is used for retry
- **WHEN** a live migration writes its report
- **THEN** the report SHALL retain source and destination locators and profiles, scope, source status, comments, filesystem format, archive policy, and state selection needed by `ywtc retry`

#### Scenario: Existing current report lacks the request block
- **WHEN** an otherwise valid current report predates explicit effective-request metadata
- **THEN** retry SHALL reconstruct only provable inputs from canonical report fields and outputs and SHALL reject the operation before provider calls if any required input cannot be proven

### Requirement: Retry-aware state run history
State run history SHALL distinguish ordinary migrations from retry attempts and correlate every live retry with one root and parent Run ID without changing canonical transfer identity.

#### Scenario: Live retry begins
- **WHEN** an actionable retry acquires the selected state
- **THEN** its state run SHALL record operation, root run, parent run, attempt number, and selected object counts before destination mutation

#### Scenario: Existing state is loaded
- **WHEN** current state has run records without retry metadata
- **THEN** those records SHALL remain valid ordinary migration runs and SHALL require no state conversion or new state ID

### Requirement: Aggregate per-object retry provenance
Retry reports SHALL preserve the latest known result of every baseline page, resource, and comment archive and SHALL identify whether each result was attempted in the current run or carried forward.

#### Scenario: Successful object is outside retry selection
- **WHEN** a baseline object is complete and not a retry dependency
- **THEN** its outcome SHALL remain in the retry report without a provider write and SHALL identify the Run ID that supplied that outcome

#### Scenario: Selected object is retried
- **WHEN** a selected object receives a new terminal outcome
- **THEN** the aggregate report SHALL replace its earlier outcome and unresolved issues with the fresh result while retaining the rest of the baseline migration

#### Scenario: Retry surfaces are compared
- **WHEN** terminal, state, report JSON/HTML, and `reports list` describe a retry
- **THEN** full migration totals and retry-attempt totals SHALL reconcile without counting carried-forward objects as freshly attempted
