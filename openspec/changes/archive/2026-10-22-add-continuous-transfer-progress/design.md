# Design

## Context

The migrator currently forwards plain status strings to one Listr2 task. Discovery and inventory publish periodic completions, while bootstrap rendering, remote page staging, file transfer, comment archiving, verification, and filesystem export can wait for long asynchronous operations before publishing another string. The exact transfer counters already exist, but no component owns heartbeat timing or active-work state.

## Goals / Non-Goals

**Goals:**

- Keep the terminal visibly alive across every long-running phase.
- Preserve exact outcome counters and distinguish in-flight work from confirmed completion.
- Show useful concurrent work without flooding or leaking unbounded source/provider text.
- Use the same progress source for TTY and line-oriented renderers and always clean up timers.

**Non-Goals:**

- Persisting transient heartbeat events in state or reports.
- Changing retry limits, concurrency, state identity, migration outcomes, or destination writes.
- Estimating completion time from incomparable page/file workloads.

## Decisions

### One lifecycle-scoped progress tracker

The public migrator run creates a tracker and delegates the existing implementation to an internal method inside a `try/finally`. The tracker owns current phase, last confirmed completion, active operation labels, elapsed time, and one unreferenced interval. This centralizes cleanup for success, error, cancellation, and signals. An alternative timer in the CLI would know only the last string and could not distinguish active from complete work.

### Existing callback remains the delivery boundary

The tracker continues to emit strings through `onStatus`. Listr2 therefore keeps its existing renderer behavior, package callers do not need a new event protocol, and non-TTY output remains line-oriented. The CLI chooses a shorter TTY heartbeat and a quieter non-TTY heartbeat. Immediate phase/completion events are not throttled; periodic heartbeats are.

### Explicit phase, completion, and active-operation APIs

Phase changes and active labels do not reset the last-completion clock. Only verified progress calls do. Concurrent inventory and content workers receive tokens whose labels can change from page work to download, upload, comment, or verification. The heartbeat samples a bounded number of sanitized labels and reports the remaining active count. This avoids both misleading percentages and terminal floods.

### Instrument phase boundaries and existing counters

Discovery, cache persistence, inventory/recovery, plan completion, bootstrap rendering, page staging, resource/content/comment processing, filesystem export, verification, and report writing announce phase transitions. Existing page/resource/comment counters remain authoritative. Cache and bootstrap loops add completion callbacks so large local preparation phases are also visible.

### No ETA

The display shows elapsed time and time since the last confirmed completion rather than an ETA. Pages, files, grids, comments, and API calls have highly variable costs, so a derived ETA would be misleading. The heartbeat phrase makes provider waits explicit while retaining the current exact totals.

## Risks / Trade-offs

- **Frequent updates can make CI logs noisy** → use a longer non-TTY interval and bound active samples and labels.
- **Page titles and filenames can break terminal layout** → strip ANSI/control characters, collapse whitespace, and truncate labels.
- **A blocked JavaScript event loop cannot run its own heartbeat** → network waits and normal asynchronous work remain visible; a missing heartbeat becomes a meaningful signal of event-loop/process trouble.
- **Timer leakage can keep tests or the CLI alive** → unref the interval and stop it in the outermost `finally`.

## Migration Plan

Add the tracker and instrumentation without changing the callback contract, then cover timing and cleanup with deterministic timer tests and run the existing migration matrix. Rollback is removal of the tracker wrapper and phase hooks; state and remote content require no migration.
