# hashtag-decisions Specification

## Purpose
Provide explicit source-bound hashtag decisions and a private offline catalog editor without provider labels, lookup or destination access during export.

## Requirements

### Requirement: Source-bound hashtag policy
The system SHALL default hashtags to off and accept mapping with a pinned source-bound JSON file containing case-sensitive tags and skip/text/url decisions. Paths SHALL resolve relative to configuration with absolute and home paths supported. Unsafe URLs, unknown fields, duplicate tags and empty explicit text SHALL fail before provider calls.

#### Scenario: Decision semantics
- **WHEN** a source hashtag has a decision
- **THEN** skip or missing entries SHALL preserve it, text SHALL emit literal text without adding a hash, and url SHALL emit a literal HTTP(S) link with the source tag as default label

### Requirement: Safe shared hashtag scanning
Export and migration SHALL recognize hash-prefixed Unicode letters/numbers/marks/underscore/hyphen containing a letter or number at text, whitespace or opening-punctuation boundaries. They SHALL ignore code, diagrams, anchors, URL fragments, escapes, headings, attributes and macro parameters with bounded work.

#### Scenario: Existing hashtag link
- **WHEN** an entire link label is one hashtag
- **THEN** skip SHALL preserve the link, text SHALL replace the link with text, and url SHALL replace its address and label; mixed link labels SHALL remain untouched

#### Scenario: Literal decisions are not rescanned
- **WHEN** navigation and resource references are rewritten
- **THEN** mapping values SHALL be inserted afterwards as escaped literal values and SHALL NOT become new hashtags or mentions

### Requirement: Source-only hashtag catalog
The CLI SHALL expose hashtags export with the same source options and defaults as mentions export, scanning selected real pages and enabled comments including replies and inline contexts. It SHALL create skip entries with occurrences and truthful inventory, without renderer, resource payloads, destination calls or migration state.

#### Scenario: Inventory or configuration is incomplete
- **WHEN** the mapping file is absent or source reads fail
- **THEN** export SHALL NOT depend on that file and SHALL preserve available results with incomplete diagnostics and exit one for incomplete reads; invalid arguments SHALL return two and signals 130/143

### Requirement: Private offline hashtag editing
The system SHALL atomically publish decisions.json and a self-contained Mantine index.html into absent or empty output with search, skip/text/url filters, contexts, preview, delete/undo, import/download, keyboard, mobile, themes and virtualization. No background network requests SHALL occur.

#### Scenario: Invalid or unsaved edits
- **WHEN** import is invalid, current edits are unsaved or a decision is incomplete
- **THEN** invalid import SHALL retain current data, replacement SHALL request confirmation, and invalid decisions SHALL block download identifying the entry

### Requirement: Hashtag migration lifecycle
All remote and static destinations and comment archives SHALL apply effective hashtag decisions without changing state identity. Only effective decisions of an object SHALL affect fingerprints. Old state/cache/report SHALL remain readable and missing scanner data SHALL be derived from cached source body.

#### Scenario: Resume and verification
- **WHEN** decisions change or destination is read back
- **THEN** normal migrate SHALL update affected objects without fresh, metadata/order-only changes SHALL NOT trigger writes, and read-back SHALL verify resulting text and links under existing outcome rules

### Requirement: Truthful hashtag observability
Terminal, state and reports SHALL record nonzero occurrences, unique tags and preserved/text/linked decisions independently of object verification. Valid decisions SHALL NOT create warnings, degradation or conflict; unverified outcomes SHALL NOT be presented as verified transfers.

#### Scenario: Source and destination differ
- **WHEN** a hashtag representation is lost during writing
- **THEN** the existing verification failure SHALL identify the page or comment archive rather than silently mark it complete
