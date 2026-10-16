# Tasks

## 1. Confluence response contracts

- [x] 1.1 Add typed provider-response failures and tolerant runtime parsers for every Confluence page, space, list, attachment, comment, user, and platform response consumed by the clients; verify valid additive fields remain accepted.
- [x] 1.2 Route Data Center and Cloud client responses through the parsers before property access; verify contract tests cover startup HTML, missing `space.key`, malformed lists, and representative valid DC 7.9–11.x/Cloud payloads.
- [x] 1.3 Sanitize HTML and transport failures into concise server/timeout/DNS/TLS guidance; verify tests never expose raw markup, credentials, or JavaScript property-access errors.

## 2. Deterministic preflight behavior

- [x] 2.1 Add a platform-preflight barrier before source/destination locator resolution in migrate and doctor; verify orchestration tests prove no locator, state, report, or mutation work starts after failed preflight.
- [x] 2.2 Integrate typed provider failures with connection verification and CLI output; verify startup HTML is classified as server unavailability and the command exits non-zero with an actionable redacted message.
- [x] 2.3 Document concise provider-readiness behavior in the existing README compatibility/configuration guidance and verify the README contract remains valid without a new top-level section.

## 3. Release regression coverage

- [x] 3.1 Extend package verification with a loopback Confluence startup-page fixture and the installed `ywtc migrate --dry-run` binary; verify it fails before locator/state/mutation work with no raw HTML or TypeError.
- [x] 3.2 Run focused client, HTTP, connection, migration, CLI, and package tests; verify the exact reported incident is reproduced by a failing regression before the fix and passes after the fix.

## 4. Integration verification

- [x] 4.1 Run strict validation for `harden-confluence-response-validation` and verify proposal, design, specifications, and completed tasks are consistent.
- [x] 4.2 Run `npm run check` and verify release hygiene, security audit, TypeScript, Biome, Knip, Vitest, Playwright, build, installed-package smoke, and OpenSpec validation all pass.

## Workflow follow-up

- Archive the change after every tracked task passes.
- Run strict OpenSpec validation against the archived main specifications.
- Publish the fix as a patch release and verify GitHub, npm/npx, and Homebrew artifacts.
