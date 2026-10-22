# comment-archives Delta

## ADDED Requirements

### Requirement: Non-notifying archived mentions
The system SHALL preserve mentions found in archived page comments as escaped text or safe profile links and MUST NOT emit provider-native mention markup from an archive.

#### Scenario: Auto mode archives a comment mention
- **WHEN** a source comment contains a recognized mention and the global policy selects `auto`
- **THEN** ywtc SHALL apply the configured fallback presentation, record the occurrence as a comment adaptation, and SHALL NOT create a native mention

#### Scenario: Comment mention lacks template data
- **WHEN** a comment mention cannot populate a configured placeholder
- **THEN** ywtc SHALL preserve the original source token, record an unresolved comment mention, and keep the comment archive verifiable without targeting a user

#### Scenario: Archived comments are verified
- **WHEN** the archive comment or filesystem section is read back
- **THEN** every source comment mention SHALL have one safe textual or linked representation and SHALL be counted separately from page-body mentions
