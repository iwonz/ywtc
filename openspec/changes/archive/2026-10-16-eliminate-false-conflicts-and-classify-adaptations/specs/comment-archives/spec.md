# comment-archives Delta

## ADDED Requirements

### Requirement: Collision-safe archive resources
Comment ZIP, full-text archive, and snapshot attachments SHALL use the same repeated content-verified name reconciliation as ordinary page resources.

#### Scenario: Archive name is occupied
- **WHEN** a destination contains the preferred archive name with different bytes
- **THEN** the existing object SHALL remain unchanged and the archive SHALL use the next deterministic hash-suffixed name

#### Scenario: Archive upload response is ambiguous
- **WHEN** an archive upload response is lost or reports a duplicate name
- **THEN** the system SHALL refresh attachments, reuse only a size-and-hash match, and otherwise retry a deterministic alternate name without reporting ownership conflict

## MODIFIED Requirements

### Requirement: Native archive presentation with safe fallback
The system SHALL create one archive object or section per source page and SHALL treat alternate complete presentation as adaptation rather than incomplete data.

#### Scenario: Native collapsible content
- **WHEN** the destination supports expand, cut, or details content
- **THEN** each top-level thread SHALL be independently collapsible and nested replies SHALL remain visibly hierarchical

#### Scenario: Destination rejects rich archive body
- **WHEN** a native collapsible representation is unsupported or rejected
- **THEN** the system SHALL use a complete nested-quote or escaped-code representation, verify all entries and hierarchy, and record an adaptation without making the page partial

#### Scenario: Oversized comment body
- **WHEN** the full archive exceeds a destination comment limit
- **THEN** the system SHALL preserve and verify the complete Markdown archive as a page attachment, create a compact index comment linking to it, and record an adaptation without partial status

#### Scenario: Archive fallback is incomplete
- **WHEN** an alternate presentation or attached archive omits an entry, participant, hierarchy relation, placeholder, or verified attachment link
- **THEN** comment status and the page SHALL be partial with the missing information identified

### Requirement: Resumable archive lifecycle
The system SHALL fingerprint discussion, persist confirmed destination identity and revision, reconcile deterministic races, and reserve conflict for ambiguous immutable archive identity.

#### Scenario: Unchanged discussion
- **WHEN** the source fingerprint and semantically verified destination archive match
- **THEN** the system SHALL reuse the existing comment and ZIP without issuing an update or creating duplicates

#### Scenario: Changed discussion on update-capable destination
- **WHEN** a proven mapped Confluence archive differs from the current rendered source archive
- **THEN** the system SHALL update the mapped comment as a new version, read it back, verify it, and checkpoint only its confirmed fingerprint and version

#### Scenario: Changed discussion on append-only destination
- **WHEN** a proven mapped archive targets Yandex Wiki or another destination that cannot update comments
- **THEN** the system SHALL append a fingerprinted replacement revision, retain the prior comment, and record the revision relationship

#### Scenario: Archive update races with another revision
- **WHEN** an update-capable destination advances the mapped comment version concurrently
- **THEN** the system SHALL re-read the latest mapped comment and perform the same bounded latest-version retry policy as mapped pages without marking conflict

#### Scenario: Mapped archive is missing
- **WHEN** a proven mapped destination comment no longer exists
- **THEN** the system SHALL recreate or append the current archive according to destination capabilities without deleting other comments

#### Scenario: Duplicate verified archive candidates
- **WHEN** several archive comments carry the same source fingerprint and complete verified payload
- **THEN** the system SHALL choose the deterministic current candidate, preserve the others as stale revisions, and SHALL NOT report conflict

#### Scenario: Archive identity is ambiguous
- **WHEN** immutable mapping and archive evidence cannot distinguish which destination comment belongs to the source page
- **THEN** the system SHALL preserve candidates unchanged, mark comment conflict with evidence, and SHALL NOT overwrite them

#### Scenario: Source archive is stale
- **WHEN** previously archived source entries are no longer returned
- **THEN** the system SHALL preserve the existing archive and mark it stale without treating provider revision or presentation differences as conflict

#### Scenario: User-edited or stale archive
- **WHEN** current evidence cannot prove a unique destination comment identity or previously archived entries are no longer returned
- **THEN** ambiguous identity SHALL become conflict with evidence, missing source entries SHALL become stale, and all existing data SHALL remain unchanged
