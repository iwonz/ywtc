## Why

The README phrase “Confluence Data Center 7.9+” can be misread as support for one narrow release rather than a minimum authentication requirement. Operators need an explicit compatibility matrix that states which Yandex Wiki API and Confluence product/version families the migrator targets and what has or has not been validated.

## What Changes

- Remove the version qualifier from the short product introduction and move compatibility details into a dedicated README section.
- Document Yandex Wiki as the hosted Public API v1 contract rather than as a product release number.
- Document Confluence Data Center 7.9 through the current documented 10.2.x line as the supported REST/PAT contract, explaining that 7.9 is the minimum because PAT authentication starts there.
- Clearly distinguish Confluence Data Center from unsupported Confluence Cloud and from non-targeted Confluence Server installations.
- State the verification boundary: vendor-documented APIs plus mocked integration coverage, with `--dry-run` recommended against each real instance and future major versions not claimed automatically.
- Do not change authentication, API calls, content conversion, or migration behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Require an explicit, evidence-based platform compatibility matrix in the public README.

## Impact

- Documentation: `README.md`.
- Specification: `openspec/specs/project-maintenance/spec.md` after archival.
- No runtime, API, dependency, credential, state, or destructive-operation changes.
