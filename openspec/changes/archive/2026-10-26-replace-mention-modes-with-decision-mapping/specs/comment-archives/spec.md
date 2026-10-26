## ADDED Requirements

### Requirement: Decision-based archived mentions
The system SHALL preserve archived comment mentions as escaped source text or explicitly mapped literal links and MUST NOT emit provider-native mention markup or look up users from an archive.

#### Scenario: Mapping selects a comment link
- **WHEN** a recognized comment or inline-context mention has a URL decision
- **THEN** the archive SHALL contain the same literal URL and safe label used by page mentions without native notification markup

#### Scenario: No comment replacement exists
- **WHEN** processing is off, the entry is absent, or its decision is skip
- **THEN** the archive SHALL preserve the readable source representation without an unresolved warning

#### Scenario: Archived comments are verified
- **WHEN** an archive or filesystem section is read back
- **THEN** all body and inline-context mentions SHALL have verified safe representations counted separately from page mentions

#### Scenario: Only a relevant decision changes
- **WHEN** source discussion is unchanged but one effective comment decision changes
- **THEN** the mapped archive SHALL update or append a revision according to destination capability while retaining old comments and avoiding unchanged duplicate archives

## REMOVED Requirements

### Requirement: Non-notifying archived mentions
**Reason**: Decision-based archives retain the no-notification guarantee without auto/template fallbacks.
**Migration**: Existing archive identity and history remain intact.
