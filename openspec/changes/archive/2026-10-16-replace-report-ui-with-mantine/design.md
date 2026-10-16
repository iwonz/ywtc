# Design

## Context

See `proposal.md` for motivation. The report is a React application compiled by Vite into one offline HTML asset. It currently uses a local shadcn-style wrapper over Radix UI plus Tailwind utility classes. The generated shell embeds fonts, an illustration, application code, CSS, and per-run preview data; it must continue working through `file://` under CSP with no background network requests.

Mantine 9.7.2 is the current package release and matches the project's React 19 runtime. Its provider, component CSS, theme variables, portal controls, and accessible primitives can all be bundled by the existing single-file Vite build.

## Goals / Non-Goals

**Goals:**

- Replace the report-only component and styling stack with Mantine while preserving the report data contract.
- Reduce visual density by omitting optional zero metrics and empty detail groups.
- Keep problem states and completeness information immediately discoverable.
- Preserve autonomous packaging, security boundaries, virtualization, themes, localization, responsiveness, and accessibility.

**Non-Goals:**

- Changing migration status calculation, report JSON, CLI commands, generated previews, or provider behavior.
- Rebuilding the README illustration or changing the approved README section structure.
- Loading Mantine, fonts, icons, CSS, or other assets from a CDN.

## Decisions

### Use Mantine core and hooks as the only report component system

`MantineProvider` will wrap the report once. Mantine components will replace the local Card, Badge, Button, Dialog, Tabs, Tooltip, Collapse, ScrollArea, Input, Select, Alert, Progress, and Table wrappers. `@mantine/core/styles.css` will be bundled into the single HTML.

Alternative: retain the local wrapper and merely restyle it. Rejected because it preserves duplicate component maintenance and the Radix/Tailwind dependency surface the change is intended to remove.

### Keep explicit application CSS for report-specific composition

Mantine owns primitives, tokens, accessibility, and responsive component behavior. A small ordinary CSS file owns the report grid, hierarchy row states, preview frame, embedded illustration sizing, virtual-row positioning, and print/mobile adjustments. Tailwind utilities will not be translated into another custom utility system.

Alternative: express every layout through Mantine responsive props. Rejected for 10,000-row performance and because repeated responsive inline styles enlarge a single-file report.

### Centralize zero suppression in presentation helpers

Summary metrics will be constructed from typed entries and filtered before rendering. Mandatory identity/progress values are never filtered. Optional counters render only when positive; status groups render only outcomes with positive counts. Detail tabs are derived from actual page capabilities, with Overview always present and other tabs present only when they contain useful content.

Alternative: hide zeros solely with CSS. Rejected because invisible nodes would remain noisy for assistive technology and tests.

### Preserve the existing theme preference contract

The existing `system → light → dark` cycle and storage keys remain stable. The application resolves the effective scheme and supplies it to `MantineProvider`; the icon-only control keeps current/next accessible labels. This avoids duplicating Mantine's default storage behavior while preserving the public interaction contract and safe-storage fallback.

### Keep portals inside the autonomous document

Mantine Modal, Tooltip, and Select portals will render in the same document and require no external root or runtime. Preview markup remains isolated in sandboxed `iframe srcDoc`; Mantine never receives untrusted preview HTML.

## Risks / Trade-offs

- [Mantine increases the compiled shell size] → remove Radix/Tailwind and measure package output; keep only core/hooks and existing icon imports.
- [Portal or focus behavior differs from Radix] → retain role-based Playwright coverage for modal escape, focus, tooltips, Select, and keyboard activation.
- [Visual snapshots change substantially] → update all four baselines only after functional and accessibility assertions pass.
- [Zero suppression could hide an important invariant] → classify metrics as mandatory or optional in typed helpers and assert representative all-zero/problem fixtures.
- [Component styles could violate CSP or offline use] → build the exact single-file artifact and verify zero external requests under `file://`.

## Migration Plan

1. Add Mantine dependencies and remove the report-only shadcn support stack.
2. Replace the provider, component primitives, theme integration, and CSS without changing report contracts.
3. Add zero-suppression and conditional detail-tab helpers with unit and browser coverage.
4. Rebaseline visual snapshots, verify the packed single-file report, and document the compact behavior.
5. Roll back as one commit if offline, accessibility, or package verification regresses; generated historical reports remain unchanged.
