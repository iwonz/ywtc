# Spec Delta

## ADDED Requirements

### Requirement: Semantic-empty source pages
The system SHALL classify page content after removing only provider-defined empty editor scaffolding and SHALL treat a page with no remaining meaningful text, media, references, structure, macros, or directives as a valid empty page.

#### Scenario: Source contains only empty heading scaffolding
- **WHEN** a source page contains whitespace and headings without titles, bodies, media, anchors, or other meaningful content
- **THEN** the destination SHALL receive its provider-safe empty body, the page SHALL be eligible for `complete`, and no raw fallback or source snapshot SHALL be required

#### Scenario: Empty page is a hierarchy container
- **WHEN** a semantically empty selected page has selected descendants
- **THEN** the page SHALL be created in the expected hierarchy and SHALL NOT block or degrade its descendants

#### Scenario: Apparently empty page contains a meaningful construct
- **WHEN** visible text is empty but the source contains an anchor, image, attachment reference, table, code, macro, navigation directive, or layout cell with meaningful content
- **THEN** the page SHALL NOT be classified as semantically empty

#### Scenario: Existing ywtc fallback is resumed
- **WHEN** a mapped page previously received an unchanged ywtc raw fallback for content now classified as semantically empty
- **THEN** a rerun SHALL replace that managed fallback with the provider-safe empty body without creating another destination page or deleting attachments

### Requirement: Provider-neutral page layout preservation
The system SHALL normalize supported page layouts into ordered sections and cells before vendor rendering and SHALL use the closest native destination layout without flattening supported columns.

#### Scenario: YFM equal columns transfer to Confluence
- **WHEN** YFM contains a balanced layout with one to three ordered block columns
- **THEN** Confluence SHALL receive a top-level `ac:layout` with matching `single`, `two_equal`, or `three_equal` sections and one `ac:layout-cell` per source block

#### Scenario: Confluence equal columns transfer to Yandex Wiki
- **WHEN** Confluence Storage Format contains a valid `single`, `two_equal`, or `three_equal` layout section
- **THEN** Yandex Wiki SHALL receive ordered `{% layout %}` and `{% block %}` constructs with the complete content of every cell

#### Scenario: Same-provider layout transfer
- **WHEN** source and destination use the same provider and the source layout is accepted by that provider
- **THEN** the native layout and cell order SHALL remain native without a degradation

#### Scenario: Layout cannot be represented exactly
- **WHEN** a source layout has unsupported nesting, more destination cells than supported, or unequal widths without a destination equivalent
- **THEN** every cell SHALL remain readable in deterministic order, the raw source SHALL remain recoverable, and the page SHALL record a precise layout degradation rather than silently flattening it

### Requirement: Symmetric safe content equivalents
The normalized pipeline SHALL use stable native or semantic equivalents in both transfer directions for supported callouts, expandable blocks, child navigation, task lists, code, anchors, links, images, and attachments.

#### Scenario: Callout and expandable block transfer
- **WHEN** source content contains a supported YFM note/cut or Confluence info, tip, warning, note, or expand macro
- **THEN** the destination SHALL receive its corresponding native note/callout or cut/expand representation with title and body preserved

#### Scenario: Child navigation transfer
- **WHEN** source content contains a supported YFM tree directive or Confluence children macro
- **THEN** the destination SHALL receive native child navigation with supported depth and ordering parameters, or a deterministic static selected-page list where native navigation is unavailable

#### Scenario: Task and code transfer
- **WHEN** source content contains task items or code with an identified language
- **THEN** the destination SHALL preserve task completion state and code text and SHALL preserve the language when its native representation supports it

#### Scenario: Provider feature has no safe equivalent
- **WHEN** a macro or interactive construct is not in the supported equivalence matrix
- **THEN** the system SHALL keep a readable non-executable representation, retain raw source, and report the specific construct as a degradation

### Requirement: Layout-aware destination verification
Provider-aware verification SHALL compare semantic emptiness plus ordered layout sections and cells in addition to meaningful text, references, blocks, tables, code, and macros.

#### Scenario: Destination preserves layout
- **WHEN** the destination reserializes namespaces, attributes, whitespace, or empty layout padding but retains the expected ordered sections, cells, and their meaningful contents
- **THEN** verification SHALL accept the layout as complete

#### Scenario: Destination flattens or drops a column
- **WHEN** a native-layout destination loses a section, changes cell order, flattens supported columns, or omits meaningful cell content
- **THEN** verification SHALL return partial for represented formatting simplification or failed for missing data and identify the layout difference

#### Scenario: Empty bodies are equivalent
- **WHEN** expected and actual bodies are both semantically empty despite provider-specific empty serialization
- **THEN** verification SHALL return complete rather than rejecting the destination for having no visible text
