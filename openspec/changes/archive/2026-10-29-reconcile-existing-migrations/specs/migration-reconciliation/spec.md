# Spec Delta

## Purpose
Let operators safely expand an existing migration after source access or content changes, review effective changes, and repair related references without creating a second transfer identity.

## ADDED Requirements

### Requirement: Run-bound synchronization analysis
The CLI SHALL expose `sync <run-id> [--source <subtree>] [-w <workdir>]` and `sync apply <plan-id> [-w <workdir>]`. Analysis SHALL restore non-secret effective inputs, retain the original canonical state identity, discover newly accessible selected pages and save a private review plan without destination mutation.

#### Scenario: Source access expands
- **WHEN** the selected subtree now exposes pages absent from the previous complete inventory
- **THEN** analysis SHALL include them as additions under existing mapped ancestors without creating another source-root or destination section

#### Scenario: Invalid origin or subtree
- **WHEN** a Run ID, workspace, profile instance, state identity or requested subtree cannot be proved compatible
- **THEN** analysis SHALL stop with a precise validation error before destination mutation

#### Scenario: The chosen report omits current mappings
- **WHEN** current state includes mapped non-excluded pages absent from the report used as baseline
- **THEN** analysis SHALL reject it before provider requests and request a complete current report rather than silently omit outcomes or incoming references

#### Scenario: A recorded connection has changed
- **WHEN** a source or destination profile no longer identifies the recorded provider and canonical instance
- **THEN** analysis SHALL reject it before provider requests; compatible connections SHALL resolve mapped roots using recorded immutable IDs rather than mutable locators

#### Scenario: Required inventory is incomplete
- **WHEN** a selected page or required dependency cannot be read
- **THEN** analysis SHALL retain available diagnostics and checkpoints, return nonzero and disable application

### Requirement: Independent source change evidence
Synchronization SHALL compare content, hierarchy, resources, comments and effective decision policies independently of provider version numbers and serialization order. A verified equivalent body SHALL be reusable; an unprovable historical baseline SHALL be identified explicitly rather than guessed unchanged.

#### Scenario: Content and version differ independently
- **WHEN** source version changes without content changes, or files/comments change without body changes
- **THEN** synchronization SHALL avoid unnecessary body writes and SHALL identify the independently changed objects

#### Scenario: Old evidence is unavailable
- **WHEN** the prior source snapshot cannot be validated and current destination is not proved equivalent
- **THEN** the page SHALL require review with an unknown-baseline reason

### Requirement: Reviewed page decisions
Changed pages SHALL require Update, Keep or eligible Trash decisions before application. Keep SHALL be remembered until the effective source representation changes. New pages SHALL be proposed as additions and unchanged pages SHALL not be rewritten; link-only repairs remain separately reviewable on kept pages.

#### Scenario: Keep is repeated
- **WHEN** the same effective source is analyzed again after Keep
- **THEN** the page SHALL remain kept without another body update or repeated decision request

#### Scenario: Kept source changes again
- **WHEN** source content, resources, comments or effective policies change after Keep
- **THEN** analysis SHALL require a new decision and show the current destination and proposed representation

### Requirement: Preview-bound identity preservation
Application SHALL validate the exact plan, decisions, baseline, source inventory, policies and destination evidence under the state lease. Mapped objects SHALL retain immutable IDs. New objects SHALL use the ordinary bootstrap/reconciliation pipeline, and checkpoints SHALL prevent successful work from being repeated.

#### Scenario: Preview becomes stale
- **WHEN** another operation or user changes required evidence after review
- **THEN** application SHALL reject the stale plan before destination mutation and require refreshed analysis

#### Scenario: Application is interrupted
- **WHEN** interruption or a lost response occurs after an object is written
- **THEN** continuation SHALL reconcile the checkpoint and provider read-back without duplicating pages, files or archives

### Requirement: Scoped incoming reference repair
Synchronization SHALL maintain a rebuildable reverse reference index for the original migration, including unresolved source locators and comment archives. New verified mappings SHALL produce minimal incoming link patches preserving labels, fragments, unrelated content and mention/hashtag decisions, without rewriting whole referring pages.

#### Scenario: An inaccessible page becomes available
- **WHEN** the newly available source identity receives a verified destination mapping
- **THEN** source fallbacks in other mapped sections and comment archives SHALL be proposed for replacement with the corresponding destination reference

#### Scenario: Reference is ambiguous or protected
- **WHEN** identity resolution is ambiguous or the link belongs to a literal mention/hashtag decision
- **THEN** the link SHALL remain unchanged and the plan SHALL explain the reason rather than guess

#### Scenario: An unrelated reference owner is unreadable
- **WHEN** a mapped page or archive outside the selected subtree and its required structural dependencies cannot be read
- **THEN** the plan SHALL disclose incomplete incoming-reference coverage without blocking otherwise verified additions or updates, the resulting run SHALL preserve a warning, and Trash SHALL be unavailable until coverage is complete

### Requirement: Explicit reversible leaf trash
Trash SHALL require a mapped published leaf, proved provider support and a separate explicit confirmation. The CLI SHALL require `--confirm-trash` when applying trash decisions. The system SHALL recheck identity, version and leaf evidence, never purge or remove children, and retain mappings plus a persistent intentional exclusion.

#### Scenario: Trash is not safe
- **WHEN** the page has children, ownership is ambiguous, the page is a draft, or complete leaf/trash evidence is unavailable
- **THEN** Trash SHALL be unavailable and application SHALL not issue a destructive provider request

#### Scenario: A confirmed page is trashed
- **WHEN** an eligible explicit Trash decision is applied
- **THEN** incoming references SHALL first be preserved as source fallbacks, provider trash status SHALL be read back, and subsequent migration/retry SHALL not silently recreate the excluded page

### Requirement: Aggregate synchronization results
The new report SHALL retain the full migration outcome and replace only verified selected outcomes. It SHALL distinguish additions, updates, reused/kept objects, intentional exclusions, link repairs, unresolved references and carried-forward results; source inventory and destination outcomes SHALL reconcile.

#### Scenario: Attachment bytes change without a metadata change
- **WHEN** a selected source attachment retains its ID/name/size but its verified SHA-256 differs
- **THEN** independent resource comparison SHALL detect the change, preview/application SHALL use verified private cache bytes, and an old state cache SHALL not hide the new content

#### Scenario: A mapped Confluence filename belongs to the updated resource
- **WHEN** the changed attachment's existing immutable mapping owns the occupied filename
- **THEN** the update SHALL target that attachment ID rather than mistake its own filename for a foreign collision; unmapped occupied names SHALL remain protected

#### Scenario: A verified attachment is unchanged in preview
- **WHEN** a preview renders an already mapped verified resource
- **THEN** its known destination reference SHALL be retained instead of manufacturing a different dry-run URL and a false body change

#### Scenario: Subtree recovery succeeds
- **WHEN** all selected additions and repairs verify but other baseline problems remain
- **THEN** the subtree result SHALL be complete while the aggregate result retains the remaining problems and prior reports remain unchanged
