## ADDED Requirements

### Requirement: Explicit mention policy
The system SHALL apply one strict workspace mention policy with modes `off` and `mapping`, defaulting to `off`, preserving recognized source mentions or applying explicit literal links without destination-user lookup.

#### Scenario: Mention processing is disabled
- **WHEN** the mention policy is absent or selects `off`
- **THEN** ywtc SHALL preserve source mention text or the safe same-provider form and record `preserved` without a warning

#### Scenario: Mapping contains a link
- **WHEN** a source-bound entry selects `url`
- **THEN** every matching page occurrence SHALL receive that escaped literal label and absolute URL with a `linked` outcome, without user lookup or URL probing

#### Scenario: Mapping has no replacement
- **WHEN** the entry is absent or selects `skip`
- **THEN** the source representation SHALL be preserved without an unresolved warning or invented native mention

## MODIFIED Requirements

### Requirement: Provider-neutral mention recognition
The system SHALL use the same bounded source scanner for page normalization, comment processing, and mention-only export while excluding contexts that cannot safely represent a mention.

#### Scenario: Yandex Wiki mention is parsed
- **WHEN** YFM contains an unescaped `@username` or `@{username}` outside code, URLs, email addresses, diagrams, and raw HTML attributes
- **THEN** ywtc SHALL create one mention node containing the original source token and available source identity fields without damaging adjacent text

#### Scenario: Confluence mention is parsed
- **WHEN** Confluence Storage Format contains an `ac:link` with an `ri:user`
- **THEN** ywtc SHALL capture available account ID, user key, username and display text without merging users by display name

#### Scenario: Large content contains mentions
- **WHEN** a source page contains megabyte-scale lines or embedded payloads
- **THEN** recognition SHALL remain bounded and return cooperatively between documents without vendor rendering or unbounded matching across payloads

### Requirement: Mention completeness and observability
The system SHALL verify and count mentions independently from pages, resources, and comments. Current decisions SHALL produce preserved or linked outcomes; historical outcomes SHALL remain readable as data without reactivating removed processing.

#### Scenario: Mention representation is verified
- **WHEN** destination content is read back
- **THEN** each source mention SHALL have exactly one expected preserved representation or safe literal link with its label intact

#### Scenario: Mention representation is missing
- **WHEN** a source mention has no verified destination representation
- **THEN** body verification SHALL reject a complete result and identify the missing information; standalone mention failed remains reserved until it has a producer

#### Scenario: Transfer progress is shown
- **WHEN** mention processing is active
- **THEN** terminal, state, JSON, and HTML SHALL reconcile page/comment occurrences, unique identities, and nonzero outcomes without lookup progress or unresolved-user warnings

## ADDED Requirements

### Requirement: Effective decision fingerprints
Page and comment representations SHALL depend on the effective decisions for their own recognized mentions, without changing state identity or fingerprinting irrelevant document metadata.

#### Scenario: One decision changes
- **WHEN** a mapping entry changes label, URL, or effective skip behavior
- **THEN** affected mapped pages and archives SHALL reconcile on ordinary migrate without fresh mappings or duplicate destination objects

#### Scenario: JSON formatting changes
- **WHEN** only file path, ordering, formatting, occurrence metadata, or unused entries change
- **THEN** unchanged effective representations SHALL remain reusable and SHALL NOT receive unnecessary writes

#### Scenario: Existing history is read
- **WHEN** a current state or report contains recorded template/auto modes or native/text/unresolved outcomes
- **THEN** those historical data values SHALL remain readable without restoring removed configuration modes, lookup operations, or templates

## REMOVED Requirements

### Requirement: Conservative destination-user resolution
**Reason**: Explicit source-bound decisions replace destination-user inference.
**Migration**: No conversion or automatic configuration rewriting is performed.

### Requirement: Configurable mention transfer
**Reason**: Replaced by the explicit off/mapping policy without automatic or template behavior.
**Migration**: No conversion or automatic configuration rewriting is performed.
