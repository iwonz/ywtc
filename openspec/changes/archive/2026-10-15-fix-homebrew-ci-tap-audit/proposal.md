# Proposal

## Why

The generated formula is style-clean, but current Homebrew disables `brew audit` for filesystem paths. CI must stage the candidate in an isolated temporary tap and audit/install/test it by formula name, matching supported Homebrew behavior.

## What Changes

- Create a non-git temporary CI tap on the ephemeral macOS runner.
- Copy the generated candidate into that tap and run strict audit, install, and test by fully qualified formula name.
- Keep style checking against the generated repository file and retain the final CLI version check.
- Do not weaken audit, persist the CI tap, mutate a developer machine, or bypass formula installation tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Specify that Homebrew verification stages the generated candidate in an isolated temporary tap and addresses it by name for strict audit, installation, and functional testing.

## Impact

- Affects only `.github/workflows/release.yml` and its workflow regression test.
- No CLI, package, formula generator, provider, state, or published-data behavior changes.
