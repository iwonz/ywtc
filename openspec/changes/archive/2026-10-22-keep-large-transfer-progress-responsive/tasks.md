# Tasks

## 1. Responsive progress runtime

- [x] 1.1 Add a cooperative event-loop scheduler with AbortSignal handling and verify unit tests prove timers run during large CPU batches without false completion.
- [x] 1.2 Extend continuous progress with structured phase counters, active/queued work, rate, and evidence-gated ETA; verify deterministic clock-based unit tests cover snapshots, heartbeat, and redaction.

## 2. Scalable remote transfer phases

- [x] 2.1 Replace graph-wide in-memory bootstrap retention with just-in-time top-down staging and lazy failure recovery; verify migration tests preserve bootstrap safety, ordering, retry, and content outcomes.
- [x] 2.2 Add cooperative checkpoints and structured meters to post-plan rendering, staging, content/resource/comment work, verification, report finalization, and filesystem export; verify a CPU-heavy large fixture emits progress and remains interruptible.

## 3. CLI observability and documentation

- [x] 3.1 Verify Listr2 TTY and non-TTY integration displays the first post-plan phase, periodic heartbeat, confirmed counters, active work, and timing without terminal corruption.
- [x] 3.2 Update the existing README capability description with concise current progress behavior and verify documented claims match the CLI.

## 4. Integration quality

- [x] 4.1 Run `npm run check` and verify security, typecheck, Biome, Knip, unit/integration, browser, package, performance, and strict OpenSpec gates all pass.

## Workflow follow-up

- Archive the change after all tracked tasks pass.
- Run strict OpenSpec validation after archival and confirm no active changes remain.
- Commit, push, and publish the patch release through the supported channels.
