## ADDED Requirements

### Requirement: Decision-based archived hashtags
Comment archives SHALL apply source-bound hashtag skip/text/url decisions to bodies, replies and inline contexts as safe literal presentation. Effective archive decisions SHALL participate in fingerprints and read-back verification without provider labels or new native mentions.

#### Scenario: Only an effective hashtag decision changes
- **WHEN** source discussion is unchanged and a relevant hashtag presentation changes
- **THEN** normal migrate SHALL update or append the mapped archive under the existing provider lifecycle without duplicating unchanged archives or changing state identity

#### Scenario: Decision adds syntax-like text
- **WHEN** replacement text resembles markup, mentions or another hashtag
- **THEN** it SHALL remain escaped literal content rather than triggering a second transformation
