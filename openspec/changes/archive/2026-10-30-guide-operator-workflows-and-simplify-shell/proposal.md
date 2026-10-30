# Proposal

## Why

The local UI exposes controls without enough operational context, mixes configuration and execution navigation, and uses unnecessary layout borders. Operators need a clear starting point, explicit required fields, scope explanations and guidance that separates job lifecycle from migration and object outcomes.

## What Changes

- Move workspace selection into an expandable sidebar, order connections before reports/tasks and synchronization, and rename Decisions to Mentions & hashtags.
- Remove the migration-center caption and decorative header/sidebar/content rules; add an explicit GitHub link opening a new tab.
- Organize forms from required inputs to optional settings and confirmed actions, with accessible field hints and inline scope descriptions.
- Add local workflow/status help and explain current task stages from existing job/progress evidence, without inventing progress or outcomes.
- Keep workspaces, credentials, dry-run/live confirmation, decisions publication and targeted recovery on their existing contracts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-control-center`: guided operator workflows, collapsible workspace navigation and contextual form/status help.

## Impact

Web shell, shared field compositions, migration/configuration/analysis/sync forms, task presentation, browser/unit fixtures, visual baselines and canonical README guidance. No new CLI/config fields, provider mutations, state IDs, status producers, lookup behavior or automatic migration. No dependency additions or destructive actions.
