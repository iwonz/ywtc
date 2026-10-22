# targeted-run-retry Specification

## Purpose
Enable operators to continue a large transfer from a prior run while retrying only actionable incomplete objects and preserving a truthful aggregate migration outcome.

## Requirements

### Requirement: Run-correlated retry command
The CLI SHALL expose `ywtc retry <run-id>` with `--workdir`, `--dry-run`, `--open-report`, and `--concurrency`, and SHALL restore every other migration input from local run evidence without credentials.

#### Scenario: Valid live retry
- **WHEN** an operator supplies a terminal live migration Run ID
- **THEN** ywtc SHALL restore its source, destination, profiles, scope, source status, comment policy, export format, archive policy, and selected state before provider mutation

#### Scenario: Invalid retry selector
- **WHEN** the selector is not a canonical UUID, the report or state is absent or invalid, or canonical identity no longer matches the configured profiles
- **THEN** ywtc SHALL exit with code `2`, identify the local mismatch, and perform no provider or filesystem-destination mutation

#### Scenario: Dry-run is used as retry origin
- **WHEN** the selected root run is a dry-run rather than an attempted live transfer
- **THEN** ywtc SHALL reject it with guidance to run a live migration because it has no attempted outcomes to continue

### Requirement: Latest live retry lineage
A retry SHALL form a state-correlated lineage and SHALL continue from the latest terminal live result in that lineage even when the operator supplies an earlier member Run ID.

#### Scenario: Root is retried repeatedly
- **WHEN** the same original Run ID is retried after one or more retry runs
- **THEN** ywtc SHALL use the latest terminal live child as its baseline and SHALL not select objects already resolved by that child

#### Scenario: Retry preview is generated
- **WHEN** a retry runs with `--dry-run`
- **THEN** it SHALL produce a preview report without changing state, destination, or the authoritative live lineage head

#### Scenario: Concurrent retry targets one state
- **WHEN** another live migration or retry holds the selected state lease
- **THEN** ywtc SHALL stop before destination mutation and identify the active non-secret operation

### Requirement: Typed actionable retry selection
The system SHALL classify prior outcomes as `retry`, `context`, `terminal`, or `resolved` from typed page, resource, comment, discovery, and inventory evidence rather than diagnostic text.

#### Scenario: Retryable incomplete object
- **WHEN** a page, resource, comment archive, discovery operation, or inventory operation is failed or partial with unresolved retryable evidence
- **THEN** the object SHALL be selected for retry

#### Scenario: Retryable Grid payload
- **WHEN** a page is readable with a source fallback but one enumerated Grid payload has an unresolved retryable `grid-read` outcome
- **THEN** the Grid SHALL be selected as the root actionable resource and its owning page SHALL be selected only for the required final rerender and verification

#### Scenario: Interrupted object
- **WHEN** a live run left an otherwise selected object `not-started`
- **THEN** the object SHALL be selected for retry

#### Scenario: Causal blocked subtree
- **WHEN** an actionable page caused selected descendants, resources, or comment archives to be blocked
- **THEN** those dependent objects SHALL be selected in safe top-down order without being counted as independent root failures

#### Scenario: Complete or information-preserving result
- **WHEN** an object is complete or has only normalization, adaptation, or preserved-external-reference evidence
- **THEN** it SHALL be resolved and SHALL NOT be retried

#### Scenario: Terminal problem
- **WHEN** an incomplete object has only non-retryable degradation, permanent typed failure, or proven ownership conflict evidence
- **THEN** it SHALL remain terminal, SHALL NOT be mutated automatically, and SHALL remain visible in the aggregate report

### Requirement: Frozen targeted graph and dependency context
A retry SHALL preserve the latest live selected graph, refresh current source data only for actionable pages, and load successful ancestors and mappings only as read-only dependency context.

#### Scenario: Successful source page changed later
- **WHEN** a previously complete page changes after the baseline run but is not an actionable dependency
- **THEN** retry SHALL leave that page unchanged and ordinary `migrate` SHALL remain the way to reconcile it

