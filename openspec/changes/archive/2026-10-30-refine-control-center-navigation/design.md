# Design

## Context

See proposal.md. The web shell currently places five text buttons below its header. The application already packages shadcn primitives, Lucide icons, local fonts and light/dark tokens; standalone reports and editors share those primitives but own their layouts.

## Goals / Non-Goals

Improve orientation and visual hierarchy in the local control center. Keep report/editor applications, APIs, configuration, migration selection and stored evidence unchanged. No animation dependency, decorative live counters or new provider activity.

## Decisions

- Retain existing shadcn Buttons, tooltips and dialog flows; use leading Lucide icons with aria-hidden and aria-current for active navigation. A desktop rail gives content more vertical room than the existing horizontal toolbar. On smaller screens it becomes a labeled compact grid rather than an icon-only menu.
- Remove only the underscore from the wordmark, pair it with a restrained transfer glyph, and use a flat divider-based shell. Use existing semantic tokens, modest accent tints, tabular metrics and clearer heading spacing; avoid card shells, neon decoration and fake health indicators.
- Provide one concise localized contextual hint for the selected area without repeating its main heading. Keep the primary migration action immediately accessible and all existing workflow controls unchanged.
- Scope style changes to web layout rather than shared report/editor tokens, keeping offline artifacts stable. Reuse the current font assets and avoid external requests.
- Preserve retry/resume behavior, identity safeguards, object outcomes, quality notices, retryability, run results and exit codes. This presentation change cannot authorize operations, modify state or change provider content.

## Risks / Trade-offs

- Navigation consumes horizontal space on desktop; use a modest fixed rail and minmax content, adapting below the tablet breakpoint.
- Longer RU labels and identifiers can overflow; retain wrapping and test 390px viewports, both themes and keyboard focus.
- Intentional geometry changes require reviewed macOS/Linux visual baselines at the existing strict threshold, not broader pixel tolerances.
