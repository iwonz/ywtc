# Spec Delta

## MODIFIED Requirements

### Requirement: Observable migration progress
The CLI SHALL continuously identify the active transfer phase and work, show exact completed/total counters where totals are known, and provide one consistent terminal summary in TTY and non-TTY environments without counting in-flight work as complete.

#### Scenario: Discovery and completion
- **WHEN** a transfer runs
- **THEN** output SHALL identify the active phase and object, selected pages and graph edges, content/resources completed or failed, final status, result paths or URLs, state/report paths, and any required next action

#### Scenario: Preflight completes
- **WHEN** the source graph and resources have been inspected
- **THEN** the CLI and report SHALL include measurable page, attachment, byte, link, image, table, grid-row, code-block, degradation, and warning counts

#### Scenario: Migration is running
- **WHEN** a page skeleton, resource, final page body, comment archive, or verification completes, fails, conflicts, is reused, or is skipped
- **THEN** the CLI SHALL update the corresponding completed/total counters and identify the affected object and outcome

#### Scenario: Long operation has no completion event
- **WHEN** a network request, provider retry, render, upload, comment operation, verification, or export step remains in flight longer than the progress heartbeat interval
- **THEN** the CLI SHALL refresh the current phase, a bounded sample and count of active objects, elapsed time, and time since the last confirmed completion without advancing any completed counter

#### Scenario: Non-interactive output
- **WHEN** progress is rendered without an interactive terminal
- **THEN** heartbeat records SHALL be rate-limited, line-oriented, and contain the same phase, counter, active-work, and timing meaning as interactive output

#### Scenario: Transfer terminates
- **WHEN** a transfer succeeds, fails, is cancelled, or is interrupted by a signal
- **THEN** progress heartbeat activity SHALL stop before the command returns and SHALL NOT keep the process alive

#### Scenario: Status label contains unsafe or excessive text
- **WHEN** an active page, resource, or provider diagnostic contains control characters, line breaks, ANSI escapes, or an excessively long label
- **THEN** live progress SHALL show a single-line bounded label without exposing credentials or disrupting terminal rendering
