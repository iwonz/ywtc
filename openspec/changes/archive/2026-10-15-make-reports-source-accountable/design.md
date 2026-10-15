# Design

## Context

See `proposal.md`. The current report derives most totals from page rows added late in transfer processing. Consequently an inventory failure can leave discovered pages absent, regex-based status grouping can treat non-terminal states as complete, resource counts have no status ledger, and issues expose canonical IDs without readable object context. Reports are intentionally local, unversioned, secret-free bundles and must remain usable through `file://` without an external runtime.

## Goals / Non-Goals

**Goals:**

- Preserve a source inventory independently from destination outcomes.
- Make page/resource accounting exhaustive and mechanically checkable.
- Put actionable problems before detailed previews and connect them to affected objects.
- Keep HTML self-contained, responsive, accessible, and consistent with JSON and catalog output.
- Preserve report generation for failed, cancelled, interrupted, dry-run, remote, and filesystem runs.

**Non-Goals:**

- Counting an entire wiki or Confluence instance outside the selected accessible scope.
- Embedding full source/destination bodies in `report.json`.
- Adding remote telemetry, report hosting, destination mutations, or schema-version compatibility branches.
- Treating graph traversal edges as an exhaustive list of all content hyperlinks for page/subtree scope.

## Decisions

### Maintain a source ledger and outcome ledger in one report model

The report registers every discovered page before inventory and updates the same keyed row through planned and terminal states. Each row carries per-resource records with source kind/size, destination identity/name, exact state, transferred bytes, and error. The summary is recomputed from rows at finish time, not incrementally maintained by independent counters.

Alternative: preserve aggregate-only totals. Rejected because aggregates cannot explain mismatches or identify unprocessed objects after early failure.

### Use exact status buckets and accounting invariants

Page statuses use the existing state union verbatim. Resource statuses use their existing state union. `complete` means exactly `complete`; planned/created states are never aliases for success. Summary fields retain concise headline totals but add full status maps, accounted/unprocessed counts, source bytes, transferred bytes, and inventory completeness. Tests assert that every source object belongs to one bucket and totals reconcile.

Alternative: continue regex classification. Rejected because adding a new status could silently change success accounting.

### Separate source measurements from transfer measurements

Source bytes prefer a verified cached size and otherwise use provider metadata; transferred bytes include only complete resources. Unknown source sizes are counted separately. Grids are source content constructs and remain separate from transferable attachments/images. Link/image/table/code counts describe inspected source content; link traversal statuses describe only graph discovery and are labelled accordingly.

Alternative: use one `bytes` value for both meanings. Rejected because a downloaded-but-failed upload would look successfully transferred.

### Resolve issue context at report finalization

The issue collector remains the single deduplicated source. At finalization, report rows provide page titles and resource names for optional issue context without changing retry/deduplication keys. HTML groups issues by operational severity, places actionable items before the tree, and links each contextual issue to a stable page anchor. Safe normalizations remain visible but outside needs-attention totals.

Alternative: duplicate issue messages into page arrays as the primary source. Rejected because counts and reasons would drift between views.

### Render a progressive, script-free HTML report

The top of the page contains run context, duration, source inventory, reconciled outcomes, and needs-attention items. Native `details`, tables, badges, and CSS provide page/resource inspection and responsive layout under `file://`. The link section explains scope limitations when traversal edges are absent. No client-side framework or network resource is added.

Alternative: add an interactive JavaScript dashboard. Rejected because the required questions are answered by a smaller self-contained document and script-free output is easier to audit and test.

### Validate presentation with semantic browser assertions

Vitest covers report calculations and JSON/catalog agreement. A Playwright fixture generates a mixed-outcome report and checks headings, status/accounting values, issue-to-page navigation, downloadable JSON, desktop layout, and absence of mobile overflow. Tests inspect semantics rather than pixel snapshots.

## Risks / Trade-offs

- [Report JSON and HTML become larger because resources are recorded individually] → Keep page bodies only in sandboxed HTML previews and omit them from JSON; resource metadata is bounded and operationally necessary.
- [A run can stop before resource inventory is known] → Mark affected page inventory incomplete and count unknown objects explicitly rather than guessing.
- [Content link metrics and traversal edges have different meanings] → Label both clearly and never infer successful link transfer solely from edge counts.
- [Older local report bundles lack new fields] → The CLI supports only the current strict report structure; existing files remain untouched and are skipped by catalog validation rather than rewritten.
- [A report problem may lack object context during global preflight] → Retain phase and reason and label it run-level instead of inventing an affected page.

## Migration Plan

1. Introduce the reconciled report model and exact summary calculation.
2. Register discovered pages and inventory/resource details before destination processing.
3. Update HTML/catalog/terminal rendering and README wording.
4. Add unit, integration, and browser coverage, then run the full quality gate.
5. Archive the OpenSpec change and release as a patch. Rollback is a normal code rollback; generated reports and destination content are never modified.
