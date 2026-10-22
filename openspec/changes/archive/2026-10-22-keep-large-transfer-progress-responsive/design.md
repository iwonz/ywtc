# Design

## Context

See `proposal.md` for motivation. The current heartbeat is a `setInterval` that writes through `task.output`. This is correct for asynchronous provider waits, but it cannot execute while synchronous normalization/rendering monopolizes the main thread. Remote transfer also renders and retains bootstrap bodies for the complete graph before staging the first page, which amplifies CPU time and memory for multi-thousand-page sources.

The observed large run was active, not network-stalled: the process used one core continuously and retained several gigabytes while the terminal remained at the last pre-render message.

## Goals / Non-Goals

**Goals:**

- Keep the event loop, Listr2 repaint, heartbeat, and signal handlers responsive between bounded units of CPU work.
- Make every post-plan phase visible before its expensive work starts.
- Keep completed counters truthful while adding phase rate/ETA and queue/active context.
- Bound bootstrap-render retention independently of source-tree size.
- Preserve exact state, retry, hierarchy, content, and mutation semantics.

**Non-Goals:**

- Parallelizing CPU rendering across worker threads in this patch.
- Estimating provider completion time before confirmed samples exist.
- Changing API concurrency/rate limits or relaxing the inventory barrier.

## Decisions

### 1. Cooperative event-loop scheduler for batch boundaries

Introduce a small scheduler that records the last event-loop yield and uses `setImmediate` once a configurable CPU time slice has elapsed. Long page loops call it before expensive work and after each unit. It also checks the transfer `AbortSignal` before and after yielding.

This is preferred to sprinkling unconditional delays: `setImmediate` adds no artificial sleep, time-based checkpoints avoid one event-loop turn per trivial item, and the scheduler is testable with an injected clock/yield function. A worker pool was considered, but structured-cloning the full normalized document/context and duplicating renderer initialization would be a materially larger performance architecture change.

An individual synchronous vendor renderer can still occupy one time slice longer than desired. The CLI therefore publishes the active page before entering it and yields once to guarantee that label is painted. Worker isolation remains a future optimization if profiling finds single documents, rather than batches, pathological.

### 2. Render bootstrap content just in time during top-down staging

Remove the graph-wide in-memory `bootstrapBodies` map. Before each page staging operation, load its cached normalized input, render its source-reference bootstrap, create/reconcile the page, and release the rendered body after the checkpoint.

The content phase retains the latest attempted final body for recovery. If processing fails before a final representation exists, bootstrap is rendered lazily for that one failing page. This preserves failure verification without retaining every body or adding persistent runtime schema.

This is preferred to a new disk bootstrap cache because it avoids cache identity/invalidation rules and orphaned temporary data. It also begins verified top-down destination progress after the first page instead of waiting for every bootstrap render.

### 3. Structured phase meters inside the existing progress service

Extend the progress service with phase-local metrics: name, completed, total, unit, queued, and in-flight. Confirmed completions update a bounded rate sample. ETA appears only after at least two completions and a minimum elapsed sample; otherwise it is omitted. Heartbeats compose these metrics with active labels, total elapsed time, and time since the last confirmed completion.

Existing free-form status events remain supported for compatibility, but hot loops use the structured API so a detail message cannot accidentally erase the active phase. In-flight work never advances completed counts.

### 4. Renderer integration remains single-surface

TTY output continues through Listr2 `task.output`; non-TTY output remains line-oriented. Cooperative yields let the supported output channel repaint instead of adding a competing direct writer that could corrupt terminal control sequences. Tests exercise the callback stream and Listr task-output integration with delayed and CPU-heavy fixtures.

## Risks / Trade-offs

- **[A single pathological page can still block during one synchronous render]** → publish and paint its identity before entering the renderer; retain a future worker-thread option if measured single-page latency exceeds operational bounds.
- **[Additional yields reduce peak throughput]** → yield only after a short elapsed budget; provider I/O remains governed by existing queues and limits.
- **[Just-in-time bootstrap changes the timing of destination writes]** → source inventory remains fully frozen before any write, and staging remains deterministic top-down with the same verified body.
- **[Lazy recovery rendering can itself fail]** → use the existing raw-content fallback and retain the existing failed/partial classification based on actual destination read-back.
- **[ETA fluctuates during heterogeneous work]** → use confirmed phase-local samples, bound formatting, and omit ETA until a minimum sample exists.

## Migration Plan

1. Release as a patch; no state, config, CLI, or report-data migration is needed.
2. Existing running processes keep their installed behavior; stopping and rerunning uses the same checkpoints.
3. Rollback is the prior package version; destination/state compatibility is unchanged.
