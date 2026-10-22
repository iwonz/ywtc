# Tasks

## 1. Progress lifecycle

- [x] 1.1 Implement a lifecycle-scoped progress tracker with phase, completion, active-operation, heartbeat, sanitization, and unconditional cleanup semantics; verify deterministic unit tests cover timing, counters, bounded labels, and timer disposal.

## 2. Pipeline instrumentation

- [x] 2.1 Instrument discovery caching and source inventory/recovery with phase transitions, exact completions, and active page/resource/comment work; verify migration inventory tests retain exact outcomes.
- [x] 2.2 Instrument remote bootstrap, staging, resource/content/comment work, verification, and report finalization without advancing counters for in-flight operations; verify remote migration tests cover a heartbeat during an unresolved operation.
- [x] 2.3 Instrument Markdown/HTML export preparation and active page/resource work using the same tracker; verify filesystem export tests cover phase and completion reporting.

## 3. CLI delivery and documentation

- [x] 3.1 Configure readable TTY and rate-limited non-TTY heartbeat intervals while preserving existing Listr2 output and signal behavior; verify command tests and timer cleanup.
- [x] 3.2 Document continuous phase, active-object, counter, and timing visibility in the existing README structure and verify the README contract tests pass.

## 4. Integration verification

- [x] 4.1 Run `npm run check` and verify release hygiene, security audit, typecheck, Biome, Knip, unit/browser tests, builds, package smoke checks, and strict OpenSpec validation all pass.

## Workflow follow-up

- Archive `add-continuous-transfer-progress` after all tasks pass.
- Re-run strict specification validation and confirm no active changes remain.
