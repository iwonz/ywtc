# wiki-migration Spec Delta

## MODIFIED Requirements

### Requirement: Observable migration progress
The CLI SHALL continuously identify the active transfer phase and work, show exact completed/total counters where totals are known, and provide one consistent terminal summary in TTY and non-TTY environments without counting in-flight work as complete. Long CPU-heavy batches SHALL remain cooperatively responsive to progress rendering, heartbeat timers, and termination signals.

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

#### Scenario: Plan transitions to destination preparation
- **WHEN** the exact migration plan has been emitted and post-plan preparation begins
- **THEN** the next visible status SHALL identify that preparation phase before performing its expensive work and SHALL NOT leave `Plan ready` as the apparent active phase

#### Scenario: CPU-heavy page batch
- **WHEN** normalization, rendering, fingerprinting, report preparation, or another page batch continuously consumes CPU
- **THEN** the batch SHALL yield often enough for heartbeat output, TTY repaint, and SIGINT or SIGTERM handling to remain responsive
- **AND** yielding SHALL NOT mark work complete or change migration ordering

#### Scenario: Phase progress can be estimated
- **WHEN** a phase has a known total and enough confirmed completions to calculate a stable rate
- **THEN** live output SHALL show completed and total units, throughput, and a bounded ETA estimate
- **AND** it SHALL omit ETA instead of presenting a speculative value before enough evidence exists

#### Scenario: Concurrent work is active
- **WHEN** a bounded queue is processing pages, resources, comments, or verification concurrently
- **THEN** live output SHALL distinguish confirmed completions from queued and in-flight work and SHALL show a bounded sample of active objects

#### Scenario: Non-interactive output
- **WHEN** progress is rendered without an interactive terminal
- **THEN** heartbeat records SHALL be rate-limited, line-oriented, and contain the same phase, counter, active-work, and timing meaning as interactive output

#### Scenario: Transfer terminates
- **WHEN** a transfer succeeds, fails, is cancelled, or is interrupted by a signal
- **THEN** progress heartbeat activity SHALL stop before the command returns and SHALL NOT keep the process alive

#### Scenario: Status label contains unsafe or excessive text
- **WHEN** an active page, resource, or provider diagnostic contains control characters, line breaks, ANSI escapes, or an excessively long label
- **THEN** live progress SHALL show a single-line bounded label without exposing credentials or disrupting terminal rendering
