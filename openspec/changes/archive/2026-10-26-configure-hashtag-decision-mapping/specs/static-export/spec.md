## ADDED Requirements

### Requirement: Explicit static hashtag presentation
Markdown and HTML exports SHALL apply the same hashtag decisions as remote destinations, preserve literal text and URLs, and record optional nonzero hashtag manifest data independently from object verification. Existing manifests without hashtag data SHALL remain valid.

#### Scenario: Static hashtag content is verified
- **WHEN** page or comment hashtags are exported
- **THEN** literal decisions SHALL survive rendering and verified atomic promotion, including standard angle-delimited Markdown URL destinations

#### Scenario: Managed export predates hashtags
- **WHEN** a matching current managed manifest has no hashtag fields
- **THEN** it SHALL remain safely reusable and new optional data SHALL be derived from cached source without changing export identity
