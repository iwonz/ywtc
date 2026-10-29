# Tasks

## 1. Shared components and build

- [x] 1.1 Install shared shadcn/Radix primitives, theme tokens and Tailwind build support; verify production builds, typecheck and component accessibility fixtures.
- [x] 1.2 Remove Mantine packages/providers/hooks and register shared sources in checks; verify dependency/source hygiene tests and ordinary CLI startup.
- [x] 1.3 Remove the legacy CSS chain blocking the production audit through a maintained CommonJS-compatible parser; verify golden parse/stringify output, large malformed-percent input, renderer regressions, actual installed-package dependency resolution and the unchanged security gate.

## 2. Interface migration

- [x] 2.1 Migrate the complete control center including jobs, reports, decisions, connections, migration forms and sync review; verify authenticated browser workflows, theme persistence, keyboard dialogs and revision safety.
- [x] 2.2 Migrate autonomous reports preserving flat summaries, trees, details, tooltips, comparisons and virtualization; verify offline browser tests, RU/EN, both themes, mobile and refreshed visual snapshots.
- [x] 2.3 Migrate both autonomous decisions editors; verify import/edit/delete/undo/save, filters, large lists, keyboard, invalid data and absence of network requests.
- [x] 2.4 Update canonical README terminology within nine sections; verify readme contract and current specification consistency.

## 3. Integration

- [x] 3.1 Run npm run check including installed-package UI smoke and all browser/security checks; inspect responsive screenshots and fix failures without relaxing checks.
- [x] 3.2 Validate the complete change strictly and confirm every tracked task is verified.

## Workflow follow-up

- Archive and synchronize specifications, repeat strict validation and confirm no active change remains.
- Fetch/compare the recorded master base before commit and push; validate proposed and actual Conventional Commit messages.
- Publish the presentation fix through Release Please and verify GitHub, npm/npx and Homebrew without real provider operations.
