# Spec Delta

## ADDED Requirements

### Requirement: Packaged provider-failure regression verification
Package verification SHALL execute the built and isolated installed CLI against deterministic local provider fixtures for invalid successful HTTP responses so source-only tests cannot mask missing runtime validation in the published artifact.

#### Scenario: Installed CLI receives Confluence startup HTML
- **WHEN** the packed CLI runs a non-mutating migration against a local Confluence fixture that returns a startup/error HTML page with HTTP 200
- **THEN** package verification SHALL require a non-zero exit with an actionable provider-unavailable diagnostic
- **AND** it SHALL fail if output contains raw markup, a property-access TypeError, or evidence of destination mutation

#### Scenario: Source test and built artifact differ
- **WHEN** generated JavaScript omits or changes provider response validation covered by source tests
- **THEN** package verification SHALL fail by exercising the installed binary behavior rather than accepting help, version, and initialization checks alone
