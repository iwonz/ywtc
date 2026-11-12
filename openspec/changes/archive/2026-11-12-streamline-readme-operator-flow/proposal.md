# Proposal

## Why

`README.md` has grown to more than 8,000 words and mixes the shortest operator path with reference details and descriptive UI narration. A new user must read too much unrelated material before choosing an applicable migration scenario, while future edits have no objective guard against the document growing back.

## What Changes

- Reorganize the existing nine README sections as progressive operator guidance: first run, scenario choice, required configuration, command reference, recovery, outcomes, and contributor workflow.
- Replace repeated explanations and decorative UI narration with compact decision tables, checklists, and links to one canonical explanation.
- Preserve every unique operator contract, including personal-space commands, configuration and CLI fields, safety boundaries, retry and sync semantics, exhaustive status assignment conditions, release rules, and supported-version guidance.
- Extend the README contract with a measurable size limit and checks for the scenario-oriented entry point so later documentation changes cannot silently restore the current sprawl.
- Keep runtime behavior, public commands, defaults, configuration, statuses, and release mechanics unchanged.
- Do not delete or rewrite source content, migration data, release history, or archived OpenSpec changes; no destructive-operation boundary changes are in scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: require the operator README to use progressive disclosure, expose common scenarios before reference material, and remain within a validated size budget without losing required contracts.

## Impact

- `README.md`: shorter scenario-oriented operator documentation within the existing nine-section contract.
- `scripts/readme-contract.mjs` and its tests: enforce the compactness and entry-flow invariants.
- `openspec/specs/project-maintenance/spec.md`: record the durable documentation contract after archival.
- No runtime code, external API, dependency, package format, or release-channel behavior changes.
