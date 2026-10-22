# Proposal

## Why

Large transfers can enter CPU-heavy post-plan rendering loops that monopolize the Node.js event loop. The migration continues consuming CPU, but Listr2 cannot repaint and the heartbeat timer cannot run, so the terminal remains indefinitely on `Plan ready` and appears hung.

## What Changes

- Make long CPU-heavy page batches cooperatively yield so timers, signals, and terminal rendering remain responsive.
- Switch from the plan summary to an explicit post-plan phase before expensive preparation begins.
- Report phase-local confirmed progress, active work, elapsed time, throughput, and ETA when enough completed samples make an estimate meaningful.
- Bound retained bootstrap render data for large trees by rendering each page just in time and releasing its bootstrap body after staging.
- Cover real TTY rendering and event-loop responsiveness with large delayed/CPU-heavy migration tests.
- Keep migration semantics, state identity, destination mutation rules, and completed counters unchanged.

Non-goals: changing provider concurrency defaults, weakening the complete-inventory barrier, skipping content, or deleting source/destination/runtime data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen observable migration progress and large-transfer execution so post-plan CPU work cannot suppress heartbeat, signals, or truthful phase progress.

## Impact

- Migration progress/runtime scheduling, remote bootstrap preparation, and terminal rendering integration.
- Unit, integration, and pseudo-TTY tests for cooperative scheduling and large transfers.
- No new runtime dependency or public CLI option.
