# Spec Delta

## ADDED Requirements

### Requirement: Attachment-independent comment archives
A comment archive with no linked comment attachments and no oversized full-text fallback SHALL be created, updated, and verified without listing, reading, uploading, or downloading page attachments.

#### Scenario: Page comments contain no attachment references
- **WHEN** the complete rendered archive fits the destination comment and no comment body links a page attachment
- **THEN** the system SHALL transfer and verify the comment archive without requiring attachment-read or attachment-write permission

#### Scenario: Archive attachment is required
- **WHEN** linked comment files, an oversized full-text fallback, or another archive payload must be attached
- **THEN** the system SHALL invoke resource reconciliation only for the required archive objects and SHALL report attachment-specific failures independently from the comment text
