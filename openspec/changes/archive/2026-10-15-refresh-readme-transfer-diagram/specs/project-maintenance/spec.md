# Spec Delta

## ADDED Requirements

### Requirement: Universal transfer header
The README header SHALL accurately depict Yandex Wiki and Confluence as sources feeding the `ywtc` pipeline and SHALL depict Confluence, Yandex Wiki, Markdown, and HTML as destinations while preserving the established dark technical visual style.

#### Scenario: Visual transfer matrix is inspected
- **WHEN** a reader views the README header
- **THEN** both remote providers SHALL be identifiable as possible sources
- **AND** both remote providers and both static formats SHALL be identifiable as possible destinations
- **AND** directional connectors SHALL communicate convergence into and branching out of `ywtc`

#### Scenario: Header is read without images
- **WHEN** the header image is unavailable or interpreted by assistive technology
- **THEN** its alternative text SHALL identify the two source providers, the `ywtc` pipeline, and all four destination types
