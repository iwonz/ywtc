## Why

The README currently presents migration coverage as a dense paragraph and its
"minimal" flow includes optional diagnostics. Operators need a faster way to
understand both the smallest safe workflow and the behavior of common variants.

## What Changes

- Present migration coverage and exclusions as a compact table.
- Replace the minimal scenario command block with an actionable checklist that
  contains only installation-independent steps required for a safe migration.
- Add a separate section of common command examples for diagnostics, one-page
  migration, URL inputs, custom workdirs, and fresh state.
- Avoid duplicating the complete option reference already provided later in the
  README.
- Do not change CLI behavior, configuration, migration data, or release logic.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Require a concise checklist for the minimum migration
  flow, separate common examples, and a tabular migration-coverage summary.

## Impact

Only `README.md` and the corresponding project-maintenance specification are
affected. This documentation-only change performs no destructive operation and
does not alter public interfaces.
