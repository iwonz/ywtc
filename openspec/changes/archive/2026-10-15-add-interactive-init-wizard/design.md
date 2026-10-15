# Design

## Context

The current `init` path creates an empty strict YAML template immediately, while configuration parsing, provider clients, and capability preflight are already separate concerns. The wizard must compose those pieces without weakening direct-credential storage, workdir isolation, or non-interactive automation. See `proposal.md` and the workspace-management delta for the behavioral contract.

## Goals / Non-Goals

**Goals:**

- Provide a polished, testable wizard with deterministic navigation and no partial configuration writes.
- Reuse the production schema, HTTP retry/rate-limit behavior, and provider authentication implementations.
- Preserve unrelated YAML content during edit and provide recoverable reset/persistence behavior.

**Non-Goals:**

- Probe page-specific permissions or mutate vendor systems.
- Add stored default source/destination locators, network-limit prompts, schema versions, or compatibility conversion.
- Change transfer retry, resume, conflict, or degradation behavior.

## Decisions

### Clack UI behind an injected prompt port

Production uses `@clack/prompts` for text, password, select, spinner, intro/outro, and cancellation. Wizard orchestration depends on a small internal prompt interface; tests use a scripted adapter. A page state machine owns `workspace -> yandex -> confluence -> review`, with section-level Back/Continue/Cancel actions and retained draft values. This avoids raw readline handling and avoids coupling tests to terminal escape sequences.

### Opt-in terminal contract

Only `init --interactive` starts the wizard. Both stdin and stdout must be TTYs. `--workdir` supplies the editable initial path; otherwise the literal display default is `~/.ywtc`, resolved through existing path rules. Ordinary `init` and migration auto-initialization remain unchanged. Cancellation is represented explicitly and mapped to exit code 130 rather than thrown as a usage error.

### Draft configuration and comment-preserving edits

The wizard holds a provider-neutral draft in memory. New/reset mode builds current defaults plus exactly `yandex` and `confluence`. Edit mode loads a YAML `Document`, selects or adds one profile of each provider, and updates only chosen scalar paths so other profiles, comments, defaults, and limits survive. Profile names are required, current-format compatible, and unique; collision-free defaults use `yandex[-N]` and `confluence[-N]`.

Configuration parsing is refactored so file input and in-memory YAML documents pass through the same strict Zod schema and normalization. Existing tokens are never placed into visible initial values: the password step offers keep or replace, and Back navigation reports only that a credential is configured.

### Dedicated authenticated connection probes

Provider clients expose a current-user probe in addition to existing platform preflight:

- Yandex Wiki requests `GET /users/me` using the configured authorization and organization header.
- Confluence Data Center requests `/rest/api/user/current` and then runs server/platform preflight.
- Confluence Cloud requests `/rest/api/user/current` under the normalized `/wiki` root and then runs its REST v2 spaces preflight.

The verifier runs Yandex and Confluence probes independently with configured timeout, concurrency, rate limiting, and retry/backoff. Final errors are classified into authentication, forbidden/organization, URL/not-found, rate-limit, server, timeout, DNS, TLS, and unexpected categories. All rendering passes the draft token and Cloud email through existing redaction. A successful probe explicitly does not claim page-level write permission.

### Transactional local commit

No directory or file is created before strict draft validation and both remote probes pass. At commit time the service:

1. Rechecks the original configuration fingerprint to detect concurrent edits.
2. Creates the workdir and runtime directories with existing secure modes.
3. In reset mode, writes a timestamped `0600` backup under `.states/backups/`.
4. Writes and validates a `0600` temporary YAML file under `.states/`.
5. Atomically renames it over the active configuration where supported, preserving the previous mode for edits and restoring the previous file if replacement fails.

The generated YAML ends with a newline. Temporary rollback material is removed after success and remains inside ignored `.states/`; failures never silently discard the previous configuration.

## Risks / Trade-offs

- **A connection probe cannot prove page write access.** → State the boundary in success output and direct operators to page-specific `doctor`/`migrate` checks.
- **Provider current-user endpoints can vary behind proxies.** → Contract-test Cloud and supported Data Center profiles and classify endpoint failures without falling back to remote writes.
- **Atomic replacement semantics vary by platform.** → Use same-filesystem temporary files, preserve a rollback copy during replacement, and test injected rename failures.
- **YAML edits can disturb formatting inside selected profiles.** → Patch scalar nodes through the YAML Document API and golden-test comments and unrelated profiles.
- **A long wizard keeps secrets in memory.** → Keep them only in the draft, never render them, redact all caught errors, and release references on completion/cancellation.

## Migration Plan

Ship as an additive `feat(init)` release. Existing scripts and workspaces continue using ordinary `init`; no data or configuration migration is required. Rollback removes the flag and dependency without changing any configuration produced by the wizard because it uses the current public YAML format.
