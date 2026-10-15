# Proposal

## Why

The README mixes current operating guidance with obsolete migration notes and maintainer-only release setup, and its section structure can drift as features are added. A fixed, concise information architecture keeps the document predictable and prevents repeated or historical material from accumulating.

## What Changes

- Fix the README's second-level sections and their order: Description, Capabilities, Installation, Minimum scenario, Configuration, Directions and compatibility, Token acquisition, Parameters, Common examples, Filesystem export, State, Reports, and Development.
- Remove the v2 migration section and preliminary CLI/state compatibility guidance.
- Consolidate workspace and profile concepts under Configuration.
- Replace the migrate-only option reference with a compact command and option reference covering the whole CLI, with focused subsections only for concepts such as scope and locators.
- Separate state/resume semantics from report output.
- Fold only current contributor and release essentials into Development; remove completed one-time npm bootstrap instructions from README.
- Require future README additions to fit the fixed structure or deliberately update the specification first.

No CLI behavior, state data, workspace files, release automation, remote content, or credentials are changed or deleted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Define the stable README section set, order, concision rules, and current documentation coverage without a v2 migration guide.
- `release-management`: Stop requiring completed one-time npm bootstrap instructions in the public README while retaining the bootstrap capability in release tooling.

## Impact

- `README.md`
- `openspec/specs/project-maintenance/spec.md` after archival
- `openspec/specs/release-management/spec.md` after archival

No runtime dependencies or public commands are affected.
