# static-export Delta

## ADDED Requirements

### Requirement: Static mention presentation
Markdown and HTML exports SHALL preserve recognized mentions as escaped text or safe relative-independent HTTP(S) profile links and SHALL account for them without claiming native user resolution.

#### Scenario: Template mode exports a link
- **WHEN** `urlTemplate` produces a valid absolute HTTP(S) URL for a mention
- **THEN** Markdown and HTML SHALL render the configured display text as a link and record a `linked` outcome

#### Scenario: Auto mode targets a static format
- **WHEN** `auto` is configured and destination is Markdown or HTML
- **THEN** ywtc SHALL use the configured fallback as a complete adaptation without a native-resolution warning

#### Scenario: Static mention output is unsafe
- **WHEN** a rendered URL has a non-HTTP(S) scheme or cannot be constructed from available fields
- **THEN** ywtc SHALL omit the link, preserve the source token as escaped text, and record the exact unresolved reason
