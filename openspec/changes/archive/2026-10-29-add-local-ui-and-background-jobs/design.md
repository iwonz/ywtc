# Design

## Context

The synchronized base is 6485f055ebe634510c786f8d7a95669e24dea611 (5.2.0). Migrator.run is already reusable, but progress is string-oriented, command runners own process signals, and selection is automatic-retry-only. Offline report and decision applications use Mantine and compatible pure models. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:** one shared operation service for CLI and web; durable user-controlled jobs; source-authoritative, preview-bound selective operations; compatible existing workspaces and JSON documents.

**Non-Goals:** remote hosting, accounts, forced process termination, provider deletion, native user lookup, automatic retry after process failure, changing migration state identity or automatically running a real transfer.

## Decisions

### Execution boundary

Use `src/jobs/` for strict job requests, private atomic manifests and NDJSON journals, client/IPC, coordinator and worker entrypoints. Every managed foreground/background command submits the same immutable non-secret request. A detached coordinator holds an exclusive workspace lease, serves authenticated loopback IPC and dispatches one child worker at a time. It exits when idle. Workers invoke application services, never a public shell command. Different workspaces have independent coordinators. Existing state/export leases remain authoritative safety checks for external SDK users.

Job lifecycle is queued/running/stopping/finished/interrupted; outcome and exitCode are separate. A background submission returns after durable publication. Foreground subscribes and waits; SIGINT/SIGTERM request cancellation and retain 130/143 semantics. Coordinator/worker identity includes a nonce as well as PID/host. A failed worker is interrupted, never automatically restarted. Queued cancellation is terminal without provider work. No heartbeat timeout implies automatic failure or killing.

### Progress contract

Add typed snapshots/events to ContinuousProgress and TransferOptions. Events contain phase/measure, active operations, timestamps, object outcomes, diagnostics and run correlation, with bounded/redacted labels. Preserve onStatus as a presentation callback. The job journal assigns monotonically increasing sequence numbers, coalesces transient snapshots, persists final events and supports bounded replay. HTTP SSE uses the same journal, reconnect cursor and snapshot reset; no work is tied to a request lifetime.

### Shared operation services

Extract non-terminal execution from command presentation. Services receive AbortSignal, immutable configuration/policy snapshot and event callbacks, return typed results, and do not install process-wide signal handlers. Queue preparation validates the strict request and source binding before provider access. Store profile identities without secrets, reread credentials at start, and refuse a changed provider/instance. Pin decision documents under private job snapshots. Configuration and mapping writes use revision compare-and-swap and existing semantic YAML merge behavior.

### Selection and preview

Extend the retry planner with explicit pages/resources/comment archives and a one-attempt terminal override. Immutable identity ambiguity remains non-overridable. Keep ordinary retry selection unchanged. Targeted previews bind baseline run/state, selection, effective policies, source representation and current destination evidence. Live execution rechecks the binding before mutations; stale evidence requires a new preview rather than conflict. Read-only ancestors and required body rerenders are explicit in the plan. Aggregate reports carry forward unaffected objects.

Decisions application is a separate operation using current source, selected mappings and identity-preserving rewrite. It refuses missing IDs or parent repair rather than creating pages. Only affected page/comment fingerprints are selected, including deletion-to-skip. Other decision policies remain pinned. Read-back verification remains the source of complete/partial/failed outcomes; prepared replacements alone prove nothing.

### Decisions and catalogs

Extract a shared source traversal that feeds both scanners in one pass without renderer/resource payload/destination calls. Store analysis, mutable drafts and immutable published documents under `.states/decisions/`. Rescans merge exact identities/tags and preserve prior decisions; absent entries remain with old context until explicitly deleted. Keep public mention/hashtag JSON shapes unchanged. Explicit activation updates the workspace policy to a published version. Maintain a rebuildable catalog under `.states/ui/`; canonical state/report data is never edited through the inspector.

### Web application

Use `web/` with Next.js 16.4.3 App Router Node runtime and standard standalone output, no custom server. Build into `dist/web`, include static/public assets and local fonts, and disable telemetry. `ywtc ui` lazily starts only the packaged server at 127.0.0.1:3000 (or selected port). Next/React runtime dependencies are installed by npm beside the CLI; do not embed a nested node_modules tree that npm packing silently excludes. The standard standalone server resolves them from the package root. Route handlers load the compiled Node service through a server-only bridge rather than bundling provider clients into Next. Next is not imported by ordinary CLI commands. Shared pure report/editor models stay usable in Vite offline bundles; server-only services and secrets never enter client imports.

Navigation: migrations/reports with state detail and run history; jobs with queue/progress/logs; decisions with combined scans, draft/revision editing and apply preview; connections/settings with workspace registration, profile probes, defaults and policies. Forms reuse strict CLI/config validation. Use Mantine, flat nonzero presentation, localized controls, system/light/dark, virtualized lists and keyboard interactions. Paginate large catalogs and details rather than return all source bodies.

### Security boundary

Bootstrap a browser through a one-use URL-fragment secret, exchange it for an HttpOnly SameSite session, and validate exact Host/Origin. Deny CORS, unsafe URLs and unregistered paths. Use realpath-aware containment for workspaces/exports; sandbox previews and never serve an untrusted standalone report with the application origin. Existing credentials are write-only API fields and never returned. All manifests, snapshots, logs and revisions are private. Persist no credentials outside the ignored configuration. UI assets are local; only user-requested provider operations make external calls.

## Risks / Trade-offs

- New process orchestration can hide failures: independent heartbeat, explicit interrupted state, nonce/lease checks and real subprocess fixtures make the lifecycle observable.
- Source/destination can change after preview: verify content/version binding before writes and require a fresh preview on drift.
- Bundled standalone output can leak build paths or be platform-specific: audit packed contents and exercise installed-package startup on Linux and macOS.
- Large reports can overwhelm browser memory: bounded server projections, lazy previews and virtualized client lists.
- Background execution changes control flow: foreground exit/signal regression tests and unchanged automatic retry semantics are mandatory.

## Migration Plan

All runtime fields are additive and optional for old state/reports. Publish one minor after the full gate; no workspace conversion or automatic migration is performed. Removing the UI installation does not delete existing workspaces or provider data. Pending/interrupted tasks require a compatible runtime and explicit operator continuation after a crash.
