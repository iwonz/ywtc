# Tasks

## 1. Configuration and mention model

- [x] 1.1 Add failing configuration tests for default-off, template placeholders, HTTP(S) URL templates, aliases, unknown fields, and unsafe input; implement the strict normalized policy until the focused tests pass
- [x] 1.2 Add failing domain/template tests for mention identities, presentation outcomes, escaping, missing values, and deterministic policy fingerprints; implement the provider-neutral mention module until they pass

## 2. Source recognition and rendering

- [x] 2.1 Add failing YFM recognition tests for plain/braced mentions, boundaries, escapes, email, URLs, code, diagrams, Unicode, and megabyte-scale input; implement bounded marker protection and normalized nodes until they pass
- [x] 2.2 Add failing Confluence Storage Format recognition tests for account ID, user key, username, visible label, and adjacent markup; implement structural `ri:user` normalization until they pass
- [x] 2.3 Add failing renderer golden tests for off/template/auto presentations across YFM, Confluence Storage, Markdown, and HTML; implement native and safe fallback output plus semantic verification until they pass

## 3. Provider resolution and orchestration

- [x] 3.1 Add failing Data Center and Cloud client/adapter tests for exact lookup, aliases, ambiguity, hidden data, unsupported lookup, authorization, rate limits, timeout, and 5xx; implement deduplicated rate-limited destination resolution until they pass
- [x] 3.2 Add failing migration tests for mention inventory, auto fallback, complete-with-warning semantics, failed representation, policy-change rerender, dry-run, and Yandex lookup limitations; integrate resolution and verification until they pass
- [x] 3.3 Add failing comment tests proving archived mentions use text/link fallbacks without native markup or notification lookup; integrate comment mention accounting and verification until they pass
- [x] 3.4 Add failing retry tests for transient mention lookup on a complete page and terminal deterministic unresolved identities; implement minimal targeted retry selection until they pass

## 4. State, progress, and reports

- [x] 4.1 Add failing state/report contract tests for optional existing-state compatibility, per-page mention outcomes, reconciled totals, retryability, redaction, and zero suppression; implement current state and report fields until they pass
- [x] 4.2 Add failing progress/terminal tests for mention inventory and resolution counters; wire observable phases and summaries without counting in-flight work as complete
- [x] 4.3 Add failing Mantine model/presentation/browser tests for the conditional mention summary and per-page mention details; implement the offline report UI until unit, accessibility, privacy, and browser checks pass

## 5. Documentation and integration

- [x] 5.1 Update the generated configuration template and README's existing capabilities, configuration, CLI, and reports sections; verify examples and the fixed nine-heading contract against actual code
- [x] 5.2 Extend package validation with hermetic mention configuration and rendering smoke coverage and verify the packed installed CLI contains no private identity or runtime data
- [x] 5.3 Run focused suites, `npm run check`, and strict OpenSpec validation; resolve every failure without weakening gates and mark all implementation tasks complete

## Workflow follow-up

- Archive `configure-mention-transfer` after all tracked tasks pass.
- Run `npm run spec:validate`, verify no active changes, synchronize with `origin/master`, commit `feat(migration): configure mention transfer`, and push `master`.
- Confirm Release Please updates the existing next-minor release PR and verify GitHub, npm/npx, and Homebrew after publication.
