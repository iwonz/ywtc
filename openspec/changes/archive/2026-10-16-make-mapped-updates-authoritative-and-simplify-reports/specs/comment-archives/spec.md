# comment-archives Delta

## MODIFIED Requirements

### Requirement: Resumable archive lifecycle
The system SHALL fingerprint normalized source discussion, persist confirmed comment destination identity and revision, and treat a proven mapped archive as source-authoritative without deleting prior comments or attachments.

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
- **THEN** the system SHALL re-read the latest mapped comment and perform the same bounded latest-version retry policy as mapped pages

#### Scenario: Mapped archive is missing
- **WHEN** a proven mapped destination comment no longer exists
- **THEN** the system SHALL recreate or append the current archive according to destination capabilities without deleting other comments

#### Scenario: User-edited or stale archive
- **WHEN** ywtc cannot prove a unique destination comment identity or previously archived source entries are no longer returned
- **THEN** the system SHALL preserve existing data and mark conflict or stale state as applicable without overwriting or deleting it

