# Design

## Context

See `proposal.md` for motivation. Personal-source behavior already exists and is specified in `wiki-migration`; the current README distributes the URL forms and scope rules across the general locator reference. The README must retain its exact nine second-level sections, four existing general examples, and one canonical location per operational rule.

## Goals / Non-Goals

**Goals:**

- Put the shortest safe personal-space workflow in one `CLI` subsection.
- Use full source and destination URLs so the existing profile resolver selects connections without optional profile flags or ambiguous shorthand.
- Make the write boundary obvious by pairing `--dry-run` with the identical live invocation minus that flag.
- Keep source coverage, generated hierarchy, and known exclusions beside the commands they qualify.

**Non-Goals:**

- No CLI, provider, state identity, retry, resume, report, outcome, quality, exit-code, or migration behavior changes.
- No new direct dependency or dependency API change.
- No copying of permissions, settings, user profiles, blogs, hidden pages, or historical versions.
- No deletion, purge, destination-space-root support, or automatic destination-parent creation.

## Decisions

### Keep the workflow inside the existing CLI section

Add a third-level subsection before the general examples. This keeps the nine-section contract intact while making the workflow directly discoverable. Adding a new second-level section was rejected because it would violate the enforced README information architecture.

### Consolidate personal-source guidance

Move personal-only locator forms and Confluence space-scope details out of the general locator bullets into the dedicated subsection. The general locator table remains the canonical generic reference; the new subsection becomes the canonical personal-source workflow. Repeating the same rules in both locations was rejected because it would drift.

### Show dry-run and live commands explicitly

Each direction uses full URLs, `--scope subtree`, and two copyable commands: first with `--dry-run`, then without it. Although `subtree` is the default, spelling it out states the intended whole-personal-root selection. A prose-only “remove the flag” instruction was rejected because it does not provide a complete live command.

The live rerun keeps the same canonical source and destination identity, so ordinary checkpointing and resume behavior apply. Absolute URLs avoid profile ambiguity. Existing state/retry documentation remains authoritative for object outcomes, quality notices, retryability, run status, and exit codes.

### Enforce the subsection through the README contract

Extend the existing validator with the subsection heading and stable command fragments for both directions. This catches accidental removal without changing the four-example general command contract.

### Clear the mandatory audit gate with a transitive lock refresh

The full quality gate discovered a new high-severity advisory affecting locked `follow-redirects@1.16.1`. Update only that transitive resolution to `1.16.3`, which is inside the existing `axios` range, and verify the production audit again through the official registry. Adding a direct dependency or weakening the audit threshold was rejected because either would misrepresent dependency ownership or bypass the required control.

## Risks / Trade-offs

- [Example hosts could look deployable] → Continue using reserved `example.com` domains and placeholder login/page IDs.
- [Four commands add length] → Keep prerequisites to one sentence and avoid repeating generic option descriptions.
- [Cloud and Data Center locator forms differ] → Show the Data Center command and state the exact Cloud source form adjacent to it.
- [Operators may treat a space URL as destination] → State that destination is an existing parent page and use page URLs in both examples.
- [A registry-specific install rewrites unrelated lock URLs] → Generate the narrow update against the official registry and inspect the exact lockfile diff.

## Migration Plan

1. Update README wording and examples without changing its second-level structure.
2. Extend the README contract validator.
3. Refresh the vulnerable transitive lock resolution and verify the audit.
4. Run the complete project check.
5. Archive the OpenSpec change so the updated requirement replaces the current personal-source documentation scenario.

Rollback is limited to reverting the documentation, validator, and synchronized specification; no runtime or remote data migration is involved.
