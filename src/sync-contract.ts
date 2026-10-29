import { createHash } from "node:crypto";
import { z } from "zod";
import type {
	CommentInventory,
	MentionProcessingPolicy,
	SourcePage,
	SourceResource,
} from "./domain.js";
import type { HashtagProcessingPolicy } from "./hashtag-decisions.js";
import { mentionPolicyFingerprint, scanMentions } from "./mentions.js";
import { hashtagPolicyFingerprint } from "./hashtags.js";

/** Canonical object hashing; array order remains meaningful. */
export function stableHash(value: unknown): string {
	const normalize = (item: unknown): unknown =>
		Array.isArray(item)
			? item.map(normalize)
			: item && typeof item === "object"
				? Object.fromEntries(
						Object.entries(item)
							.filter(([, v]) => v !== undefined)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([k, v]) => [k, normalize(v)]),
					)
				: item;
	return createHash("sha256")
		.update(JSON.stringify(normalize(value)) ?? "undefined")
		.digest("hex");
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const syncEvidenceSchema = z
	.object({
		bodyHash: digest,
		hierarchyHash: digest,
		resourceHash: digest,
		commentHash: digest,
		policyHash: digest,
		sourceHash: digest,
		snapshot: z.string().optional(),
	})
	.strict();
export type SyncEvidence = z.infer<typeof syncEvidenceSchema>;
export const syncKeepSchema = z
	.object({ sourceHash: digest, decidedAt: z.string() })
	.strict();
export type SyncKeep = z.infer<typeof syncKeepSchema>;
export const syncExclusionSchema = z
	.object({
		reason: z.literal("operator-trash"),
		planId: z.string().uuid(),
		destinationId: z.string().min(1),
		confirmedAt: z.string(),
	})
	.strict();
const syncDecisionSchema = z.enum(["update", "keep", "trash"]);
export type SyncExclusion = z.infer<typeof syncExclusionSchema>;
const syncDecisionsSchema = z
	.object({
		planId: z.string().uuid(),
		decisions: z.record(z.string().min(1), syncDecisionSchema),
	})
	.strict();
export type SyncDecisions = z.infer<typeof syncDecisionsSchema>;
export function parseSyncDecisions(value: unknown): SyncDecisions {
	const parsed = syncDecisionsSchema.safeParse(value);
	if (!parsed.success)
		throw new Error(
			`Invalid synchronization decisions: ${[...new Set(parsed.error.issues.map((i) => i.path.join(".") || "document"))].join(", ")}`,
		);
	return parsed.data;
}

