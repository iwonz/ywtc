# Tasks

## 1. Bounded YFM preprocessing

- [x] 1.1 Implement a linear YFM lexical-payload guard that replaces oversized tokens with deterministic non-sensitive markers and verify unit tests cover inline data URIs, ordinary content, multiple payloads, and stable diagnostics.
- [x] 1.2 Integrate the guard into every Diplodoc invocation, preserve the original raw content outside transient parser input, and verify normalization/render tests produce a degradation plus readable surrounding content.

## 2. Bounded implicit-link processing

- [x] 2.1 Implement shared whitespace-bound linkification with original offsets and verify ordinary HTTP(S), punctuation, multiple chunks, and oversized-token cases.
- [x] 2.2 Replace full-content linkifier calls in discovery and rendering and verify linked references and clickable rendered URLs remain correct without scanning oversized tokens.

## 3. Migration continuity and documentation

- [x] 3.1 Add an integration regression with a megabyte inline payload and independent sibling pages, verifying the run finishes, the affected page is partial with a raw snapshot, siblings complete, and progress remains responsive.
- [x] 3.2 Update the existing README capabilities/limitations language to explain bounded pathological payload handling and verify the approved H2 structure is unchanged.

## 4. Quality gates

- [x] 4.1 Run strict change validation and focused tests, fixing any failures without weakening assertions.
- [x] 4.2 Run `npm run check`, verify the packed package contains the new runtime module, and complete all tracked tasks.

## Workflow follow-up

- Archive the completed OpenSpec change and run strict repository specification validation.
- Commit with a patch-level Conventional Commit, push, and verify the release channels.
