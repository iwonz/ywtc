## Why

The first npm publication is intentionally interactive, but README only describes the automated steady-state release. Maintainers need the exact bootstrap, trust-binding, and Release Please sequence without searching source files.

## What Changes

- Add a concise first-release maintainer checklist to README.
- Distinguish the package runtime npm minimum from the newer npm CLI required by `npm trust`.
- Document the repository setting required for Release Please PR creation and its security scope.

## Capabilities

### Modified Capabilities

- `release-management`: make the existing first-release bootstrap operational from public documentation.

## Impact

Documentation and release specifications change; product code and release permissions remain unchanged.
