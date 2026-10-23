## ADDED Requirements

### Requirement: Identity-preserving targeted rewrite
The CLI SHALL accept `retry --rewrite` and `-R` while keeping ordinary actionable selection and restoring the source and destination invocation. Rewrite SHALL affect only selected pages and necessary in-place dependency recovery.

#### Scenario: Operator requests targeted rewrite
- **WHEN** retry selects actionable objects with rewrite enabled
- **THEN** mapped selected pages SHALL be rebuilt in place without recreating any destination page or selecting unrelated complete pages

#### Scenario: Origin invocation used rewrite
- **WHEN** retry restores an invocation that recorded rewrite
- **THEN** its identity-preserving no-create policy SHALL remain enabled even when the operator omits the flag
