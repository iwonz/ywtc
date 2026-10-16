# Spec Delta

## ADDED Requirements

### Requirement: Dependency-aware comment archive outcomes
The system SHALL distinguish dry-run plans, dependency-blocked archives, and interrupted archives from comment operations that were actually attempted and failed.

#### Scenario: Destination page is unavailable
- **WHEN** a destination page fails or is blocked before comment processing can begin
- **THEN** its enabled comment archive SHALL be `blocked`, SHALL identify the upstream page and cause, and SHALL NOT issue a destination comment mutation

#### Scenario: Live run stops before comment processing
- **WHEN** a non-dry-run is interrupted before an otherwise independent comment archive begins
- **THEN** that archive SHALL be `not-started` rather than `planned` or `failed`

#### Scenario: Dry-run plans a comment archive
- **WHEN** a dry-run includes comments for a selected page
- **THEN** its comment archive outcome SHALL be `planned`

#### Scenario: Upstream page recovers on rerun
- **WHEN** a repeated run successfully creates or reconciles a page whose comment archive was blocked
- **THEN** the archive SHALL resume through its ordinary idempotent create, update, or verification flow without requiring `--fresh`

#### Scenario: Blocked archive is reported
- **WHEN** a page dependency prevents comment archival
- **THEN** the blocked archive SHALL contribute to dependent-block totals and SHALL NOT be counted as an independent comment API error
