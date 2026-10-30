# Proposal

## Why

The action audit must also cover very long page/profile labels alongside sibling controls. Existing fixed flex shrink behavior can prevent a wrapped button from yielding space to its row, while unbroken data labels can spill beyond their own bounds.

## What Changes

- Reproduce long data-label geometry in neutral report and connection rows across wide/narrow layouts and both locales.
- Let text actions share available row width and wrap unbroken row text while preserving icon-only controls.
- Preserve existing guidance, illustrated empty states and operation/confirmation behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-control-center`: clarify action containment when long data labels share a row with other controls.

## Impact

Shared action styling, local row layout and browser regression fixtures. No new dependencies, API/config/CLI fields, migration execution, provider mutations, state identities, outcomes or destructive operations.
