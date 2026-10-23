# Spec Delta

## ADDED Requirements

### Requirement: Readable terminal completion summary
The CLI SHALL group a completed transfer's terminal summary into report access, source inventory, object outcomes, diagnostics, and optional result or continuation fields. Nonempty groups SHALL be separated by one blank line, field values SHALL be aligned, and all existing counters and actionable commands SHALL retain their meaning in TTY and non-TTY output.

#### Scenario: Transfer returns a result
- **WHEN** a migration or targeted retry returns a successful, partial, or dry-run result
- **THEN** its final summary SHALL separate report metadata, source inventory, page/file/comment/mention outcomes, and quality or causal diagnostics with blank lines
- **AND** optional Grid, inventory-recovery, and mention fields SHALL remain within their relevant groups

#### Scenario: Optional results and next actions
- **WHEN** the result includes an output, archive, retry lineage, or continuation command
- **THEN** those fields SHALL form a separate final group with aligned values
- **AND** an absent final group SHALL NOT leave an empty section or extra separator
