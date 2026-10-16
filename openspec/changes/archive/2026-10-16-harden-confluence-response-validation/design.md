# Design

## Context

See `proposal.md` for the incident. Both Confluence clients currently parameterize Axios with TypeScript interfaces, but generic parameters do not validate runtime data. Data Center `preflight()` also accepts any HTTP 2xx payload as system information, while migration and doctor start platform probes and page resolution in the same `Promise.all`. A reverse-proxy startup document can therefore win the race and reach adapter field access before a useful health diagnosis exists.

## Goals / Non-Goals

**Goals:**

- Make every Confluence response consumed by page, hierarchy, resource, comment, user, and space logic pass a tolerant runtime contract first.
- Distinguish provider startup/maintenance HTML from structurally invalid JSON and ordinary HTTP/network failures.
- Guarantee that failed platform preflight prevents locator requests, state/report initialization, and mutations.
- Exercise the built installed package through the exact CLI failure path that escaped unit tests.

**Non-Goals:**

- Repair Confluence, its attachment storage, DNS, TLS, or infrastructure.
- Treat an invalid HTTP 2xx response as retryable inside a possibly unsafe mutation request.
- Change existing bounded retry counts, CLI options, state identity, report data, or provider compatibility claims.
- Persist a failed preflight as a migration run because canonical endpoint identities do not yet exist.

## Decisions

### 1. Validate at provider-client boundaries

A shared Confluence response-contract module will own tolerant schemas and parsing helpers for Data Center pages/comments and Cloud pages/spaces/users plus common lists and attachments. Schemas retain unknown fields but require every value that downstream code reads. The clients return normalized typed values only after parsing.

This is preferred to optional chaining in adapters: optional chaining would suppress the exception but allow invalid identities into state, pagination, or mutations. It is also preferred to validating only `resolveContainer`, because the same unchecked assumption exists in descendants, attachments, comments, and Cloud space lookup.

### 2. Use a typed provider-response error

Invalid payloads produce a typed error carrying provider, operation, and failure kind (`service-unavailable` or `invalid-response`). HTML detection extracts only short title/heading text, strips markup/control characters, and recognizes startup/maintenance vocabulary. Structural JSON errors list bounded schema paths rather than dumping payloads.

Connection verification classifies service-unavailable responses as server failures and invalid contracts as unexpected/compatibility failures. Migration and doctor can surface the same already-actionable message without string matching. Credentials and response bodies are never included.

### 3. Establish a strict preflight barrier

Migration and doctor first run source and destination platform probes concurrently. Only after both succeed do they resolve source and destination locators concurrently. This adds at most one dependency boundary, not serial provider latency, and makes the platform diagnosis deterministic.

State/report creation remains after canonical endpoint resolution, so a failed platform or locator probe cannot create a misleading run. Existing safe retries still apply to HTTP `429`, `5xx`, and retriable network failures; invalid HTTP 2xx bodies fail immediately because retrying them cannot prove recovery and mutation requests remain non-retried by default.

### 4. Sanitize transport diagnostics before formatting

The HTTP formatter will detect HTML payloads and emit a short text summary plus status guidance. For errors without a response it will map timeout, DNS/connectivity, and TLS codes to actionable language. This improves both Confluence and Yandex transport errors without changing retry behavior.

### 5. Add an installed-binary failure smoke test

Package verification will start a loopback HTTP server, write an isolated valid Confluence-only configuration, and run the installed `ywtc migrate --dry-run` binary. The fixture returns the representative Confluence startup HTML with status 200. Acceptance requires a non-zero exit, a service-readiness message, no raw HTML or property TypeError, no locator request after failed preflight, and no state file.

Unit/contract tests remain responsible for individual response schemas and the orchestration barrier. The installed smoke closes the release gap between TypeScript tests and emitted/package-installed JavaScript.

## Risks / Trade-offs

- **[Older Confluence variants omit fields that ywtc does not actually need]** → Require only fields consumed by the operation, keep optional/unknown fields tolerant, and cover Data Center 7.9–11.x plus Cloud fixtures.
- **[HTML detection mistakes ordinary text for a startup page]** → Treat any non-JSON object at a JSON REST boundary as invalid; startup wording affects only diagnosis kind, not acceptance.
- **[Package smoke adds runtime]** → Use one loopback server and fail during preflight before source discovery, keeping the test deterministic and fast.
- **[Parallel source preflight still runs when destination is down]** → This is read-only and bounded; locator and mutation work remains behind the shared barrier.

## Migration Plan

1. Add typed errors and response parsers, then migrate every Confluence response consumption site.
2. Introduce the preflight barrier in migration and doctor.
3. Add unit, orchestration, CLI, and installed-package regressions.
4. Publish as a patch release. Existing configuration, state, and rerun behavior require no migration.

Rollback is a normal package downgrade; the change writes no new runtime format and performs no data migration.
