# Design

## Context

See `proposal.md`. Report rows are keyed by source page, but a staging failure currently updates only the report row while later content handling reconstructs that row from the previously loaded state. For dry-runs, resources on failure paths also retain historical complete states. Issue summaries separately expose degradations while still adding them to the warning counter.

## Goals / Non-Goals

**Goals:**

- Keep the final row for each page tied to the current run's staging/content outcome.
- Make dry-run resource and byte outcomes describe work performed by that dry-run.
- Make issue severity counters mutually understandable across JSON, HTML, catalog, and CLI.

**Non-Goals:**

- Remove validation of previously confirmed destination mappings during dry-run.
- Modify remote destination content or persisted state during dry-run.
- Add compatibility handling for older report bundles.

## Decisions

### Carry staging failures explicitly into content reporting

Remote transfer keeps a run-local map of staging failures. When a destination page is unavailable, content reporting uses the mapped current outcome rather than reading the previous page status from state. The state store remains useful for destination identity and retry context but is not the authority for the current report outcome.

Alternative: persist blocked status into the in-memory dry-run state. Rejected because report correctness should not depend on a simulated state mutation and a page without prior state still needs an outcome.

### Override all dry-run resource outcomes

Every report row produced by a remote dry-run passes the planned resource override, including staging and content failure branches. Source sizes remain measurable, while transferred bytes stay zero.

Alternative: show historical resource completion. Rejected because that answers a state-history question rather than what the current dry-run transferred.

### Keep issue categories disjoint

`warnings` counts only warning-severity issues; `degradations` and `normalizations` retain their own counters. Terminal and catalog output print each category independently. Successful status selection still considers warnings and degradations as attention items.

Alternative: keep degradations inside warnings and label the value as combined. Rejected because it duplicates the visible degradation count and prevents exact severity reconciliation.

## Risks / Trade-offs

- [A dry-run no longer summarizes historical completed resources] → Historical mappings remain visible in state; the run report intentionally describes current-run work.
- [Existing local reports fail the stricter catalog shape] → Current strict report handling already skips incompatible bundles without changing them.
- [A dry-run can report blocked descendants after a missing mapped parent] → Preserve this accurate dependency outcome and provide the parent failure reason.

## Migration Plan

1. Add current staging-outcome propagation and dry-run resource overrides.
2. Separate warning/degradation counters and update all report views.
3. Add focused regression coverage and repeat the real read-only dry-run.
4. Archive the change after the complete quality gate succeeds.
