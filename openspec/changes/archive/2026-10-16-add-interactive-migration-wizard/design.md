# Design

## Context

See `proposal.md` for motivation. Commander currently makes source and destination syntactically mandatory, while command dispatch owns workspace loading, migration construction, signal handling, result rendering, and exit-code decisions in one path. The initialization wizard already provides a prompt adapter over `@clack/prompts`; the migration wizard needs the same testability without coupling its state machine to provider APIs or a real terminal.

## Goals / Non-Goals

**Goals:**

- Build one typed migration request from interactive or non-interactive input and execute it through one runner.
- Keep interactive draft state in memory and preserve answers across explicit backward navigation.
- Make dry-run the default decision and gate live continuation on structured result data rather than text diagnostics.
- Preserve report generation, retry/resume behavior, conflict semantics, state identity, content-degradation classification, and signal codes.

**Non-Goals:**

- Persist migration presets or wizard drafts in `ywtc.config.yaml`.
- Add JSON export, new state fields, provider endpoints, or another report format.
- Change retry, resume, conflict, content rendering, or degradation behavior inside the migrator.
- Replace direct CLI usage for automation.

## Decisions

### Share a general prompt port, keep separate state machines

The current init-specific prompt adapter becomes a provider-neutral wizard port used by both initialization and migration. Initialization and migration retain separate state-machine modules because their steps, persistence boundaries, and cancellation outcomes differ. The Clack adapter remains a thin UI implementation; scripted adapters drive unit tests.

Alternative: call Clack directly from command dispatch. Rejected because it makes back/forward behavior, cancellation, and dry-run continuation difficult to test without a terminal.

### Separate command preparation from execution

Commander parsing returns a migrate command whose source and destination are optional only while `interactive` is true. A reusable migration runner accepts a fully resolved request and returns a structured outcome containing exit code, result summary, report access, or a typed run failure. Both the ordinary dispatch and the wizard call this runner, so reports, signal handling, state selection, retries, resume, conflict handling, and content notices remain on one path.

Alternative: re-enter the CLI parser or spawn `ywtc` after dry-run. Rejected because this would duplicate output, lose in-memory edits, complicate signals, and make sequential runs depend on shell quoting.

### Model wizard stages and menus explicitly

The draft stores workdir, source provider/profile/locator, destination kind/profile/locator, scope, source status, comments, archive, and pass-through advanced flags. Stages transition through named states and present an explicit `back/continue/cancel` action after editable inputs. Review actions and post-dry-run actions are distinct states. Switching to a remote destination clears archive immediately.

Profile defaults are selected from compatible profiles and a full URL can preselect the unique longest matching base URL. Ambiguity is resolved by an explicit select prompt; secrets never enter wizard output.

### Reuse initialization through an injected boundary

Workspace selection follows the normal operational precedence for its initial value. If configuration is absent or unusable, the wizard offers configure, another path, or exit. Configure calls the existing initialization wizard with the chosen explicit workdir and then reloads the workspace. Tests replace this boundary with an in-memory stub.

### Gate live on reconciled result fields

The runner returns the ordinary `TransferResult.summary`. Live is unavailable when `inventoryComplete` is false or `rootErrors`, `failed`, `blocked`, or `conflicts` is non-zero. Warnings, non-root issue totals, adaptations, normalizations, and verified degradations do not block the choice unless they also produce a blocking outcome. This rule deliberately uses typed counters rather than parsing console or issue messages.

Report opening after dry-run uses the existing safe report opener. An opener failure is displayed and returns to the action menu without changing the dry-run result.

### Preserve exit and signal semantics

Exiting before a run returns zero. After at least one run it returns that operation's code. Wizard cancellation throws the existing cancellation type and maps to `130`; a process `SIGTERM` retains `143`. Each runner invocation installs and removes its signal handlers in a `finally` block so repeated dry-run/live execution cannot accumulate listeners.

### Add only command-scoped unique aliases

Commander owns all long/short mappings. The same letter can appear on distinct subcommands, such as `-i` for migrate interactive and update install, because scopes are independent. Global help/version and existing report workdir aliases remain reserved.

## Risks / Trade-offs

- [A dry-run and later live run observe different source data] → Live invokes the normal runner again, redoes preflight/discovery, reuses the same state identity, and retains existing drift and verification protections.
- [Sequential runs leak signal listeners] → Install handlers per execution and always remove them in `finally`; cover the sequence in tests.
- [A full URL suggests the wrong profile] → Reuse longest normalized base-URL matching and require explicit choice when no unique compatible match exists.
- [A missing workspace causes unintended writes] → Check TTY first, require an explicit nested-init choice, and let the existing init wizard own all configuration writes.
- [Advanced prefilled flags conflict with a newly selected destination] → Revalidate the completed draft through the same locator and option rules before execution and return the user to editing on usage errors.

## Migration Plan

1. Add the shared prompt abstraction, interactive command parsing, and state machine behind the opt-in flag.
2. Refactor existing migration dispatch into the shared runner without changing ordinary command behavior.
3. Add unit and package smoke coverage before documenting the interactive path.
4. Release through Release Please as a minor feature. Rollback is the preceding package release; state and configuration formats are unchanged.
