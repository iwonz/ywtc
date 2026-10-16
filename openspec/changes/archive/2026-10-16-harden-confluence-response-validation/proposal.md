# Proposal

## Why

Confluence can answer REST routes with a startup/error HTML page or an incomplete JSON object while still returning HTTP 200. The current client trusts compile-time response types, so destination resolution can dereference `page.space.key` and expose a JavaScript `TypeError` instead of identifying provider unavailability; existing tests covered valid REST fixtures and transport failures but not successful HTTP responses with invalid provider payloads.

## What Changes

- Validate required Confluence Data Center and Cloud response structures at runtime while continuing to accept unknown additive fields.
- Recognize HTML startup/error pages and malformed successful responses as typed provider failures with concise, redacted, actionable diagnostics.
- Complete source and destination platform preflight before resolving page locators so a failed health/capability check cannot race a lower-level page parsing error.
- Improve HTTP diagnostics for HTML 5xx responses and network timeout/DNS/TLS failures without printing raw markup or secrets.
- Add client, migration-orchestration, CLI, and installed-package regression checks for startup HTML, missing `space.key`, failed preflight ordering, and absence of raw JavaScript property errors.
- Do not mutate destination content, create state, or generate a misleading migration report when endpoint preflight cannot establish a valid provider contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: Require runtime-validated Confluence response contracts, provider-readiness diagnostics, and a completed preflight barrier before locator discovery.
- `project-maintenance`: Require release/package verification to exercise a built CLI against a successful HTTP response containing a provider startup page, not only help and configuration paths.

## Impact

- Affected runtime: Confluence clients, shared HTTP/provider error classification, migration and doctor preflight orchestration, and CLI diagnostics.
- Affected verification: provider contract tests, migration orchestration tests, connection verification tests, and installed package smoke tests.
- No CLI options, configuration fields, state identity, report schema, destination data, or supported provider versions change.
