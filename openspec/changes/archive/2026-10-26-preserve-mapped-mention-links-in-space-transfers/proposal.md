# Proposal

## Why

Space navigation rewriting can accidentally replace a literal mention decision when its URL equals the source space entry. Explicit mapping decisions must remain literal while ordinary navigation still targets the migrated section.

## What Changes

- Apply explicit Confluence mention presentations after navigation rewriting.
- Add a regression containing both a real space-navigation link and an identical configured mention URL.
- Do not change configuration, state identity, ordinary links, native notification policy or private destination data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: clarify literal mention decision precedence over navigation rewrites.

## Impact

Confluence rendering order and a neutral regression test. No dependency, CLI or operator workflow changes; publish as a patch. Existing README already states that mapping URLs are literal, so no duplicate operator guidance is needed.
