# Spec Delta

## ADDED Requirements

### Requirement: Source selection documentation
The README SHALL document complete subtree selection and the provider-neutral source-status filter inside the existing Parameters, Frequent examples, State, and Reports sections without adding a new top-level section.

#### Scenario: Operator reviews subtree behavior
- **WHEN** an operator reads the parameter table and subtree examples
- **THEN** the documentation SHALL state that `all` is the default, explain Yandex `actual` and `obsolete` coverage, describe Confluence hierarchy limitations, and show a current-only command

#### Scenario: Operator changes source status on rerun
- **WHEN** an operator reads the State and Reports sections
- **THEN** the documentation SHALL explain stable state identity, non-deletion of mappings outside the current selection, selected/excluded counts, and hierarchy repair reporting
