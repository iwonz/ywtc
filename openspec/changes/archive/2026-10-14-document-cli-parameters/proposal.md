## Why

The README demonstrates common migration commands but does not provide a complete, scannable reference for every CLI option. Operators need to know which arguments are required, their types and accepted formats, and the effective defaults before starting a migration.

## What Changes

- Add a dedicated README section with a table covering every supported CLI option.
- Document each option's type, required status, default or accepted value range, and purpose using the behavior enforced by the CLI parser.
- Keep the existing quick-start examples and link their optional settings to the new reference section.
- Do not change CLI behavior, migration behavior, credentials, or runtime data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Require the public README to provide an accurate tabular CLI option reference.

## Impact

- Documentation: `README.md`.
- Specification: `openspec/specs/project-maintenance/spec.md` after archival.
- No runtime code, API, dependency, or destructive-operation changes.
