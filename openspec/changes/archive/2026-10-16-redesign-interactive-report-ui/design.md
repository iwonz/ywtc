# Design

## Context

See `proposal.md` for motivation. The current report writer renders one large HTML string in `src/report.ts`, keeps previews out of `report.json`, and writes both files atomically. Reports must continue to open from `file://`, remain private and self-contained, ship in the npm package, and preserve the existing catalog/opening contract. The source graph may contain ten thousand pages, while report metadata and preview HTML are untrusted inputs.

## Goals / Non-Goals

**Goals:**

- Separate report data collection from a compiled interactive presentation without changing migration outcomes or CLI syntax.
- Reconcile source inventory and destination outcomes from one typed model and expose exact page, resource, comment, exclusion, and causal issue context.
- Keep the UI offline, responsive, bilingual, themeable, accessible, package-safe, and efficient for large hierarchies.

**Non-Goals:**

- Rewrite existing report bundles, introduce a report server, fetch data after page load, or publish report content remotely.
- Change transfer state identity, provider API behavior, retry/resume/conflict rules, or destination content.
- Put complete page/comment bodies or preview HTML into downloadable JSON.

## Decisions

### Compile an offline React shell and inject data at report-write time

Use a dedicated Vite entry with React, Tailwind, shadcn/ui source components, Radix primitives, Lucide icons, and `vite-plugin-singlefile`. The build emits `dist/report-ui/index.html` with inline JavaScript, CSS, and the header image plus exactly one inert JSON marker. `TransferReport.write` reads that sibling asset, replaces the marker with safely serialized private report payload, and performs the existing atomic write.

This keeps runtime reports to one HTML file without shipping a browser server. Building JSX inside the Node TypeScript output or loading CDN assets was rejected because it either couples two runtimes or breaks offline/privacy guarantees.

### Maintain public metadata and private presentation payloads

Move browser-safe report contracts into a provider-neutral shared module. The public `report.json` contains counts, outcomes, locators, redacted diagnostic metadata, and object references. The injected HTML payload additionally contains preview pairs and UI-only derived nodes. It never contains credentials, authorization data, unredacted email, or full raw comment bodies.

Serialization escapes `<`, `>`, `&`, U+2028, and U+2029 before marker replacement. React renders all strings as text, URL helpers allow only `http:`, `https:`, and explicitly generated local `file:` destinations, and preview frames use `sandbox` plus an internal restrictive CSP.

### Model inventory, outcomes, exclusions, and issues explicitly

Preserve current migration status enums and add report presentation nodes for exclusions. A selected page records source parent/ancestors independently from projected and actual destination parents. Resources record kind, aliases or references safe for reporting, URLs when safe, sizes, hash, destination identity, and exclusive outcome. Comment diagnostics use thread/entry IDs and safe author/date labels without raw bodies.

Issues gain stable category, phase, object type/ID, root cause, retryability, and action. Existing callers may omit newly derivable fields; the report normalizer classifies them from stable issue codes and phases. Blocked dependents reference one root issue and never inflate root-error totals.

For excluded pages, discovery preserves hierarchy response metadata. When it is insufficient, bounded cached detail reads enrich title, URL, parent, and ancestors; an unresolved placement becomes an explicit unknown-position node rather than a fabricated relationship.

### Render one virtualized logical tree

Build a flattened visible-node sequence from selected and excluded page nodes. It is initially expanded, preserves ancestor rows for search/filter matches, and uses `@tanstack/react-virtual` to bound DOM work. Expansion state remains independent from filters. Direct-link buttons stop row activation; row, eye button, Enter, and Space open one accessible dialog.

The dialog uses shadcn tabs for Overview, Files, Comments, Comparison, and Issues. Source and destination previews are lazy-mounted only when Comparison is active. On narrow screens the two previews stack and the dialog fills most of the viewport.

### Localize presentation without localizing stored contracts

Keep report JSON statuses and categories stable in English. The UI maps them through a typed RU/EN dictionary. Default locale follows `navigator.languages`; theme defaults to `prefers-color-scheme`. Manual choices use guarded local storage because storage behavior for `file://` differs by browser. Storage failure falls back to the current page session.

### Use a separate transparent report illustration

Create `docs/assets/report-header-transparent.png` from the README header through ImageGen. Remove the background and frames, retain the provider-neutral flow, add comments to the transferable content symbols, and use dual-contrast edges that remain legible in light and dark themes. Vite embeds the image in the single-file shell. The existing README header remains unchanged.

### Build and package both runtimes deterministically

Split build scripts into Node and report-UI steps, with the aggregate `build` producing both outputs. Typecheck the UI with a dedicated JSX configuration. Unit and browser test lifecycle hooks build the report shell before creating report bundles. Package validation asserts that the installed CLI can write an offline report and that the shell marker and transparent asset are present exactly as intended.

README changes remain inside `## Отчёты`; no CLI syntax, state, or report catalog change is introduced. The change releases as a minor feature.

## Risks / Trade-offs

- **[Larger package and report files]** → Tree-shake dependencies, use only required shadcn primitives, lazy-mount previews, and verify packed size.
- **[Single-file CSP needs inline application assets]** → Allow only the compiled inline script/style in the outer document, prohibit application network requests, and isolate preview content in sandboxed frames.
- **[Incomplete provider hierarchy for excluded pages]** → Enrich through bounded cached reads and use an honest unknown-position group when unavailable.
- **[Virtualization can complicate accessibility]** → Preserve logical tree metadata, stable focus targets, explicit expanded state, keyboard tests, and live result counts.
- **[Browser storage is inconsistent for `file://`]** → Guard every storage operation and keep locale/theme usable without persistence.
- **[Report UI build missing at runtime]** → Fail report generation with a clear internal asset error, keep atomic temporary files, and verify the asset in unit/package tests.

## Migration Plan

1. Add and validate the report model and shell build without altering existing CLI/report paths.
2. Replace the legacy renderer after unit and browser parity tests cover current accounting and previews.
3. Package the shell and transparent image, update the existing README Reports section, and run complete project checks.
4. Archive the OpenSpec change and release through the existing Release Please, npm trusted publishing, GitHub, and Homebrew flow.

Rollback is a normal code release reverting the renderer and dependencies; generated historical reports remain standalone and unaffected.
