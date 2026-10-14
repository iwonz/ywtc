## 1. Runtime path migration

- [x] 1.1 Change automatic state, cache, and report resolution to `.states/` with state files directly under the root.
- [x] 1.2 Add ordered, ownership-checked read-only fallback from both previous `.wiki-migration/` state layouts.

## 2. Naming and repository hygiene

- [x] 2.1 Update CLI and current operator-facing product wording to lead with `ywtc`.
- [x] 2.2 Update Git, Biome, release checks, and agent guidance to protect `.states/` while retaining protection for old runtime data.
- [x] 2.3 Update README paths and upgrade guidance without duplicating CLI documentation.

## 3. Verification

- [x] 3.1 Update unit and integration coverage for new paths, fallback precedence, mismatch handling, reporting, and CLI naming.
- [x] 3.2 Run focused tests and `npm run check`, fixing all failures without weakening quality gates.
- [x] 3.3 Archive the OpenSpec change and run strict validation with no active changes remaining.
