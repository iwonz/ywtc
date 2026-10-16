# Tasks

## 1. Component stack

- [x] 1.1 Add current Mantine core/hooks packages and remove Radix, Tailwind, CVA, clsx, and tailwind-merge; verify install, dependency audit, and Knip pass without obsolete report UI imports.
- [x] 1.2 Replace the custom report primitives and root theme wiring with MantineProvider and Mantine components; verify typecheck and report build produce one autonomous HTML file.

## 2. Compact report experience

- [x] 2.1 Rebuild the overview, summary, actions, hierarchy, filters, and virtual rows with Mantine and report-specific CSS; verify required run identity and completeness metrics remain visible on desktop and mobile.
- [x] 2.2 Add typed zero-suppression for optional summary/status metrics and conditional detail categories; verify unit tests cover all-zero, successful, partial, failed, excluded, comment, and resource presentations.
- [x] 2.3 Rebuild page details, resource/comment tables, comparison, diagnostics, tooltips, language/theme controls, and accessible empty states; verify keyboard, focus, localization, and theme persistence behavior in Playwright.

## 3. Offline safety and documentation

- [x] 3.1 Update CSP/offline browser and visual snapshots for the Mantine report; verify `file://` operation, zero application network requests, sandboxed previews, responsive layouts, and four theme/viewport baselines.
- [x] 3.2 Update the existing README Reports section to describe the compact zero-suppressed dashboard without adding a new H2; verify the fixed README heading order remains unchanged.
- [x] 3.3 Run focused report tests, `npm run check`, package smoke verification, strict OpenSpec validation, and release hygiene; verify all gates pass before archival.

## Workflow follow-up

- Archive `replace-report-ui-with-mantine` after every tracked task is complete.
- Run strict validation against synchronized base specifications.
- Re-fetch `origin/master`, commit with Conventional Commits, push, and verify the release workflow.
