# Spec Delta

## MODIFIED Requirements

### Requirement: Terminal report access
The CLI SHALL expose safe report listing and opening commands and SHALL print a clickable local URL whenever a run produces an HTML report.

#### Scenario: Transfer report is produced
- **WHEN** a migration finishes as completed, partial, failed, cancelled, or interrupted and an HTML report was written
- **THEN** terminal output SHALL include its run ID, filesystem path, `file://` URL, and an exact workspace-aware `ywtc reports open <run-id>` command, and `--open-report` SHALL attempt to open it without changing the migration result if opening fails

#### Scenario: Reports are listed
- **WHEN** the operator runs `ywtc reports list`
- **THEN** valid report bundles SHALL be listed newest first with run ID, time, direction, scope, status, page counts, issue counts, and path while malformed bundles are skipped with a warning

#### Scenario: A report is opened
- **WHEN** the operator runs `ywtc reports open [run-id|last]`
- **THEN** the requested valid report, or newest valid report when `last` or no selector is supplied, SHALL open through the operating system without permitting path traversal outside the selected workdir

#### Scenario: Report cannot be opened
- **WHEN** no valid report exists, the run ID is invalid, or the operating system opener fails
- **THEN** the command SHALL fail with an actionable redacted diagnostic and print the local URL when one is available

### Requirement: Confirmed destination mapping consistency recovery
The system SHALL apply bounded consistency retries only to destination page IDs previously confirmed by state, create, or update and SHALL recover a persistently missing mapping without deleting content.

#### Scenario: Confirmed page is temporarily unavailable
- **WHEN** reads of a previously confirmed destination ID return transient `404` responses before becoming readable
- **THEN** the system SHALL retry with bounded jittered backoff and continue with the original mapping

#### Scenario: Confirmed page remains unavailable
- **WHEN** consistency retries for a previously confirmed ID are exhausted
- **THEN** the system SHALL search under the expected parent for matching source-derived content, adopt a confirmed match, or recreate the page with bootstrap content and retain the prior ID in state history

#### Scenario: Recovery lookup is unavailable
- **WHEN** the expected parent was confirmed but a provider's candidate or collision lookup fails independently of page creation
- **THEN** the system SHALL record the lookup failure, attempt safe bootstrap recreation, verify the created page, and SHALL NOT adopt an unverified candidate

#### Scenario: Missing subtree is recreated
- **WHEN** the root and descendants represented by current state are no longer available at the destination
- **THEN** the system SHALL recreate the root before its descendants, restore the selected hierarchy, reset stale resource mappings, and checkpoint every verified replacement ID

#### Scenario: Missing page is recreated
- **WHEN** a destination page is recreated after a persistent missing mapping
- **THEN** its old attachment mappings SHALL be reset, verified cache files SHALL be reused, and its expected hierarchy SHALL be restored where supported

#### Scenario: Provider normalizes bootstrap markup
- **WHEN** the destination rewrites page serialization between verified bootstrap creation and final rendering
- **THEN** the system SHALL continue only if provider-aware semantic verification finds no meaningful content or structure change, record a safe normalization, and retain conflict protection for any meaningful difference

#### Scenario: Raw source snapshot already exists
- **WHEN** a page requires a raw fallback snapshot and the destination page already contains the deterministic snapshot filename while state lacks a usable attachment mapping
- **THEN** the system SHALL verify and adopt or safely update that attachment instead of attempting a duplicate create, and SHALL report a transfer error if reconciliation cannot prove or write the snapshot

#### Scenario: Parent or recreation cannot be confirmed
- **WHEN** the expected parent is unavailable or the recreated page cannot be read back
- **THEN** the page SHALL be blocked or failed, no destination object SHALL be deleted, and no unrelated page SHALL be adopted

#### Scenario: New locator is missing
- **WHEN** a source or destination locator that has never been confirmed returns `404`
- **THEN** the system SHALL fail that resolution without applying consistency retries or creating a replacement