function resourceUrl(value: string | undefined): string | undefined {
	if (!value) return undefined;
	try {
		const url = new URL(value);
		for (const key of [...url.searchParams.keys()])
			if (/^(?:x-amz-|signature$|expires$|access_token$|token$)/i.test(key))
				url.searchParams.delete(key);
		url.searchParams.sort();
		return url.toString();
	} catch {
		return value;
	}
}
function syncResourceHash(
	resources: readonly SourceResource[],
	resourceBytes: Record<string, { sha256?: string }> = {},
): string {
	return stableHash(
		resources
			.map((r) =>
				resourceBytes[r.id]?.sha256
					? {
							id: r.id,
							name: r.name,
							preferredName: r.preferredName,
							kind: r.kind,
							mimeType: r.mimeType,
							embedded: r.embedded,
							diagramKind: r.metadata?.diagramKind,
						}
					: {
							id: r.id,
							name: r.name,
							preferredName: r.preferredName,
							kind: r.kind,
							size: r.size,
							mimeType: r.mimeType,
							downloadUrl: resourceUrl(r.downloadUrl),
							sourceUrl: resourceUrl(r.sourceUrl),
							aliases: r.referenceAliases?.map(resourceUrl).sort(),
							embedded: r.embedded,
							metadata: resourceMetadata(r),
							unavailable: r.inventoryFailure
								? { code: r.inventoryFailure.code }
								: undefined,
						},
			)
			.sort((a, b) => a.id.localeCompare(b.id)),
	);
}
function resourceMetadata(resource: SourceResource): unknown {
	const metadata = resource.metadata;
	if (!metadata) return metadata;
	if (
		resource.kind === "grid" &&
		metadata.grid &&
		typeof metadata.grid === "object"
	) {
		const {
			revision: _revision,
			page: _page,
			...grid
		} = metadata.grid as Record<string, unknown>;
		return { ...metadata, grid };
	}
	if (metadata.attachment && typeof metadata.attachment === "object") {
		const attachment = metadata.attachment as Record<string, unknown>,
			links = attachment._links as Record<string, unknown> | undefined;
		return {
			...metadata,
			attachment: {
				...attachment,
				...(links
					? {
							_links: {
								...links,
								...(typeof links.download === "string"
									? { download: resourceUrl(links.download) }
									: {}),
							},
						}
					: {}),
			},
		};
	}
	return metadata;
}
export function createSyncEvidence(
	page: SourcePage,
	resources: readonly SourceResource[],
	comments: CommentInventory | undefined,
	policies: {
		mentions: MentionProcessingPolicy;
		hashtags: HashtagProcessingPolicy;
	},
	resourceBytes: Record<string, { sha256?: string; size?: number }> = {},
): SyncEvidence {
	const bodies: Array<{ body: string; format: SourcePage["rawFormat"] }> = [
		{ body: page.rawContent, format: page.rawFormat },
	];
	const entries =
			comments?.status === "skipped"
				? []
				: (comments?.threads.map((t) => t.root) ?? []),
		commentData: unknown[] = [];
	while (entries.length) {
		const entry = entries.pop()!;
		bodies.push({
			body: entry.body,
			format: entry.bodyFormat ?? page.rawFormat,
		});
		if (entry.inlineContext)
			bodies.push({
				body: entry.inlineContext,
				format: entry.bodyFormat ?? page.rawFormat,
			});
		commentData.push({
			id: entry.id,
			parentId: entry.parentId,
			threadId: entry.threadId,
			author: entry.author,
			createdAt: entry.createdAt,
			body: entry.body,
			bodyFormat: entry.bodyFormat,
			inlineContext: entry.inlineContext,
			status: entry.status,
			attachments: entry.attachments.map((a) => ({
				raw: a.raw,
				href: a.href,
				label: a.label,
			})),
		});
		entries.push(...entry.replies);
	}
	const identities = bodies.flatMap((item) =>
		scanMentions(item.body, item.format).mentions.map((m) => m.identity),
	);
	const parts = {
		bodyHash: stableHash({
			title: page.title,
			body: page.rawContent.replace(/\r\n?/g, "\n"),
			format: page.rawFormat,
			availability: page.contentAvailability,
			relativeBase: page.references.some(
				(r) =>
					r.href &&
					!r.href.startsWith("#") &&
					!/^[a-z][a-z\d+.-]*:/i.test(r.href),
			)
				? page.url
				: undefined,
		}),
		hierarchyHash: stableHash({
			parent: page.parentId,
			ancestors: page.ancestorIds ?? [],
			projectedParent:
				"projectedParentId" in page ? page.projectedParentId : undefined,
		}),
		resourceHash: stableHash({
			metadata: syncResourceHash(resources, resourceBytes),
			bytes: resources
				.filter((r) => r.kind !== "grid" && resourceBytes[r.id]?.sha256)
				.map((r) => ({
					id: r.id,
					sha256: resourceBytes[r.id]!.sha256,
					size: resourceBytes[r.id]!.size,
				}))
				.sort((a, b) => a.id.localeCompare(b.id)),
		}),
		commentHash: stableHash(
			comments && comments.status !== "skipped"
				? {
						status: comments.status === "empty" ? "complete" : comments.status,
						entries: commentData,
						comments: comments.comments,
					}
				: null,
		),
		policyHash: stableHash({
			mentions: mentionPolicyFingerprint(policies.mentions, identities),
			hashtags: bodies.map((item) =>
				hashtagPolicyFingerprint(policies.hashtags, item.body, item.format),
			),
		}),
	};
	return { ...parts, sourceHash: stableHash(parts) };
}

