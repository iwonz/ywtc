## MODIFIED Requirements

### Requirement: Verified runtime dependency handoff
Published artifacts SHALL retain security-critical runtime dependency substitutions proved by repository checks. Installed-package verification SHALL inspect actual resolved dependencies rather than assume root-only override policies propagate to consumers.

#### Scenario: A transitive security fix is packaged
- **WHEN** an audited replacement is required for a legacy runtime dependency
- **THEN** isolated installation SHALL resolve the replacement and verify its called API and content behavior before publication

#### Scenario: Audited bundle requires overridden dependencies
- **WHEN** the release artifact carries the audited dependency closure
- **THEN** bundled manifests SHALL describe actual installed versions and aliases with valid consumer edges, preserve dependency code/licenses, and omit root-only override policy from the publication manifest
- **AND** incomplete or escaping package paths and mismatched installed versions SHALL fail packaging without changing source files
