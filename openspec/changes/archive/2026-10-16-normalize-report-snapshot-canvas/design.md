# Design

## Context

See `proposal.md` for motivation. The same embedded Inter files load on macOS and Linux, but Chrome rounds accumulated CSS layout by a few physical pixels differently. Playwright compares full-page image dimensions before pixel tolerance, so an otherwise acceptable cross-platform render fails.

## Goals / Non-Goals

**Goals:**

- Keep every report section visible in each visual baseline.
- Make baseline dimensions independent of small content-height rounding differences.
- Preserve the current pixel-difference threshold and functional browser coverage.

**Non-Goals:**

- Hide or mask report regions, accept arbitrary layout drift, or create OS-specific golden files.
- Change production CSS, report data, or package output.

## Decisions

### Add a scenario-specific minimum canvas before capture

Each visual scenario declares a canvas height greater than the measured complete content height on both macOS and Linux. After navigation and theme selection, the test adds a temporary `min-height` to the document roots and retains `fullPage: true`. Desktop uses 2400 px and mobile uses 2960 px, leaving small intentional trailing background while preserving every report section.

Using viewport-only screenshots was rejected because it would omit most of the hierarchy and outputs. Platform-specific goldens were rejected because they duplicate review artifacts and can normalize real differences. Raising `maxDiffPixelRatio` was rejected because it weakens the visual gate.

### Keep production layout untouched

The stabilization style exists only in the Playwright scenario. The generated report retains natural height for operators. Baselines are regenerated and visually inspected after the change.

## Risks / Trade-offs

- **[Fixture grows beyond the canvas]** → Full-page capture still expands beyond the minimum and fails dimensions, exposing the need to review a genuine content/layout change.
- **[Trailing background adds snapshot bytes]** → The small fixed padding is compressible and keeps one portable baseline set.

## Migration Plan

Update the browser scenario and four baseline PNGs, run the full local gate, then validate the same commit in Linux CI. Rollback affects only the test harness and baselines.
