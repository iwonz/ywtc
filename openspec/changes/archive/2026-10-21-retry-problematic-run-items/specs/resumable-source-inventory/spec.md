# Spec Delta

## ADDED Requirements

### Requirement: Targeted retry inventory continuation
A run-correlated retry SHALL reuse compatible verified inventory for carried-forward objects and SHALL refresh current source details only for actionable pages, required dependencies, or incomplete discovery.

#### Scenario: Selected page checkpoint is unchanged
- **WHEN** the source identity and content fingerprint of an actionable page still match a complete checkpoint
- **THEN** ywtc SHALL refresh the current resource and comment inventory while reusing verified binary cache entries whose provider metadata is unchanged

#### Scenario: Selected page changed
- **WHEN** an actionable page has a different current source revision or fingerprint
- **THEN** ywtc SHALL refresh that page's details, resources, normalized content, and required comment inventory before destination mutation

#### Scenario: Unselected successful page changed
- **WHEN** a carried-forward complete page changed after the baseline run and is not required as a recovery dependency
- **THEN** retry SHALL not refresh or transfer its content

#### Scenario: Baseline discovery is incomplete
- **WHEN** retry begins from a run whose source graph was not completely discovered
- **THEN** ywtc SHALL resume and reconcile discovery through the ordinary durable checkpoint barrier before any destination mutation

#### Scenario: Targeted inventory fails
- **WHEN** a required retry inventory operation remains incomplete after bounded recovery
- **THEN** all completed checkpoints SHALL remain reusable, destination mutations SHALL remain zero, and the report SHALL identify the exact remaining object and operation
