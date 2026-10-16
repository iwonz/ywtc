# Spec Delta

## ADDED Requirements

### Requirement: Content-equivalence documentation
The README supported-content table SHALL describe current bidirectional native equivalents and SHALL distinguish exact preservation, safe normalization, static representation, and loss-aware fallback without adding another second-level section.

#### Scenario: Operator evaluates layout fidelity
- **WHEN** the operator reads `Возможности`
- **THEN** the table SHALL explain Yandex Wiki and Confluence column-layout preservation, responsive HTML behavior, and Markdown's recorded linearization

#### Scenario: Operator evaluates provider constructs
- **WHEN** the operator compares Yandex Wiki and Confluence features
- **THEN** the table SHALL identify supported pairs for notes/callouts, cuts/expand, tree/children, task lists, code, anchors, links, images, and attachments and SHALL keep unsupported constructs in the concise limitations table

#### Scenario: Empty structural page is documented
- **WHEN** a source page has no meaningful content and exists only as a hierarchy container
- **THEN** the documentation SHALL state that it transfers as a valid empty page rather than a fallback or degradation
