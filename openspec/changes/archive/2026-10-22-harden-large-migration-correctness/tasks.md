# Tasks

## 1. Report integrity and scale

- [x] 1.1 Add failing regression tests for replacement metacharacters, script-like input, a single document boundary, and payload round-tripping; verify the focused report tests fail for the current generator
- [x] 1.2 Implement callback-based report injection and bounded complete-page previews; verify focused unit and browser report tests pass

## 2. Semantic verification

- [x] 2.1 Add failing tests proving title-based and immutable-ID Confluence references to the same mapped page verify equally while different targets still fail
- [x] 2.2 Implement canonical page-reference signatures and block-aware text normalization; verify content-model and remote-direction tests pass

## 3. Destination and resource recovery

- [x] 3.1 Add failing tests for confirmed space/parent not-found recovery, ambiguous create denial diagnostics, and preservation of successful upload evidence when read-back is unavailable
- [x] 3.2 Implement bounded confirmed-dependency recovery plus uploaded-unverified reconciliation without duplicate uploads; verify focused migrator and adapter tests pass
- [x] 3.3 Add and pass interrupted source-download coverage that retains verified cache evidence and retries only incomplete resources

## 4. Comments and transformation fidelity

- [x] 4.1 Add a failing comment test proving archives without attachment payloads never call destination attachment APIs, then implement lazy resource reconciliation and verify comment tests pass
- [x] 4.2 Add failing fixtures for literal Helm/Jinja/Go-template syntax and empty preferred rendering, then implement protected parsing and safe structural fallback with focused golden tests
- [x] 4.3 Reconcile every discovered Grid to one explicit outcome and verify Grid summary and retry-plan invariants

## 5. Issue lifecycle and retry precision

- [x] 5.1 Add failing issue-collector/report tests that separate recovered events from unresolved warning/error/retryable totals
- [x] 5.2 Implement resolved issue lifecycle and current-outcome retry selection; verify terminal, state, JSON/HTML report, catalog, and retry totals agree

## 6. Integration verification

- [x] 6.1 Run the focused suites against a sanitized large-report fixture and verify previously successful objects are not selected for retry
- [x] 6.2 Run `npm run check`, resolve every failure without weakening gates, and verify package/browser smoke tests plus strict OpenSpec validation succeed

## Workflow follow-up

- Archive the change after all tracked tasks are complete.
- Run strict validation against the archived specifications.
