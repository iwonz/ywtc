# Tasks

## 1. Reconciled report data

- [x] 1.1 Add source inventory, exact page/resource status maps, transferred/source byte semantics, inventory completeness, timing, and accounting invariants to the report model; verify focused report tests cover mixed and incomplete outcomes.
- [x] 1.2 Enrich deduplicated issues with readable page/resource context at report finalization; verify JSON contains actionable context without page bodies, secrets, or duplicate counts.

## 2. Migration lifecycle integration

- [x] 2.1 Register discovered pages before inventory and update their metrics/status throughout remote and filesystem transfers; verify early inventory failure, dry-run, complete, partial, failed, blocked, and conflict paths remain exhaustively accounted.
- [x] 2.2 Record per-resource source and destination outcomes using actual/cache sizes and exact states; verify failed or merely downloaded resources do not increase transferred-byte totals.
- [x] 2.3 Add source content and traversal breakdowns with explicit scope semantics; verify page/subtree reports explain absent traversal edges while linked reports retain edge statuses and reasons.

## 3. Operator-facing report

- [x] 3.1 Rework the self-contained HTML around run context, source inventory, reconciled outcomes, needs-attention issues, page hierarchy/resource details, previews, traversal, state, outputs, and JSON download; verify semantic unit assertions cover all sections and issue navigation.
- [x] 3.2 Extend report catalog and terminal listing with reconciled page/resource outcomes; verify catalog tests match HTML/JSON counts and malformed current reports are still rejected safely.
- [x] 3.3 Add desktop/mobile Playwright coverage for mixed outcomes, readable problem context, local navigation, JSON download, and overflow; verify `npm run test:browser` passes.
- [x] 3.4 Update only the existing README `Отчёты` section with concise source-inventory and outcome semantics; verify the fixed 13-section structure remains unchanged.

## 4. Integration verification

- [x] 4.1 Generate a report fixture representative of the analyzed run and verify source totals, page/resource status sums, issue reasons, and HTML/JSON/catalog agreement programmatically.
- [x] 4.2 Run `npm run check` and strict OpenSpec validation, fixing failures without weakening quality gates.

## Workflow follow-up

- Archive the change after all tracked tasks pass.
- Run strict specification validation after archival.
- Fetch and compare `origin/master`, then commit and push the completed patch without force.
