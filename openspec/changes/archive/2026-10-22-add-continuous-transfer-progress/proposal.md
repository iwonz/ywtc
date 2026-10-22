# Proposal

## Why

Large transfers can spend minutes inside page, resource, comment, verification, or provider retry operations without changing the terminal output. The last visible line then looks like a hang even though work is active, and operators cannot distinguish normal latency from a stalled run.

## What Changes

- Emit continuous, phase-aware progress throughout discovery, inventory, planning, staging, resource transfer, content update, comments, verification, export, and report finalization.
- Show exact completed/total counters where totals are known, bounded active-object samples, elapsed time, and time since the last confirmed completion.
- Refresh TTY output with a heartbeat during long operations and emit rate-limited durable progress records in non-TTY environments.
- Keep started and completed work distinct so a heartbeat never advances counters or presents an in-flight object as transferred.
- Stop all progress timers on success, failure, cancellation, or signal handling; redact and bound user/provider labels.
- Do not change transfer semantics, state identity, report contracts, retry selection, or destination mutation behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen observable migration progress with continuous heartbeat, phase/counter/active-work context, and TTY/non-TTY delivery requirements.

## Impact

The migrator status callback, remote and filesystem transfer instrumentation, and CLI status renderer change. Tests cover timing, counter correctness, cleanup, output throttling, and long-running operations. No dependency or public command-line change is required.
