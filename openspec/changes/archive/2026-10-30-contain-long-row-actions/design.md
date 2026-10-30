# Design

## Context

See proposal.md. Shared text action labels already wrap internally, but the base button retains nonshrinking flex behavior. Row text can also contain long unbroken provider names or identifiers. This follow-up tests sibling contention rather than only standalone button width.

## Goals / Non-Goals

Contain long data labels without changing operation behavior, confirmations, provider writes, retry/resume, identities, object outcomes, quality notices, retryability, run results or exit codes. No new assets, dependencies or real migrations.

## Decisions

- Reproduce the problem through mocked long report titles and connection names before changing styles; keep ordinary visual baselines at the existing threshold.
- Allow only text action compositions to shrink in flex rows. Keep icon wrappers and icon-only controls stable, and inherit safe word wrapping for plain row data. Avoid clipping, truncating or hiding meaningful labels.
- Let sibling groups wrap to another line when a long data label consumes the row, so flexible metadata does not collapse to an unreadable zero-width strip.
- Extend the canonical shared UI composition guidance and run full package/browser checks to cover all consumers.

## Risks / Trade-offs

- Shrinking can alter normal row geometry: verify ordinary snapshots unchanged and inspect long-row controls in desktop/mobile RU/EN fixtures.
- Extremely long labels increase row height: intentional wrapping preserves the complete label and accessible action rather than overflowing the interface.