#### Scenario: Actionable page changed later
- **WHEN** a selected problem page has newer source content or resources
- **THEN** retry SHALL use its current source representation and SHALL transfer new or changed referenced managed resources required by that page

#### Scenario: Selected page has successful ancestors
- **WHEN** an actionable page depends on successful mapped ancestors
- **THEN** ywtc SHALL verify those ancestors as context without rewriting their bodies

#### Scenario: Context parent disappeared
- **WHEN** a required mapped ancestor is no longer available at destination
- **THEN** ywtc SHALL promote it to a recovery dependency and SHALL block descendants only if that recovery cannot be confirmed

#### Scenario: Discovery was incomplete
- **WHEN** the baseline stopped with incomplete source discovery
- **THEN** retry SHALL resume compatible discovery checkpoints until the selected graph is complete and SHALL include newly discovered unprocessed pages

### Requirement: Object-granular idempotent execution
Retry SHALL reuse the ordinary source-authoritative page, resource, comment, verification, and checkpoint behavior while mutating only actionable objects and promoted dependencies.

#### Scenario: One resource failed
- **WHEN** a page body and other resources are complete but one managed resource is actionable
- **THEN** ywtc SHALL retry that resource, reuse verified mappings for the others, rerender and verify the owning page, and SHALL NOT duplicate complete resources

#### Scenario: One Grid payload failed
- **WHEN** a Grid payload is actionable while the page core and sibling resources have reusable checkpoints
- **THEN** ywtc SHALL reread only that Grid payload, reuse the sibling outcomes, replace its source fallback after success, and verify the owning page without rewriting unrelated pages

#### Scenario: Only comments failed
- **WHEN** an enabled comment archive is actionable while its page and ordinary resources are complete
- **THEN** ywtc SHALL retry the comment pipeline without rewriting an equivalent page body

#### Scenario: Required retry inventory is incomplete
- **WHEN** selected hierarchy, required page content, resource enumeration, or a required dependency cannot be completely inspected
- **THEN** the retry SHALL stop before every destination mutation and retain reusable successful checkpoints

#### Scenario: Retryable enrichment remains unavailable
- **WHEN** an independently identified Grid payload remains unavailable but a complete page fallback can be rendered
- **THEN** the retry SHALL preserve that resource as actionable, continue safe unrelated mutations, and leave the owning page partial until a later retry succeeds

#### Scenario: Retry inventory is incomplete
- **WHEN** any selected object or required dependency cannot be completely inspected
- **THEN** the retry SHALL stop before every destination mutation and retain reusable successful checkpoints

### Requirement: Aggregate retry reporting and exit semantics
Every attempted retry SHALL report the full migration outcome while distinguishing fresh attempts, carried-forward results, remaining actionable work, and terminal problems.

#### Scenario: Retry report is written
- **WHEN** a retry attempt reaches report generation
- **THEN** its HTML, JSON, terminal summary, state run, and report catalog SHALL share one new Run ID and identify root run, parent run, attempt number, selected objects, context pages, carried-forward objects, and remaining outcomes

#### Scenario: Retry partially succeeds
- **WHEN** some selected objects recover and others remain actionable or terminal
- **THEN** fixed issues SHALL disappear, untouched terminal issues SHALL remain, aggregate counts SHALL reconcile, exit code SHALL be `1`, and the CLI SHALL print the next command using the lineage root Run ID

#### Scenario: No actionable work and migration is complete
- **WHEN** the latest live lineage result has no incomplete object
- **THEN** ywtc SHALL make no API request, create no run, return `0`, and show the latest report

#### Scenario: Only terminal problems remain
- **WHEN** no automatically retryable object remains but the aggregate migration is incomplete
- **THEN** ywtc SHALL make no mutation, create no duplicate run, return `1`, show the latest report, and explain that automatic retry has no remaining work

#### Scenario: Retry is interrupted
- **WHEN** SIGINT or SIGTERM interrupts an attempted retry
- **THEN** ywtc SHALL safely checkpoint outcomes, write its correlated report, return `130` or `143`, and allow the same lineage root command to continue remaining work
