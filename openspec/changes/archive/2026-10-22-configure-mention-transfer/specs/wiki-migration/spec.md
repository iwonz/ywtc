# wiki-migration Delta

## ADDED Requirements

### Requirement: Configurable mention transfer
The system SHALL apply one strict workspace mention policy with modes `off`, `template`, and `auto`, defaulting to `off`, while preserving every recognized source mention in a readable destination representation.

#### Scenario: Mention processing is disabled
- **WHEN** the mention policy is absent or selects `off`
- **THEN** ywtc SHALL perform no destination-user lookup, preserve the source mention text or safe same-provider form, and record a `preserved` outcome without a warning

#### Scenario: Template presentation is selected
- **WHEN** the policy selects `template`
- **THEN** ywtc SHALL render the configured display template as escaped text and SHALL wrap it in a safe absolute HTTP(S) link only when `urlTemplate` is present and valid

#### Scenario: Native presentation is selected
- **WHEN** the policy selects `auto` and exactly one destination user is proven
- **THEN** ywtc SHALL render the provider-native mention with the verified immutable or provider-recognized identity and record a `native` outcome

#### Scenario: Destination identity is not proven
- **WHEN** native resolution is unsupported, missing, ambiguous, forbidden, or temporarily unavailable
- **THEN** ywtc SHALL render the configured safe fallback, keep the page complete when read-back verifies that fallback, record `unresolved`, and emit a typed warning without targeting an arbitrary user

### Requirement: Provider-neutral mention recognition
The system SHALL normalize supported Yandex Wiki and Confluence mentions before generic content transformation and SHALL exclude text contexts that cannot safely represent a mention.

#### Scenario: Yandex Wiki mention is parsed
- **WHEN** YFM contains an unescaped `@username` or `@{username}` outside code, URLs, email addresses, diagrams, and raw HTML attributes
- **THEN** ywtc SHALL create one mention node containing the original source token and available source identity fields without damaging adjacent text

#### Scenario: Confluence mention is parsed
- **WHEN** Confluence Storage Format contains an `ac:link` with an `ri:user`
- **THEN** ywtc SHALL create one mention node from the account ID, user key, username, display text, and original markup fields that are available

#### Scenario: Large content contains mentions
- **WHEN** a source page contains megabyte-scale lines or embedded payloads
- **THEN** mention recognition SHALL remain bounded and cooperatively responsive and SHALL NOT apply an unbounded expression across the complete payload

### Requirement: Conservative destination-user resolution
The system SHALL resolve native mention identities in a deterministic order and SHALL accept only a unique destination identity.

#### Scenario: Explicit alias exists
- **WHEN** the policy maps the source identity to provider-specific destination identifiers
- **THEN** ywtc SHALL prefer that mapping and verify it with the destination capability before emitting a native mention

#### Scenario: Exact provider identity exists
- **WHEN** no alias applies and an immutable ID, username, user key, or visible email uniquely identifies a destination user
- **THEN** ywtc SHALL use that exact user and SHALL NOT select by display name alone

#### Scenario: Multiple candidates exist
- **WHEN** destination lookup returns more than one equally valid candidate
- **THEN** ywtc SHALL render the fallback, record the candidate-free ambiguous reason as `unresolved`, and SHALL NOT mention any candidate

### Requirement: Mention completeness and observability
The system SHALL verify and account for mentions independently from page, resource, and comment counts while deriving page completeness from preserved information rather than notification delivery.

#### Scenario: Mention representation is verified
- **WHEN** destination content is read back
- **THEN** each source mention SHALL correspond to exactly one matching native marker, safe link, preserved token, or text fallback

#### Scenario: Mention representation is missing
- **WHEN** a source mention has no verified destination representation
- **THEN** ywtc SHALL record `failed`, add a degradation, and mark the owning page partial or failed according to the existing body-verification rules

#### Scenario: Transfer progress is shown
- **WHEN** mention inventory or resolution is active
- **THEN** terminal, state, JSON, and HTML report totals SHALL reconcile discovered page and comment occurrences, unique identities, native, linked, text, preserved, unresolved, and failed outcomes while omitting zero-valued presentation counters
