# Proposal

## Why

The embedded report font reduced Linux/macOS rendering drift to two pixels on desktop and four on mobile, but Playwright rejects full-page snapshots with different image dimensions before applying the strict pixel-difference threshold. The visual gate needs a deterministic canvas while retaining complete-page coverage.

## What Changes

- Give each desktop/mobile visual scenario a fixed minimum snapshot canvas larger than the complete fixture content on both platforms.
- Keep full-page capture, all four theme/viewport combinations, and the existing strict pixel-difference threshold.
- Regenerate baselines only for the intentional trailing canvas area.
- Do not change report runtime code, user-visible layout, migration behavior, or release contracts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The existing deterministic offline report typography and cross-platform visual quality requirements already define the required behavior; this is a test-harness correction.

## Impact

- Affects only the Playwright report visual scenarios and their four baseline images.
- No production dependency, package content, report data, or source/destination system is changed.
