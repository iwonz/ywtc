## Context

The migrator currently writes one JSON file and one Markdown file directly under `.wiki-migration/reports/`. The data is useful for automation but does not expose hierarchy or make source/destination fidelity easy to inspect. Reports are runtime artifacts and may contain page names, URLs, errors, and rendered content, so they must remain outside source control and package publication.

This change also prepares the repository for public development. OpenSpec 1.5.0 is already pinned and the migration specification exists, but future agents do not yet have a repository-level rule requiring the complete lifecycle. ESLint is present, while dead files, unused dependencies, and unused exports are not checked.

## Goals / Non-Goals

**Goals:**

- Produce `.wiki-migration/reports/<run-id>/index.html` and `report.json` for every completed dry-run or live run.
- Make the HTML self-contained, responsive, searchable, and readable directly from disk without a server or external assets.
- Present run summaries, page hierarchy, per-page metrics/status, failures/degradations, source and destination links, and side-by-side render previews.
- Keep raw preview markup out of the downloadable JSON so the metadata export remains compact and does not duplicate page bodies.
- Use Confluence `body.view` as the live destination preview when the API returns it; use a local Storage Format renderer for dry-run and fallback previews.
- Establish OpenSpec, Biome, Knip, tests, typecheck, build, and release hygiene as repeatable project gates.
- Keep retry, resume, title-conflict, and degradation behavior unchanged and visible in the report.

**Non-Goals:**

- Authenticated browser screenshots or pixel-perfect replay of either product UI.
- Uploading, serving, or sharing reports automatically.
- Storing credentials, authorization headers, or tokens in report metadata.
- Deleting destination pages or attachments during migration or rollback.

## Decisions

### One directory per run

`MigrationReport.write()` creates `reports/<run-id>/` atomically enough for append-free final output and returns `{directory, html, json}`. Keeping a stable `index.html` inside each run makes the report easy to open and archive with its metadata. The ignored `.wiki-migration/` root remains the only default output location.

Alternative considered: timestamped sibling `.html`/`.json` files. Rejected because it does not provide a natural bundle for future per-run assets and is harder to move as one unit.

### Self-contained HTML with inert embedded previews

CSS and behavior are embedded in `index.html`; the only link to another file is the downloadable `report.json`. Page previews use sandboxed `iframe[srcdoc]` documents and escaped attributes. No report JavaScript evaluates migration content, no remote script is loaded, and page bodies cannot navigate the report.

Alternative considered: a React/static-site report application. Rejected because it adds a build/runtime dependency and complicates opening reports locally.

### Metadata and preview separation

Serializable `ReportPage` records contain hierarchy, status, links, byte/count metrics, warnings, and errors. Source/destination preview HTML is held only in an in-memory snapshot map used while rendering `index.html`; it is intentionally omitted from `report.json`.

### Best-available destination rendering

Confluence reads expand `body.view` in addition to `body.storage`. A successful live migration uses that rendered view in the comparator. Dry-runs and incomplete verification use a conservative local renderer that translates common Storage Format macros, tasks, page links, attachment references, and images into readable HTML. The source side is rendered from YFM with the same safe parser pipeline used by conversion.

### Project quality gates

Biome replaces ESLint for fast TypeScript/JavaScript/JSON linting and honors `.gitignore`. Knip uses explicit source/test/script entry points and checks unused files, dependencies, and exports. `npm run check` composes release hygiene, typecheck, lint, Knip, tests, build, and strict OpenSpec validation.

### OpenSpec lifecycle policy

Root `AGENTS.md` requires every change to create proposal, specs, design, and tasks; validate before implementation; complete task checkboxes; run project checks; sync delta specs; archive the change; and validate again. Runtime data and secrets are forbidden in artifacts.

## Risks / Trade-offs

- **[Rendered preview differs from product chrome]** → Label views as content previews and link to the actual source/destination pages when available.
- **[Large page bodies make HTML reports large]** → Keep one HTML file per run, omit bodies from JSON, lazy-load iframe `srcdoc` only when a page comparison is expanded, and avoid base64 attachment content.
- **[Malicious or malformed migrated HTML affects the report]** → Escape every interpolation, sanitize preview HTML, use sandboxed iframes without script privileges, and never inject preview markup into the report document itself.
- **[Confluence `body.view` is unavailable on some Data Center versions/configurations]** → Fall back to the local Storage Format renderer and mark the preview provenance.
- **[Knip reports intentionally public library exports]** → Treat package exports as entry points and add narrowly documented ignores only when a real public surface cannot be inferred.
- **[Stricter tooling surfaces existing issues]** → Fix findings in scope instead of weakening rules globally.

## Migration Plan

1. Add report types/renderers and migrate consumers/tests to directory/HTML/JSON paths.
2. Expand Confluence verification reads and feed best-available previews into the report.
3. Add agent policy and project tooling, then resolve all Biome and Knip findings.
4. Generate and inspect the README illustration; rewrite concise public documentation and package metadata.
5. Run the complete check suite and a report-focused test fixture.
6. Sync delta specifications into the main specs and archive this OpenSpec change.

Rollback is source-only: revert the report API and tooling changes. Existing runtime reports and destination content are never removed automatically.

## Open Questions

None. A later change can add optional authenticated browser screenshots if a reliable, credential-safe capture workflow is required.
