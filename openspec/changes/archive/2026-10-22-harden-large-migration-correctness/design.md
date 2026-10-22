# Design

## Context

See `proposal.md` for motivation. The transfer pipeline already preserves immutable source/destination mappings and checkpoints successful mutations, but some later verification and reporting stages discard or misclassify that evidence. Large reports also embed untrusted source-derived preview strings into a generated single-file shell.

## Goals / Non-Goals

**Goals:**

- Make verification depend on canonical identities and semantic payload rather than provider serialization.
- Preserve monotonic evidence: a later inability to read an uploaded object must not rewrite a confirmed upload into an absent object.
- Make issue and retry totals describe the latest unresolved state.
- Keep report generation safe and practical for large runs.
- Recover transient destination inconsistencies without adopting unrelated objects.

**Non-Goals:**

- Pixel-identical rendering across providers.
- Automatic deletion of duplicate, stale, or destination-only content.
- Infinite retries or suppression of persistent provider/permission failures.
- Downloading source-external media.

## Decisions

### Canonicalize reference identity before comparing content

Semantic extraction will resolve Confluence `ri:content-id`, `ri:content-title`, and ywtc-rendered page references through the current destination mapping. Link signatures will contain canonical destination identity, label, and anchor. Unknown references remain literal and are compared conservatively.

This is preferred over ignoring link destinations because it accepts serialization normalization without hiding an actual misdirected link.

### Model upload evidence and verification separately

Resource state will retain destination ID/name/size/hash evidence returned by upload. A verification access or transport error produces an uploaded-but-unverified outcome and a retryable verification issue; a proven absence or mismatch remains a failed resource. Retry reuses upload evidence and reconciles before considering another upload.

This is preferred over treating every verification exception as upload failure because duplicate uploads are more damaging than an explicitly unverified object.

### Reuse confirmed-consistency recovery at staging boundaries

Not-found responses involving a previously confirmed space, parent, or mapped page will pass through the existing bounded read/reconcile loop. Ambiguous permission-like creation failures receive typed diagnostics and do not become ownership conflicts. Descendants remain blocked only after the parent actually fails.

### Keep comment attachment work lazy

The comment pipeline will not list destination resources until it has a ZIP or full-text attachment to reconcile. Comment create/update/read-back therefore remains independent of attachment permissions for the common no-file case.

### Track recovery as lifecycle state, not warning text

Typed issues gain a resolved lifecycle marker. The collector retains audit history but exposes unresolved warning/error/retryable counts separately. Final object outcomes remain the authority for retry selection. Existing report consumers continue receiving current issues; recovered events are presented separately.

### Use callback replacement and bounded preview payloads

The report generator will replace its unique marker through a callback so `$` sequences in serialized data remain literal. Tests assert exactly one document boundary and a decoded round trip. Full previews remain embedded for non-complete pages; complete-page previews are bounded to a configurable safe length with an explicit truncation marker while sanitized metadata remains complete in `report.json`.

Callback replacement is mandatory even if escaping is strengthened, because replacement-string interpretation happens after serialization. Bounded previews are preferred over removing comparison entirely.

### Protect non-YFM template syntax before vendor parsing

Known code blocks and literal template-shaped tokens that are not declared YFM variables will be tokenized before Diplodoc and restored afterward. If the preferred renderer still emits no meaningful content, a deterministic basic renderer is attempted before raw fallback.

## Risks / Trade-offs

- [Unknown destination link cannot be canonicalized] → retain the literal target and fail verification if equivalence cannot be proven.
- [Upload response lacks sufficient evidence] → keep the resource failed/unverified and do not claim completion.
- [Bounded complete-page preview omits useful detail] → retain full previews for every problematic page and label truncation explicitly.
- [Template protection hides a legitimate YFM variable] → limit protection to code contexts and expressions that fail the supported YFM-variable grammar.
- [Transient retry increases provider load] → reuse configured rate limits, jitter, and strict attempt bounds.

## Migration Plan

No state identity or CLI migration is required. Existing failed, partial, blocked, and recovered outcomes are re-evaluated by an ordinary rerun or `ywtc retry`; confirmed mappings and upload evidence are reused. Rollback is a package downgrade because the change adds no destructive state conversion.
