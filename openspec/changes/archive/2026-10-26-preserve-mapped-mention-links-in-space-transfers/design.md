# Design

## Context

See proposal.md. Confluence mention substitution currently precedes space navigation rewriting, so identical href values lose their provenance.

## Goals / Non-Goals

Keep explicit mapping URLs literal while ordinary navigation still follows the transfer. No new policy, lookup, CLI flag, state identity or real migration.

## Decisions

Perform safe structural and navigation rewrites on the original storage representation, then insert escaped mention links in the final Confluence body. Portable rendering already follows this ordering. Avoid URL allowlists: they would also suppress legitimate navigation with the same href. Existing verification, source-authoritative resume, typed ownership conflicts, retries, run statuses and exit codes remain unchanged.

## Risks / Trade-offs

- Late insertion must remain escaped and HTTP(S)-validated: reuse the existing mention serializer and strict mapping loader.
- Native mention order must remain stable: test mixed navigation and mention content and run the complete suite.

## Delivery

Archive after full quality gates; publish a patch through Release Please. No source/destination writes or schema conversion are part of this correction.
