# Spec Delta

## ADDED Requirements

### Requirement: Provider-null Yandex Grid content
The system SHALL accept an explicit null inline body for a valid Yandex Wiki Grid page, distinguish it from a semantically empty ordinary page, and account for the Grid payload without aborting subtree discovery.

#### Scenario: Grid data is available through the resource API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` and exposes its Grid rows and columns through the Grid API
- **THEN** the page SHALL continue through discovery and transfer, the complete Grid SHALL be rendered as the supported static-table adaptation, and null inline content SHALL NOT make the page partial or failed

#### Scenario: Grid data is unavailable through the provider API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` but exposes no recoverable Grid payload
- **THEN** the destination SHALL receive a readable explanation and absolute link to the source page, only that page SHALL be partial with a provider-content degradation, and the remaining selected tree SHALL continue

#### Scenario: Ordinary page has no inline content field
- **WHEN** a non-Grid page response omits or invalidates content required to represent that page
- **THEN** the response SHALL remain an invalid provider contract and SHALL NOT be silently classified as an empty page

#### Scenario: Ordinary page is semantically empty
- **WHEN** a valid ordinary page has an explicit string body that contains no meaningful content
- **THEN** existing semantic-empty handling SHALL apply and the page MAY remain complete without a fallback

### Requirement: Truthful incomplete discovery evidence
When selected page details cannot be hydrated, the system SHALL stop before destination mutation while preserving the known source inventory and one structured diagnostic outcome for every affected page.

#### Scenario: Some selected detail requests fail
- **WHEN** hierarchy enumeration returns selected page identities but one or more genuine detail requests fail
- **THEN** the report SHALL retain the root and every selected identity, returned and selected counts SHALL reflect the enumeration, failed identities SHALL be failed, and successfully hydrated identities SHALL be not-started

#### Scenario: Discovery failure diagnostics are emitted
- **WHEN** more than one selected detail request fails
- **THEN** the report SHALL contain deduplicated per-page issues with stable codes, object identity, redacted reason, and accurate retryability while the terminal error SHALL summarize the count without concatenating every failure

#### Scenario: Discovery barrier protects destination
- **WHEN** selected page identity, hierarchy, or required ordinary content remains unresolved after bounded provider retries
- **THEN** no destination page, resource, comment, or filesystem export SHALL be created or updated

#### Scenario: Comment inventory never started
- **WHEN** migration stops during page discovery before comment inventory
- **THEN** comments SHALL be reported as not-started rather than blocked or successfully empty
