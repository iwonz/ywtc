# Tasks

## 1. Resource inventory outcomes

- [x] 1.1 Add typed, serializable resource inventory failures and optional single-resource refresh capability; verify domain and checkpoint schema tests accept successful and failed Grid records.
- [x] 1.2 Make Yandex Grid enumeration settle each payload independently while retaining strict failures for page/resource-list operations; verify adapter contract tests cover persistent `504`, retryability metadata, and targeted refresh.

## 2. Checkpoint recovery and transfer

- [x] 2.1 Persist core page checkpoints with independent Grid outcomes and retry failed Grid payloads at object granularity; verify resumable-inventory tests prove successful siblings are reused and structural failures still block all destination mutations.
- [x] 2.2 Render unavailable Grids as explicit source-linked fallbacks and successful Grids as verified static-table adaptations; verify content safety tests distinguish `partial` degradation from `complete` adaptation without losing ordinary page content.
- [x] 2.3 Integrate Grid resource outcomes with targeted retry so the owning page is rerendered without reprocessing unrelated pages; verify a retry resolves the Grid and removes its prior issue.

## 3. Diagnostics and operator workflow

- [x] 3.1 Report Grid resources and enrichment outcomes separately from file and byte totals; verify terminal, JSON, HTML model, and report invariant tests agree on discovered/complete/failed counts.
- [x] 3.2 Print the canonical `ywtc retry <run-id>` continuation for state-backed failed live runs while preserving dry-run continuation semantics; verify CLI output tests cover both paths.
- [x] 3.3 Update the existing README sections to explain strict core inventory versus recoverable Grid enrichment and verify documented commands and terminology match the CLI.

## 4. Integration verification

- [x] 4.1 Add an integration scenario with multiple pages and Grids where one payload exhausts retries; verify destination mutation proceeds, the owner is partial, unrelated pages complete, and a later retry becomes complete without duplicates.
- [x] 4.2 Run `npm run check`, package/browser smoke checks, and strict OpenSpec validation; resolve every failure before delivery.

## Workflow follow-up

- Archive `isolate-retryable-resource-inventory-failures` after implementation and verification.
- Re-run strict OpenSpec validation against the archived specifications.
- Create a Conventional Commit, push `master`, and verify the patch release through GitHub, npm/npx, and Homebrew.