export type SyncClassification =
	| "add"
	| "unchanged"
	| "changed"
	| "unknown-baseline"
	| "kept"
	| "excluded"
	| "blocked";
export function classifySyncPage(input: {
	observed: SyncEvidence;
	mapped: boolean;
	prior?: SyncEvidence;
	keep?: SyncKeep;
	excluded?: boolean;
	equivalent?: boolean;
}): { classification: SyncClassification; reasons: string[] } {
	if (input.excluded)
		return { classification: "excluded", reasons: ["operator-trash"] };
	if (!input.mapped)
		return { classification: "add", reasons: ["newly-accessible-source"] };
	if (input.keep?.sourceHash === input.observed.sourceHash)
		return { classification: "kept", reasons: ["kept-source-revision"] };
	if (input.equivalent)
		return { classification: "unchanged", reasons: ["verified-equivalent"] };
	if (!input.prior)
		return {
			classification: "unknown-baseline",
			reasons: ["source-baseline-unavailable"],
		};
	const reasons = (
		[
			"bodyHash",
			"hierarchyHash",
			"resourceHash",
			"commentHash",
			"policyHash",
		] as const
	)
		.filter((k) => input.prior![k] !== input.observed[k])
		.map((k) => k.replace("Hash", ""));
	return { classification: reasons.length ? "changed" : "unchanged", reasons };
}

const syncItemSchema = z
	.object({
		id: z.string().min(1),
		sourceId: z.string().min(1),
		title: z.string(),
		sourceUrl: z.string(),
		parentId: z.string().optional(),
		destinationId: z.string().optional(),
		destinationUrl: z.string().optional(),
		classification: z.enum([
			"add",
			"unchanged",
			"changed",
			"unknown-baseline",
			"kept",
			"excluded",
			"blocked",
		]),
		reasons: z.array(z.string()),
		evidence: syncEvidenceSchema,
		resources: z.number().int().nonnegative(),
		comments: z.number().int().nonnegative(),
		trash: z
			.object({ allowed: z.boolean(), reason: z.string().optional() })
			.strict(),
	})
	.strict();
const syncPlanSchema = z
	.object({
		id: z.string().uuid(),
		createdAt: z.string(),
		baselineRunId: z.string().min(1),
		stateId: z.string().min(1),
		sourceRootId: z.string().min(1),
		sourceUrl: z.string(),
		destinationUrl: z.string().optional(),
		status: z.enum(["review", "partial", "applied"]),
		revision: digest,
		items: z.array(syncItemSchema),
		inventory: z
			.object({
				complete: z.boolean(),
				selected: z.number().int().nonnegative(),
				failures: z.array(
					z
						.object({
							pageId: z.string().optional(),
							code: z.string(),
							message: z.string(),
						})
						.strict(),
				),
			})
			.strict(),
		references: z
			.object({
				unreadable: z
					.array(
						z
							.object({
								pageId: z.string(),
								code: z.string(),
								message: z.string(),
							})
							.strict(),
					)
					.optional(),
				pages: z.number().int().nonnegative(),
				comments: z.number().int().nonnegative(),
				patches: z.number().int().nonnegative(),
				unresolved: z.number().int().nonnegative(),
			})
			.strict(),
		result: z
			.object({
				runId: z.string().optional(),
				reportHtml: z.string().optional(),
				status: z.string(),
			})
			.strict()
			.optional(),
	})
	.strict();
export type SyncPlanItem = z.infer<typeof syncItemSchema>;
export type SyncPlan = z.infer<typeof syncPlanSchema>;
export interface SyncRunMetadata {
	planId: string;
	baselineRunId: string;
	added: number;
	updated: number;
	reused: number;
	kept: number;
	excluded: number;
	linkPatches: number;
	unresolvedReferences: number;
}
export function parseSyncPlan(value: unknown): SyncPlan {
	const result = syncPlanSchema.safeParse(value);
	if (!result.success)
		throw new Error(
			`Invalid synchronization plan at ${result.error.issues[0]?.path.join(".") ?? "document"}`,
		);
	return result.data;
}
