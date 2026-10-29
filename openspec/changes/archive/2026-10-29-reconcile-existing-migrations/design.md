# Design

## Context

Base: clean synchronized master `0cad2fd8c70643121cdeb71505d351a140b88773`. The existing migration core already supports typed outcomes, identity-preserving mapped updates, private caches, resource reconciliation, selected retry graphs, read-only ancestors and pre-write hooks. The job service and Mantine UI already share operation requests and revision-bound previews. Retry intentionally does not expand a complete inventory.

## Goals / Non-Goals

**Goals:** implement the contracts in `migration-reconciliation` through the existing core, preserve identity and literal decisions, and keep original reports immutable. Complete local recovery is independent evidence, never a source of tracked fixtures.

**Non-Goals:** no source deletion, purge, deleting descendants, lookup-based mentions, bulk destination-wide edits outside mapped ownership, hidden policy conversion or automatic application after analysis.

## Decisions

1. **Separate analysis and application.** Add shared `sync-plan` and `sync-apply` operations and CLI dispatch. Plans live below `.states/sync/<uuid>/`; JSON decisions and UI edits share strict validation and compare-and-swap revisions. Update/Keep/Trash are explicit for changed/unknown baselines; additions default to Add and unchanged/equivalent content is reused. CLI trash additionally requires `--confirm-trash`; UI supplies an equivalent separate confirmation.

2. **Retain the original pair.** Restore the original invocation and resolve the latest compatible live baseline against its state. An optional source locator restricts subtree discovery but never replaces the canonical root or destination container. Prove membership by immutable IDs/ancestors or space inventory. Aggregate reports retain outcomes outside the operation. Ambiguous ownership and insufficient identity evidence block before writes.

3. **Separate evidence from mutable cache.** Persist optional content/hierarchy/resource/comment/effective-policy hashes after verified writes and immutable source snapshots below the runtime directory. Content hashes exclude provider version and timestamp changes; object hashing is canonical. Legacy evidence is accepted only when provable; otherwise current semantic equivalence can justify reuse, or a review decision is required. Keep records the effective source hash and expires on its next change.

4. **Reuse selected execution under one state lease.** Extend the migration core with reviewed execution metadata, a pre-run validation hook and an under-lease post-transfer phase. Selected additions/updates use ordinary bootstrap, file, Grid, comment and read-back behavior; successful ancestors and kept pages remain context. Post-transfer applies link patches, records Keep/exclusion decisions and finalizes one aggregate report. Checkpoints distinguish owned writes from unrelated drift and reconcile ambiguous responses. No shell invocation of public CLI commands is introduced.

5. **Index references, patch actual destination.** Build a private rebuildable index of mapped pages/comment archives, current destination versions and unresolved source aliases. On index creation read all mapped objects; later reuse version-bound entries. Resolve new mappings against current source aliases. Apply exact structural patches to actual bodies, retaining labels/fragments and literal mention/hashtag presentations. Never rerender a referring page solely for one link. Show unreadable or ambiguous references and coverage explicitly.

6. **Explicit trash is a persistent exclusion.** Extend optional state metadata and reporting for operator-trash exclusions while retaining IDs and mappings. Ordinary migrate/retry must not implicitly recover them. Only published Confluence pages with fresh authoritative no-children evidence and current version/ownership are eligible; absence of such evidence disables Trash. Cloud uses page trash with purge/draft disabled; Data Center uses page-only current-status trash. Read back trashed status, reconcile a lost response, never purge, and do not trash while dependent incoming-link repairs remain unverified. Other providers and filesystem export expose no unsupported deletion action. Restoring content remains an explicit operator recovery, never hidden creation.

7. **Prove native aliases.** Add a provider-aware verification normalization for redundant Confluence `ri:content-id` when fresh immutable-ID and exact title/space lookup agree. Normalize only that proved reference; do not ignore missing links or differing labels, titles, spaces, cells or macros. Destination reads needed for storage verification do not request server-rendered view content.

8. **Managed filesystem output retains paths.** Expand the selected source graph while reusing baseline payloads and manifest path assignments in staging; assign new paths without changing established ones, patch affected references/navigation, verify and atomically replace. Detect unmanaged or externally changed output before mutation. Provider trash is unavailable.

9. **Report operation, not cosmetic success.** Plan/job success means analysis persisted, not migration completion. Apply emits real object outcomes and a linked aggregate live report with selected/carried/excluded and link repair counts. Invalid inputs and stale plans return 2; provider/inventory failures return 1; successful analysis/application returns 0; signals retain 130/143. An empty application does not create a fabricated live transfer.

## Risks / Trade-offs

- Large first reference audit → bounded concurrency, persistent per-object checkpoints, typed progress and reuse of version-bound index entries.
- Provider title normalization can hide real target changes → require fresh ID plus exact title/space proof, then compare all meaningful content normally.
- Source or destination changes after preview → check frozen membership, effective policies, state and actual destination versions before writes; recheck every updated object and reject unowned drift.
- Providers do not offer cross-page transactions → preserve successful checkpoints and report partial application truthfully; never roll back by deleting pages or versions.
- A leaf cannot be proved on some deployments → disable Trash with a precise reason rather than infer it from incomplete accessible children.
- Legacy snapshots may lack sufficient evidence → classify unknown-baseline and require review instead of trusting a mutable cache blindly.
- Distinguish required source/context inventory from unrelated reference-audit gaps: the latter permit verified additions with an explicit coverage warning, but disable Trash because incoming links cannot be proved safe.
- Verify selected source file bytes by streamed download/SHA-256, not size or name alone. Pin checked files privately for rendering/application, revalidate weak provider evidence before applying, and invalidate only a selected stale byte cache under the state lease. Source-only decisions exports retain their no-resource-read contract.

## Migration Plan

All state additions are optional and identity calculation stays unchanged. Existing migrate/retry defaults remain compatible except that an explicitly confirmed trash exclusion is honored. Keep is synchronization-specific. New invocations use the shared jobs; old reports remain read-only. Document CLI/decisions/status conditions in the existing README sections and adjust contributor safety wording only for the explicit reversible-trash exception. Complete quality gates, archive/sync specifications and publish a Conventional Commit minor through the normal release flow without real-provider trash tests.
