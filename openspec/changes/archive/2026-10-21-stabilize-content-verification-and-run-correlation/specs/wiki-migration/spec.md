# Spec Delta

## ADDED Requirements

### Requirement: Serialization-independent semantic text
Destination verification SHALL derive text with explicit separators at meaningful block boundaries while preserving exact inline text adjacency, so provider serialization whitespace cannot change the outcome.

#### Scenario: Provider removes whitespace between blocks
- **WHEN** a destination returns adjacent paragraphs, captions, headings, list items, table cells, or layout cells without the whitespace present in the submitted serialization
- **THEN** verification SHALL treat the texts as equivalent when their ordered block payloads and all other meaningful structures match

#### Scenario: Inline text spacing changes
- **WHEN** a destination adds or removes meaningful whitespace between inline text fragments
- **THEN** verification SHALL identify the text difference and SHALL NOT hide it through block-boundary normalization

#### Scenario: Meaningful block is absent
- **WHEN** a destination omits or changes a non-empty block payload
- **THEN** verification SHALL remain incomplete even if the remaining flattened text could be made similar by whitespace normalization

### Requirement: Latest-representation failure recovery
After destination creation, recovery from a later pipeline error SHALL verify the actual page against the latest complete body representation ywtc attempted for that page, or against bootstrap content only when no final representation was produced.

#### Scenario: Optional operation fails after final body rendering
- **WHEN** the final source-derived body was rendered or written but a later resource, comment, update, or verification operation fails
- **THEN** recovery SHALL compare the re-read destination body with that final representation and SHALL preserve a readable verified page as partial rather than incorrectly failing it against bootstrap references

#### Scenario: Final rendering never completes
- **WHEN** processing fails before a final body representation is available
- **THEN** recovery SHALL compare the re-read destination body with the source-derived bootstrap representation

### Requirement: Correlated run identity
Each migration attempt SHALL use one run identifier for its state history, HTML report, JSON report, report directory, terminal summary, and report-opening command.

#### Scenario: Run report is written
- **WHEN** a dry-run or live migration creates a state run and a report bundle
- **THEN** every emitted run identifier and report bundle directory SHALL equal the state run identifier

### Requirement: Typed verification diagnostics
A failed semantic destination comparison SHALL be reported as a verification issue rather than a generic provider API issue.

#### Scenario: Destination content fails semantic comparison
- **WHEN** provider access succeeds but the re-read body does not preserve the expected meaningful content
- **THEN** the issue SHALL have a stable verification code, verification phase and category, affected page identity, and retry guidance
