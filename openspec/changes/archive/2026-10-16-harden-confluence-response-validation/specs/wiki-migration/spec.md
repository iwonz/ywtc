# Spec Delta

## ADDED Requirements

### Requirement: Runtime-validated Confluence provider responses
The Confluence Data Center and Cloud clients SHALL validate every response structure before reading required fields, accept unknown additive fields, and convert invalid successful HTTP responses into typed redacted provider diagnostics rather than JavaScript runtime errors.

#### Scenario: Confluence returns a startup page with HTTP 200
- **WHEN** a Confluence REST route returns HTML describing startup, maintenance, or another provider error with a successful HTTP status
- **THEN** preflight SHALL report that Confluence is unavailable or not fully started, include a concise safe provider reason when detectable, and recommend retrying after service recovery
- **AND** output SHALL NOT contain raw HTML, credentials, `Cannot read properties`, or another implementation exception

#### Scenario: Confluence page response lacks required identity
- **WHEN** a page response lacks a non-empty immutable ID, title, or space identity required by the selected deployment
- **THEN** the operation SHALL fail with the provider, operation, and missing response paths plus URL/deployment/health guidance
- **AND** no caller SHALL dereference the missing structure

#### Scenario: Confluence list response is malformed
- **WHEN** a page, space, attachment, descendant, comment, or user-list response lacks the required result collection or required item identity
- **THEN** the operation SHALL fail as an invalid Confluence API response before pagination, mapping, or mutation logic consumes it

#### Scenario: Confluence response adds optional fields
- **WHEN** a valid supported response includes unknown optional fields
- **THEN** validation SHALL preserve compatibility by accepting the response and using only the required normalized fields

#### Scenario: Confluence returns an HTML server error
- **WHEN** a Confluence endpoint returns HTML with `5xx` after bounded retries
- **THEN** the HTTP diagnostic SHALL identify provider/server unavailability and expose a concise text summary rather than raw markup

### Requirement: Preflight barrier before endpoint resolution
Migration and doctor SHALL complete required source and destination platform preflight successfully before resolving either page locator, creating or loading state, generating a run report, or performing destination mutations.

#### Scenario: Destination platform preflight fails
- **WHEN** destination preflight detects startup HTML, invalid provider structure, authentication failure, timeout, DNS failure, TLS failure, rate limiting, or exhausted server errors
- **THEN** source and destination page locator requests SHALL NOT begin
- **AND** the command SHALL exit non-zero with the typed redacted provider diagnosis and without destination mutation

#### Scenario: Both platform preflights succeed
- **WHEN** source and destination platform contracts are established
- **THEN** the command MAY resolve source and destination locators in parallel and continue the ordinary discovery pipeline

#### Scenario: Connection wizard encounters startup HTML
- **WHEN** interactive initialization probes a Confluence profile that returns a startup/error page with HTTP 200
- **THEN** the wizard SHALL classify the failure as provider/server unavailability, preserve the in-memory draft, and offer retry or editing without persisting it
