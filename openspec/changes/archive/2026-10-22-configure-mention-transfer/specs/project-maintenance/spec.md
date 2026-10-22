# project-maintenance Delta

## ADDED Requirements

### Requirement: Mention transfer documentation and quality gates
The README and project checks SHALL describe and verify the current global mention policy, provider limitations, safe fallback semantics, report outcomes, and publication privacy without adding a new second-level README section.

#### Scenario: Operator configures mention transfer
- **WHEN** the operator reads `Конфигурация`
- **THEN** the README SHALL show the disabled default plus concise template and auto examples, list valid placeholders and aliases, and explain native-resolution limitations once

#### Scenario: Operator interprets mention outcomes
- **WHEN** the operator reads `Возможности` or `Отчёты и статусы`
- **THEN** the documentation SHALL distinguish native, linked, text, preserved, unresolved, and failed mentions and state that verified unresolved fallback does not make a page partial

#### Scenario: Package checks run
- **WHEN** the complete project or package verification runs
- **THEN** it SHALL cover strict configuration, provider lookup contracts, normalized rendering, comment safety, retry selection, report reconciliation, and installed-package parsing without external provider access

#### Scenario: Reports and package are inspected
- **WHEN** report JSON, generated HTML, logs, state, or package contents are validated
- **THEN** they SHALL contain no credentials, authorization values, configured secret tokens, or hidden destination email fields introduced by mention resolution
