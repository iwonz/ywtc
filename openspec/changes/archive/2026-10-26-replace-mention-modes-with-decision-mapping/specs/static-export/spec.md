## ADDED Requirements

### Requirement: Explicit static mention presentation
Markdown and HTML exports SHALL preserve source mentions or apply explicit source-bound HTTP(S) link decisions with escaped literal labels, without user resolution or URL probing.

#### Scenario: Mapping exports a link
- **WHEN** an entry selects url
- **THEN** both formats SHALL retain its exact URL and label in page and enabled comment content and record linked

#### Scenario: Mention is skipped
- **WHEN** mode is off, an entry is absent, or its decision is skip
- **THEN** the static output SHALL retain readable source text and record preserved without a warning

#### Scenario: Mapping is unsafe
- **WHEN** a mapping contains an unsafe URL or an invalid decision
- **THEN** validation SHALL stop before source API calls or destination replacement rather than silently changing the requested decision

## REMOVED Requirements

### Requirement: Static mention presentation
**Reason**: Explicit decisions replace automatic and template presentation.
**Migration**: No conversion of existing exports is required or performed.
