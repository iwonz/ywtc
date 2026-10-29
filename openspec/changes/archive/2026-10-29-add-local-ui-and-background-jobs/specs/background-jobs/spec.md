## Purpose

Provide private durable local execution that remains observable and controllable independently of the initiating terminal or browser.

## ADDED Requirements

### Requirement: Durable background submission
Migration, retry and mention/hashtag export commands SHALL accept -b/--background, persist a non-secret request before returning success, and report a Job ID separately from Run ID. Foreground commands SHALL wait for the same execution service and retain result and signal exit codes.

#### Scenario: Background transfer is accepted
- **WHEN** a valid background request is submitted
- **THEN** the command SHALL return zero only after durable acceptance, print inspection guidance and leave execution independent of the client

#### Scenario: Incompatible presentation flags
- **WHEN** background is combined with interactive or open-report
- **THEN** argument validation SHALL reject it before job or provider mutation

#### Scenario: Accepted task fails provider preflight
- **WHEN** the worker rejects provider readiness before resolving migration pages
- **THEN** it SHALL retain a failed job result and redacted diagnostics without creating migration mappings or a migration report

### Requirement: Workspace queue isolation
Each workspace SHALL execute one managed operation at a time in FIFO order, preserve existing state/export leases and allow other workspaces to proceed independently.

#### Scenario: Concurrent submissions
- **WHEN** CLI and UI submit work to one workspace
- **THEN** every accepted request SHALL run at most once, later work SHALL wait, and the coordinator SHALL exit after the queue becomes idle

### Requirement: Job control and crash semantics
The CLI SHALL expose migrations list/show/logs/stop with workdir selection and active-list shorthand. Jobs SHALL distinguish queued/running/stopping/finished/interrupted from operation result, and SHALL NOT automatically retry a crashed operation.

#### Scenario: Stop or disconnect
- **WHEN** an operator stops a task or merely disconnects its browser
- **THEN** stop SHALL request graceful checkpointing without unsafe PID signals, while disconnection SHALL leave the task running

#### Scenario: Worker disappears
- **WHEN** a worker terminates without a confirmed final result
- **THEN** its task SHALL become interrupted with the last known checkpoint and SHALL require explicit continuation

### Requirement: Replayable truthful progress
Operations SHALL emit redacted typed progress, active work, diagnostics, object outcomes and run correlation. Persisted events SHALL have ordered cursors, and missing heartbeat SHALL indicate uncertain activity rather than fabricated completion.

#### Scenario: Browser reconnects
- **WHEN** an event subscriber reconnects with its last sequence
- **THEN** it SHALL receive later retained events or a fresh snapshot and SHALL NOT restart the operation

#### Scenario: Total is unknown
- **WHEN** discovery or another phase has no confirmed total
- **THEN** progress SHALL omit a fictitious percentage and distinguish prepared, active and verified outcomes
