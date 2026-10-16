# Spec Delta

## ADDED Requirements

### Requirement: Comment archive documentation
The README SHALL describe page comment archival, authorship, nesting, statuses, comment attachment ZIPs, default enablement, disable flag, resumable outcomes, and limitations within the existing fixed information architecture.

#### Scenario: Transfer coverage is reviewed
- **WHEN** an operator reads the Features and Parameters sections
- **THEN** comments and explicitly linked page attachments SHALL appear as supported content, `--no-comments` SHALL be documented, and reactions plus attachment/blog/custom-content comments SHALL remain listed as not transferred

#### Scenario: Failure behavior is reviewed
- **WHEN** an operator reads the State and Reports sections
- **THEN** the documentation SHALL explain partial comment outcomes, conflict/stale preservation, exact counts, archive previews, and non-deletion without adding a new second-level section

### Requirement: Packaged comment CLI verification
Package and project checks SHALL exercise the public comment flags, provider contracts, normalized rendering, deterministic archives, resume behavior, report reconciliation, and filesystem output without including runtime comments or identity data in the published package.

#### Scenario: Packaged help
- **WHEN** an installed package runs `ywtc migrate --help` or `ywtc doctor --help`
- **THEN** both commands SHALL document comments enabled by default and the `--no-comments` opt-out without loading workspace configuration

#### Scenario: Publication hygiene
- **WHEN** the npm package is packed
- **THEN** source fixtures, cached comment bodies, generated ZIPs, reports, tokens, email addresses, and runtime state SHALL be excluded
