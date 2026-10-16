# Design

## Context

See `proposal.md` for motivation. The packaged report is a single-file Mantine/React application generated from an unchanged report model. Its overview, hierarchy rows, and detail definitions currently rely on nested card-like surfaces, and the overview repeats identity and progress information. The README already uses the required section architecture but repeats operating rules. Both header assets already have the correct provider-neutral composition; only the small arrows between central content tiles must change.

## Goals / Non-Goals

**Goals:**

- Make the report read as one flat technical document while preserving the modal, interactions, accessibility, offline behavior, and status emphasis.
- Derive every visible counter from one positive-value presentation filter and preserve explicit text for genuinely unavailable required inventory.
- Keep source and destination navigation safe and place canonical metadata in a deterministic order.
- Keep the README complete while assigning every rule one canonical section.
- Produce minimally edited raster assets with unchanged composition, dimensions, and transparency contract.

**Non-Goals:**

- Changing report JSON, transfer state, migration outcomes, commands, configuration, or report discovery.
- Replacing Mantine, changing report localization semantics, or redesigning the detail-dialog workflow.
- Reinterpreting old generated reports or regenerating runtime reports in user workdirs.

## Decisions

### Use presentation selectors instead of data-model changes

The report model remains unchanged. Small pure selectors will omit numeric zeroes and empty optional groups before React renders them. Required inventory whose absence is meaningful will render a translated empty-state string. This avoids making presentation concerns part of report JSON and keeps terminal/state/report totals identical.

Alternative considered: remove zero values in the report generator. Rejected because it would change the public JSON contract and erase the distinction between an observed zero and unavailable inventory.

### Flatten semantic regions, not interactions

The overview and hierarchy will use semantic `section`, `dl`, and table markup on the page background with spacing and separators. Tree rows will use transparent blocks with a bottom divider; only problem outcomes receive a full-width low-contrast tint. The dialog remains a Mantine modal because focus trapping and modality are functional, not decorative. Definition data and diagnostics inside it become flat rows.

Alternative considered: retain borderless Card/Paper components. Rejected because their surface tokens and DOM semantics obscure the flat-layout invariant and make regressions harder to test.

### Preserve accessible comparison semantics without visible headers

The comparison table will remove its visual header row. Each value cell will include a visually hidden source or destination label, and the table will retain an accessible name. This meets the compact visual requirement without making the column meaning dependent on position for screen-reader users.

Alternative considered: CSS-hide the existing `<thead>`. Rejected because it leaves unnecessary layout structure and makes visual regressions easier.

### Centralize canonical metadata rendering

One ordered metadata definition list will render `RUN ID`, `STATE`, `SOURCE`, and `DESTINATION`. URL activation uses the existing safe-link policy; unsafe or absent locators remain text. The destination result URL is represented only by the `DESTINATION` row, and the JSON download stays adjacent as the single report action.

Alternative considered: keep the expandable outputs area. Rejected because it duplicates destination/report paths and violates the requested information hierarchy.

### Edit each illustration from its own source asset

ImageGen will receive each current asset as its direct reference with an object-level instruction to remove only the small arrows between adjacent central content tiles. The README asset keeps its dark background, while the report asset explicitly keeps transparency. Dimensions, alpha, and visual fidelity will be verified before replacement.

Alternative considered: derive the report illustration from the README asset. Rejected because it risks losing its dedicated transparent composition and theme legibility.

### Treat README sections as canonical owners

The existing thirteen H2 sections remain. Setup appears only in the minimum scenario, config/workdir rules in Configuration, compatibility in its matrix, option semantics in Parameters, resume authority in State, and report UX/statuses in Reports. Tables remain detailed where lookup value is higher than prose; surrounding prose is reduced.

## Risks / Trade-offs

- **[Image generation changes unrelated pixels or text]** → Compare dimensions, alpha, and both rendered images visually; iterate the edit rather than accepting a broad redraw.
- **[Removing visible column headers reduces comprehension]** → Keep stable metric/source/destination column alignment and accessible labels on every cell.
- **[Zero filtering hides evidence of completed discovery]** → Always retain meaningful totals; use a textual empty state for unavailable required inventory rather than suppressing it.
- **[Flat rows reduce visual grouping]** → Preserve hierarchy indentation, separators, status badges, hover/focus treatment, and full-width problem tint.
- **[README reduction removes a required fact]** → Verify every command, alias, provider profile, status, format, runtime requirement, and token flow against code and tests.

## Migration Plan

1. Ship the rebuilt single-file report asset and updated documentation in the patch package.
2. New migration runs use the flat report automatically; existing report bundles remain immutable and usable.
3. Roll back by restoring the previous packaged report bundle and image assets; no runtime data conversion is needed.
