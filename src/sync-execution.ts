import { readFile } from "node:fs/promises";
import path from "node:path";
import PQueue from "p-queue";
import { createProviderAdapter } from "./adapters/factory.js";
import { secretValues, type AppConfig } from "./config.js";
import type {
	CommentInventory,
	DestinationComment,
	DestinationPage,
	PageGraph,
	SourceAdapter,
	SourcePage,
	SourceResource,
	UploadedResource,
} from "./domain.js";
import { discoverPageGraph } from "./graph.js";
import { IncompleteSourceDiscoveryError } from "./domain.js";
import { atomicJson } from "./jobs/store.js";
import { acquireExclusiveLease } from "./exclusive-lease.js";
import { boundedPath } from "./local-paths.js";
import {
	resolveDestinationLocator,
	resolveSourceLocator,
	profileBaseUrl,
} from "./locators.js";
import { redact, type Logger } from "./logger.js";
import { Migrator, type TransferOptions } from "./migrator.js";
import type {
	OperationHooks,
	OperationResult,
	PreparedOperation,
} from "./operations.js";
import { verifyProviderContent } from "./provider-verification.js";
import type {
	TransferReportData,
	TransferReportPage,
} from "./report-contract.js";
import { buildRetryPlan, type RetryExecution } from "./retry-plan.js";
import { resolveRetryBaseline, type RetryBaseline } from "./retry-report.js";
import { resolveSourceRoot } from "./source-roots.js";
import { StateStore, type TransferState } from "./state.js";
import {
	classifySyncPage,
	createSyncEvidence,
	stableHash,
	type SyncEvidence,
	type SyncPlan,
	type SyncRunMetadata,
} from "./sync-contract.js";
import {
	patchSyncLinks,
	patchMarkdownSyncLinks,
	patchNativeTrashLinks,
	createSyncLinkIndex,
	type SyncLinkTarget,
} from "./sync-references.js";
import { exportEvidence } from "./selective-execution.js";
import { indexSyncReferences, type SyncReferenceIntent } from "./sync-index.js";
import { ContinuousProgress } from "./progress.js";
import { checkSyncFiles, copyCheckedSyncFile } from "./sync-files.js";
import type { FileFingerprint } from "./resource-reconciliation.js";
import { SyncPlanStore, SyncPlanValidationError } from "./sync-store.js";
import type { Workspace } from "./workspace.js";

interface SourceRecord {
	files: Record<string, FileFingerprint>;
	page: SourcePage;
	resources: SourceResource[];
	comments?: CommentInventory;
	evidence: SyncEvidence;
}
interface ReadRecord {
	page: DestinationPage;
	comment?: DestinationComment;
	resources?: UploadedResource[];
}
export interface PreparedSync {
	links: SyncReferenceIntent[];
	sourceScope: TransferOptions["scope"];
	exportHash?: string;
	baseline: RetryBaseline;
	graph: PageGraph;
	records: Record<string, SourceRecord>;
	reads: Record<string, ReadRecord>;
	previews: Record<string, { current: string; proposed: string }>;
	state: TransferState;
	bindings: PreparedOperation["bindings"];
	policies: {
		mentions: PreparedOperation["mentions"];
		hashtags: PreparedOperation["hashtags"];
	};
	sourceSelector: string;
	graphHash: string;
	owned?: Record<string, ReadRecord>;
	result?: OperationResult;
}
const noMutations = new Set([
	"createPage",
	"updatePage",
	"reparentPage",
	"uploadResource",
	"createArchiveComment",
	"updateArchiveComment",
	"trashPage",
]);
const quiet: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function mappedPage(
	state: TransferState,
	id: string,
	provider: DestinationPage["provider"],
	profile: string,
): DestinationPage {
	const row =
		state.container?.sourceCanonicalId === id
			? state.container
			: state.pages[id];
	if (!row?.destinationId)
		throw new SyncPlanValidationError(`Missing immutable mapping: ${id}`);
	return {
		id: row.destinationId,
		canonicalId:
			row.destinationCanonicalId ??
			`${profile}:${provider}:${row.destinationId}`,
		provider,
		profile,
		title: row.destinationTitle,
		locator: row.destinationLocator ?? row.destinationId,
		url: "",
	};
}
function assertOwnership(state: TransferState): void {
	const ids = new Set<string>();
	for (const row of [
		...(state.container ? [state.container] : []),
		...Object.values(state.pages),
	]) {
		if (row.conflictEvidence)
			throw new SyncPlanValidationError(
				`Unresolved ownership: ${row.sourceCanonicalId}`,
			);
		if (!row.destinationId) continue;
		if (ids.has(row.destinationId))
			throw new SyncPlanValidationError(
				`Several sources own destination ${row.destinationId}`,
			);
		ids.add(row.destinationId);
	}
}
function selection(
	base: TransferReportData,
	graph: PageGraph,
): TransferReportData {
	const expanded = structuredClone(base),
		byId = new Map(expanded.pages.map((p) => [p.sourceCanonicalId, p]));
	for (const page of graph.pages) {
		if (page.sourceSpace) continue;
		const previous = byId.get(page.canonicalId);
		if (previous) {
			previous.sourceTitle = page.title;
			previous.sourceUrl = page.url;
			previous.depth = page.depth;
			if (page.projectedParentId)
				previous.projectedParentId = page.projectedParentId;
			else delete previous.projectedParentId;
			continue;
		}
		const row: TransferReportPage = {
			sourceCanonicalId: page.canonicalId,
			sourceId: page.id,
			sourceTitle: page.title,
			sourceUrl: page.url,
			depth: page.depth,
			status: "not-started",
			inventoryStatus: "pending",
			resources: 0,
			resourceItems: [],
			transferredBytes: 0,
			bytesUnknown: 0,
			links: 0,
			images: 0,
			tables: 0,
			grids: 0,
			codeBlocks: 0,
			degraded: false,
			resourceFallbacks: [],
			warnings: [],
			comments: {
				status: base.commentsEnabled ? "not-started" : "skipped",
				threads: 0,
				comments: 0,
				participants: 0,
				attachments: 0,
				bytes: 0,
			},
			...(page.parentId ? { sourceParentId: page.parentId } : {}),
			...(page.projectedParentId
				? {
						projectedParentId: page.projectedParentId,
						parentId: page.projectedParentId,
					}
				: {}),
			...(page.ancestorIds ? { sourceAncestorIds: page.ancestorIds } : {}),
		};
		expanded.pages.push(row);
		byId.set(row.sourceCanonicalId, row);
	}
	expanded.selection = {
		...(expanded.selection ?? graph.selection),
		returnedDescendants: Math.max(
			expanded.summary.returnedDescendants,
			expanded.pages.length - (base.source.kind === "space" ? 0 : 1),
		),
		selectedDescendants:
			expanded.pages.length - (base.source.kind === "space" ? 0 : 1),
		maximumDepth: Math.max(0, ...expanded.pages.map((p) => p.depth)),
	};
	expanded.summary.pages = expanded.pages.length;
	const freshIds = new Set(graph.pages.map((page) => page.canonicalId));
	expanded.edges = [
		...expanded.edges.filter((edge) => !freshIds.has(edge.from)),
		...graph.edges,
	];
	expanded.summary.returnedDescendants = expanded.selection.returnedDescendants;
	expanded.summary.selectedDescendants = expanded.selection.selectedDescendants;
	return expanded;
}
function execution(
	baseline: RetryBaseline,
	expanded: TransferReportData,
	selected: ReadonlySet<string>,
	comments: boolean,
): RetryExecution {
	const plan = buildRetryPlan(expanded);
	plan.retryPageIds = [...selected];
	plan.contextPageIds = [];
	plan.selectedResourceIds = {};
	plan.selectedCommentPageIds = [];
	plan.discoveryIncomplete = false;
	plan.carriedForward = expanded.pages.length - selected.size;
	for (const item of Object.values(plan.pages)) {
		item.retryPage = selected.has(item.pageId);
		item.decision = item.retryPage ? "retry" : "resolved";
		item.resourceIds = [];
		item.retryComments = item.retryPage && comments;
		if (item.retryComments) plan.selectedCommentPageIds.push(item.pageId);
	}
	const byId = new Map(expanded.pages.map((p) => [p.sourceCanonicalId, p]));
	const contexts = new Set<string>();
	for (const id of selected) {
		let current = byId.get(id);
		const seen = new Set<string>();
		while (current) {
			const parent = current.projectedParentId ?? current.parentId;
			if (!parent || !byId.has(parent)) break;
			if (seen.has(parent))
				throw new SyncPlanValidationError("Hierarchy cycle");
			seen.add(parent);
			if (!selected.has(parent)) contexts.add(parent);
			current = byId.get(parent);
		}
	}
	plan.contextPageIds = [...contexts];
	for (const id of contexts) plan.pages[id]!.decision = "context";
	plan.remainingRetryable = selected.size;
	return {
		rootRunId: baseline.rootRunId,
		parentRunId: baseline.baseline.runId,
		attempt: baseline.attempt,
		baseline: expanded,
		plan,
	};
}
function frozenSource<T extends SourceAdapter>(
	adapter: T,
	records: Record<string, SourceRecord>,
): T {
	const byId = new Map(Object.values(records).map((r) => [r.page.id, r]));
	return new Proxy(adapter, {
		get(target, property) {
			if (property === "downloadResource")
				return async (
					resource: SourceResource,
					filename: string,
					page?: SourcePage,
				) => {
					const checked = byId.get(resource.pageId)?.files[resource.id];
					return checked
						? copyCheckedSyncFile(checked, filename)
						: target.downloadResource(resource, filename, page);
				};
			if (property === "getPage")
				return async (id: string) =>
					byId.has(id)
						? structuredClone(byId.get(id)!.page)
						: target.getPage(id);
			if (property === "listResources")
				return async (page: SourcePage) =>
					records[page.canonicalId]
						? structuredClone(records[page.canonicalId]!.resources)
						: target.listResources(page);
			if (property === "readComments")
				return async (page: SourcePage) =>
					records[page.canonicalId]?.comments
						? structuredClone(records[page.canonicalId]!.comments)
						: target.readComments?.(page);
			const member = Reflect.get(target, property);
			return typeof member === "function" ? member.bind(target) : member;
		},
	});
}
function readHash(record: ReadRecord): string {
	return stableHash({
		page: {
			id: record.page.id,
			title: record.page.title,
			parent: record.page.parentId,
			version: record.page.version,
			body: record.page.content,
		},
		comment: record.comment,
		resources: record.resources
			?.map((r) => ({
				id: r.id,
				name: r.name,
				size: r.size,
				fingerprint: r.fingerprint,
			}))
			.sort((a, b) => a.id.localeCompare(b.id)),
	});
}
function protectedUrls(policies: PreparedSync["policies"]): Set<string> {
	return new Set([
		...(policies.mentions.mode === "mapping"
			? policies.mentions.document.entries.flatMap((e) =>
					e.decision === "url" ? [e.url] : [],
				)
			: []),
		...(policies.hashtags.mode === "mapping"
			? policies.hashtags.document.entries.flatMap((e) =>
					e.decision === "url" ? [e.url] : [],
				)
			: []),
	]);
}
function linkTargets(
	prepared: PreparedSync,
	state = prepared.state,
	trash = new Set<string>(),
): SyncLinkTarget[] {
	return prepared.baseline.baseline.pages
		.concat(
			prepared.graph.pages
				.filter(
					(p) =>
						!prepared.baseline.baseline.pages.some(
							(b) => b.sourceCanonicalId === p.canonicalId,
						),
				)
				.map(
					(p) =>
						({
							sourceCanonicalId: p.canonicalId,
							sourceUrl: p.url,
						}) as TransferReportPage,
				),
		)
		.map((row) => {
			const current = prepared.records[row.sourceCanonicalId]?.page,
				read =
					prepared.owned?.[row.sourceCanonicalId] ??
					prepared.reads[row.sourceCanonicalId],
				mapping = state.pages[row.sourceCanonicalId];
			return {
				id: row.sourceCanonicalId,
				...(mapping?.destinationId
					? { destinationId: mapping.destinationId }
					: {}),
				...(read?.page.title ? { destinationTitle: read.page.title } : {}),
				...(read?.page.space ? { destinationSpace: read.page.space } : {}),
				sourceUrl: current?.url ?? row.sourceUrl,
				aliases: [
					row.sourceUrl,
					...(row.destinationUrl ? [row.destinationUrl] : []),
				],
				...(read?.page.url &&
				mapping &&
				["complete", "partial"].includes(mapping.status)
					? { destinationUrl: read.page.url }
					: mapping?.destinationId &&
							["complete", "partial"].includes(mapping.status)
						? { destinationUrl: row.destinationUrl }
						: {}),
				...(trash.has(row.sourceCanonicalId) || mapping?.exclusion
					? { excluded: true }
					: {}),
			};
		});
}

export async function analyzeSync(
	prepared: PreparedOperation,
	config: AppConfig,
	workspace: Workspace,
	hooks: OperationHooks = {},
	factory: typeof createProviderAdapter = createProviderAdapter,
): Promise<OperationResult> {
	const progress = new ContinuousProgress(undefined, {
		...(hooks.onEvent ? { onEvent: hooks.onEvent } : {}),
		redact: (value) => redact(value, secretValues(config)),
	});
	try {
		return await analyzeSyncInternal(
			prepared,
			config,
			workspace,
			hooks,
			factory,
			progress,
		);
	} finally {
		progress.stop();
	}
}

async function analyzeSyncInternal(
	prepared: PreparedOperation,
	config: AppConfig,
	workspace: Workspace,
	hooks: OperationHooks = {},
	factory: typeof createProviderAdapter = createProviderAdapter,
	progress: ContinuousProgress,
): Promise<OperationResult> {
	progress.phase("Sync · restoring migration identity");
	const request = prepared.request;
	if (request.kind !== "sync-plan")
		throw new SyncPlanValidationError("Expected sync analysis");
	const baseline = await resolveRetryBaseline(
			workspace.reportsDirectory,
			request.runId,
			workspace.root,
		),
		inv = baseline.invocation;
	const sourceLocator = resolveSourceLocator(
			config,
			inv.source.locator,
			inv.source.profile,
		),
		destination = resolveDestinationLocator({
			config,
			value:
				inv.destination.type === "remote"
					? inv.destination.locator
					: inv.destination.path,
			...(inv.destination.type === "remote"
				? { profile: inv.destination.profile }
				: { format: inv.destination.format }),
			cwd: workspace.root,
		});
	const source = factory(sourceLocator.profile, config),
		dest =
			destination.type === "remote"
				? factory(destination.profile, config)
				: undefined;
	const rawState = JSON.parse(
		await readFile(
			await boundedPath(
				workspace.root,
				path.relative(workspace.root, inv.state.path),
			),
			"utf8",
		),
	) as TransferState;
	const reader = new StateStore(inv.state.path);
	const state = structuredClone(
		await reader.load(rawState.identity, { dryRun: true }),
	);
	assertOwnership(state);
	if (
		sourceLocator.profile.name !== state.identity.source.profile ||
		sourceLocator.profile.type !== state.identity.source.provider ||
		profileBaseUrl(sourceLocator.profile) !== state.identity.source.instance
	)
		throw new SyncPlanValidationError(
			"Source connection does not match the recorded instance",
		);
	if (destination.type === "remote") {
		const identity = state.identity.destination;
		if (
			identity.provider === "filesystem" ||
			destination.profile.name !== identity.profile ||
			destination.profile.type !== identity.provider ||
			profileBaseUrl(destination.profile) !== identity.instance
		)
			throw new SyncPlanValidationError(
				"Destination connection does not match the recorded instance",
			);
		destination.value = identity.objectId;
	}
	if (!state.identity.source.objectId.startsWith("space:"))
		sourceLocator.value = state.identity.source.objectId;
	const represented = new Set(
		baseline.baseline.pages.map((page) => page.sourceCanonicalId),
	);
	if (
		Object.values(state.pages).some(
			(page) =>
				page.destinationId &&
				!page.exclusion &&
				!represented.has(page.sourceCanonicalId),
		)
	)
		throw new SyncPlanValidationError(
			"This report does not cover all current mappings; choose the latest complete migration report before synchronization",
		);
	const originalRoot = await resolveSourceRoot(source, sourceLocator.value);
	if (originalRoot.id !== state.identity.source.objectId)
		throw new SyncPlanValidationError("Source immutable root changed");
	const scopedRoot = request.source
		? await resolveSourceRoot(source, request.source)
		: originalRoot;
	if (
		scopedRoot.id !== originalRoot.id &&
		!scopedRoot.ancestorIds?.includes(originalRoot.id) &&
		!(
			originalRoot.sourceSpace &&
			[originalRoot.sourceSpace.id, originalRoot.sourceSpace.key].includes(
				scopedRoot.space ?? "",
			)
		)
	)
		throw new SyncPlanValidationError(
			"Selected source lies outside the original migration",
		);
	hooks.onEvent?.({
		type: "message",
		message: `Sync discovery · ${scopedRoot.title}`,
	});
	progress.phase(`Sync discovery · ${scopedRoot.title}`);
	let discoveryError: unknown;
	let graph = await discoverPageGraph({
		adapter: source,
		root: scopedRoot,
		scope: request.source ? "subtree" : inv.scope,
		sourceStatus: inv.sourceStatus,
		...(hooks.signal ? { signal: hooks.signal } : {}),
		onProgress: (p) =>
			hooks.onEvent?.({
				type: "message",
				message: `Sync discovery · ${p.pages} pages`,
			}),
	}).catch((error) => {
		if (hooks.signal?.aborted) throw error;
		discoveryError = error;
		return {
			rootId: originalRoot.canonicalId,
			pages:
				error instanceof IncompleteSourceDiscoveryError
					? error.pages
					: [{ ...scopedRoot, depth: 0 }],
			edges: [],
			warnings: [],
			selection:
				error instanceof IncompleteSourceDiscoveryError
					? error.selection
					: {
							requestedStatus: inv.sourceStatus,
							effectiveStatus: inv.sourceStatus,
							returnedDescendants: 0,
							selectedDescendants: 0,
							excluded: [],
							maximumDepth: 0,
							hierarchyGaps: [],
							notes: ["Hierarchy inventory is incomplete"],
						},
		} as PageGraph;
	});
	if (discoveryError) {
		const failure =
			discoveryError instanceof IncompleteSourceDiscoveryError
				? discoveryError.failures.map((item) => ({
						pageId: item.page.canonicalId,
						code: item.code,
						message: redact(
							`${item.page.title}: ${item.message}`,
							secretValues(config),
						),
					}))
				: [
						{
							code: "sync-discovery-failed",
							message: redact(discoveryError, secretValues(config)),
						},
					];
		const partial: PreparedSync = {
			baseline,
			graph,
			records: {},
			reads: {},
			previews: {},
			links: [],
			state,
			bindings: prepared.bindings,
			policies: { mentions: prepared.mentions, hashtags: prepared.hashtags },
			sourceSelector:
				request.source ??
				(originalRoot.sourceSpace ? originalRoot.url : originalRoot.id),
			sourceScope: request.source ? "subtree" : inv.scope,
			graphHash: stableHash(graph.pages.map((page) => page.canonicalId).sort()),
		};
		const plan = await new SyncPlanStore(workspace.root).create(
			{
				baselineRunId: baseline.baseline.runId,
				stateId: baseline.baseline.state.id,
				sourceRootId: originalRoot.id,
				sourceUrl: scopedRoot.url,
				status: "partial",
				items: [],
				inventory: {
					complete: false,
					selected: graph.pages.filter((page) => !page.sourceSpace).length,
					failures: failure,
				},
				references: { pages: 0, comments: 0, patches: 0, unresolved: 0 },
			},
			partial,
		);
		return { exitCode: 1, status: "partial", planId: plan.id };
	}
	const allIds = new Map([
		...baseline.baseline.pages.map(
			(p) => [p.sourceId, { id: p.sourceCanonicalId, depth: p.depth }] as const,
		),
		...graph.pages.map(
			(p) => [p.id, { id: p.canonicalId, depth: p.depth }] as const,
		),
	]);
	for (const page of graph.pages) {
		const chain = [
			...(page.ancestorIds ?? []),
			...(page.parentId && !(page.ancestorIds ?? []).includes(page.parentId)
				? [page.parentId]
				: []),
		];
		const ancestor = [...chain].reverse().find((id) => allIds.has(id));
		if (ancestor && ancestor !== page.id)
			page.projectedParentId = allIds.get(ancestor)!.id;
		page.depth =
			page.canonicalId === originalRoot.canonicalId
				? 0
				: ancestor
					? allIds.get(ancestor)!.depth + 1
					: page.depth;
		allIds.set(page.id, { id: page.canonicalId, depth: page.depth });
	}
	graph = { ...graph, rootId: originalRoot.canonicalId };
	const records: Record<string, SourceRecord> = {},
		failures: Array<{ pageId?: string; code: string; message: string }> = [],
		queue = new PQueue({ concurrency: prepared.concurrency });
	let sourceCompleted = 0,
		destinationCompleted = 0;
	progress.measure({
		phase: "Sync source inventory",
		completed: 0,
		total: graph.pages.length,
		unit: "pages",
	});
	await Promise.all(
		graph.pages.map((page) =>
			queue.add(async () => {
				if (page.sourceSpace) return;
				try {
					hooks.signal?.throwIfAborted();
					const resources = await source.listResources(page),
						comments = inv.comments
							? await source.readComments?.(page)
							: undefined;
					if (inv.comments && (!comments || comments.status === "failed"))
						throw new Error("Comment inventory is incomplete");
					const files = await checkSyncFiles(
						source,
						page,
						resources,
						workspace.cacheDirectory,
						hooks.signal,
						progress,
					);
					records[page.canonicalId] = {
						files,
						page: structuredClone(page),
						resources,
						...(comments ? { comments } : {}),
						evidence: createSyncEvidence(
							page,
							resources,
							comments,
							prepared,
							files,
						),
					};
				} catch (error) {
					failures.push({
						pageId: page.canonicalId,
						code: "sync-source-inventory-failed",
						message: redact(error, secretValues(config)),
					});
				} finally {
					sourceCompleted++;
					progress.measure({
						phase: "Sync source inventory",
						completed: sourceCompleted,
						total: graph.pages.length,
						unit: "pages",
						detail: page.title,
					});
				}
			}),
		),
	);
	const reads: PreparedSync["reads"] = {};
	const requiredIds = new Set(graph.pages.map((page) => page.canonicalId)),
		baselineParents = new Map(
			baseline.baseline.pages.map((page) => [
				page.sourceCanonicalId,
				page.projectedParentId ?? page.parentId,
			]),
		);
	for (const page of graph.pages) {
		let parent = page.projectedParentId;
		const seen = new Set<string>();
		while (parent && !seen.has(parent)) {
			seen.add(parent);
			requiredIds.add(parent);
			parent = baselineParents.get(parent);
		}
	}
	const referenceFailures: Array<{
		pageId: string;
		code: string;
		message: string;
	}> = [];
	progress.measure({
		phase: "Sync destination and reference audit",
		completed: 0,
		total: [
			...(baseline.baseline.container ? [baseline.baseline.container] : []),
			...baseline.baseline.pages,
		].filter(
			(page) =>
				(state.container?.sourceCanonicalId === page.sourceCanonicalId
					? state.container
					: state.pages[page.sourceCanonicalId]
				)?.destinationId && !state.pages[page.sourceCanonicalId]?.exclusion,
		).length,
		unit: "pages",
	});
	if (dest)
		await Promise.all(
			[
				...(baseline.baseline.container ? [baseline.baseline.container] : []),
				...baseline.baseline.pages,
			]
				.filter(
					(p) =>
						(state.container?.sourceCanonicalId === p.sourceCanonicalId
							? state.container
							: state.pages[p.sourceCanonicalId]
						)?.destinationId && !state.pages[p.sourceCanonicalId]?.exclusion,
				)
				.map((row) =>
					queue.add(async () => {
						try {
							hooks.signal?.throwIfAborted();
							const page = await dest.verifyPage(
								mappedPage(
									state,
									row.sourceCanonicalId,
									dest.kind,
									dest.profile.name,
								),
							);
							if (
								page.id !==
									(state.container?.sourceCanonicalId === row.sourceCanonicalId
										? state.container
										: state.pages[row.sourceCanonicalId])!.destinationId ||
								typeof page.content !== "string"
							)
								throw new Error(
									"Destination immutable ID or readable body is missing",
								);
							const commentId =
								state.pages[row.sourceCanonicalId]?.comments?.destinationId;
							const comment =
								commentId && dest.readArchiveComment
									? await dest.readArchiveComment({ page, commentId })
									: undefined;
							reads[row.sourceCanonicalId] = {
								page,
								...(comment ? { comment } : {}),
								...(Object.values(
									state.pages[row.sourceCanonicalId]?.resources ?? {},
								).some((r) => r.destinationId)
									? { resources: await dest.listUploadedResources(page) }
									: {}),
							};
						} catch (error) {
							(requiredIds.has(row.sourceCanonicalId)
								? failures
								: referenceFailures
							).push({
								pageId: row.sourceCanonicalId,
								code: "sync-destination-read-failed",
								message: redact(error, secretValues(config)),
							});
						} finally {
							destinationCompleted++;
							progress.measure({
								phase: "Sync destination and reference audit",
								completed: destinationCompleted,
								unit: "pages",
								detail: row.sourceTitle,
							});
						}
					}),
				),
		);
	const expanded = selection(baseline.baseline, graph),
		selected = new Set(
			graph.pages
				.filter((p) => !p.sourceSpace && !state.pages[p.canonicalId]?.exclusion)
				.map((p) => p.canonicalId),
		);
	const previews: PreparedSync["previews"] = {};
	if (!failures.length) {
		progress.stop();
		const previewRetry = execution(baseline, expanded, selected, inv.comments),
			previewGraph = structuredClone(graph);
		for (const id of previewRetry.plan.contextPageIds) {
			if (previewGraph.pages.some((page) => page.canonicalId === id)) continue;
			const row = expanded.pages.find((page) => page.sourceCanonicalId === id)!;
			const current = await source.getPage(row.sourceId);
			if (current.canonicalId !== id)
				throw new SyncPlanValidationError(
					"Context immutable identity mismatch",
				);
			previewGraph.pages.push({
				...current,
				depth: row.depth,
				...(row.projectedParentId
					? { projectedParentId: row.projectedParentId }
					: {}),
			});
		}
		if (
			originalRoot.sourceSpace &&
			!previewGraph.pages.some(
				(page) => page.canonicalId === originalRoot.canonicalId,
			)
		)
			previewGraph.pages.unshift({ ...originalRoot, depth: 0 });
		previewGraph.pages.sort(
			(a, b) => a.depth - b.depth || a.canonicalId.localeCompare(b.canonicalId),
		);
		const dry = await new Migrator(config, quiet, (profile, settings) =>
			profile.name === sourceLocator.profile.name
				? (frozenSource(factory(profile, settings), records) as ReturnType<
						typeof factory
					>)
				: new Proxy(factory(profile, settings), {
						get(target, property) {
							if (noMutations.has(String(property)))
								return () => {
									throw new Error("Sync analysis cannot mutate destination");
								};
							const member = Reflect.get(target, property);
							return typeof member === "function"
								? member.bind(target)
								: member;
						},
					}),
		).run({
			source: sourceLocator,
			destination,
			scope: inv.scope,
			sourceStatus: inv.sourceStatus,
			comments: inv.comments,
			dryRun: true,
			archive: inv.archive,
			concurrency: prepared.concurrency,
			runtimeDirectory: workspace.statesDirectory,
			cacheDirectory: workspace.cacheDirectory,
			reportsDirectory: workspace.reportsDirectory,
			stateFilename: inv.state.path,
			freshInventory: true,
			preparedGraph: previewGraph,
			retry: previewRetry,
			keptPageIds: new Set(previewRetry.plan.contextPageIds),
			mentionPolicy: prepared.mentions,
			hashtagPolicy: prepared.hashtags,
			onPreparedPage: (input) => {
				previews[input.page.canonicalId] = {
					current:
						reads[input.page.canonicalId]?.page.content ??
						input.destination.content ??
						"",
					proposed: input.body,
				};
			},
			...(hooks.signal ? { signal: hooks.signal } : {}),
			...(hooks.onEvent ? { onEvent: hooks.onEvent } : {}),
		});
		if (dry.hasErrors)
			failures.push({
				code: "sync-preview-incomplete",
				message:
					"Source rendering or dependencies could not be prepared; inspect the dry-run report",
			});
	}
	const reviewProgress = new ContinuousProgress(undefined, {
		...(hooks.onEvent ? { onEvent: hooks.onEvent } : {}),
	});
	reviewProgress.phase("Sync review · comparing evidence and indexing links");
	try {
		const data: PreparedSync = {
			baseline,
			graph,
			records,
			reads,
			previews,
			links: [],
			state,
			bindings: prepared.bindings,
			policies: { mentions: prepared.mentions, hashtags: prepared.hashtags },
			sourceSelector:
				request.source ??
				(originalRoot.sourceSpace ? originalRoot.url : originalRoot.id),
			sourceScope: request.source ? "subtree" : inv.scope,
			graphHash: stableHash(
				graph.pages.map((p) => [p.canonicalId, p.projectedParentId]).sort(),
			),
		};
		const items: SyncPlan["items"] = [];
		for (const page of graph.pages) {
			if (page.sourceSpace) continue;
			const record = records[page.canonicalId];
			if (!record) continue;
			const prior = state.pages[page.canonicalId],
				read = reads[page.canonicalId],
				preview = previews[page.canonicalId];
			const classified = classifySyncPage({
				observed: record.evidence,
				mapped: Boolean(prior?.destinationId),
				...(prior?.syncEvidence ? { prior: prior.syncEvidence } : {}),
				...(prior?.syncKeep ? { keep: prior.syncKeep } : {}),
				excluded: Boolean(prior?.exclusion),
			});
			if (
				destination.type === "directory" &&
				classified.classification === "unchanged" &&
				prior?.syncOutputHash &&
				preview &&
				stableHash(preview.current) !== prior.syncOutputHash
			) {
				classified.classification = "changed";
				classified.reasons.push("destination-export-differs");
			}
			if (
				classified.classification === "unchanged" &&
				preview &&
				read &&
				dest &&
				(
					await verifyProviderContent(
						preview.proposed,
						read.page.content,
						dest,
						page,
						read.page,
					)
				).status !== "complete"
			) {
				classified.classification = "changed";
				classified.reasons.push("destination-differs");
			}
			if (classified.classification === "unchanged" && read) {
				const previous = baseline.baseline.pages.find(
					(p) => p.sourceCanonicalId === page.canonicalId,
				);
				if (
					read.page.title !== prior?.destinationTitle ||
					(previous?.destinationParentId &&
						read.page.parentId !== previous.destinationParentId)
				) {
					classified.classification = "changed";
					classified.reasons.push("destination-title-or-parent");
				}
				if (
					read.resources &&
					Object.values(prior?.resources ?? {}).some(
						(r) =>
							r.status === "complete" &&
							r.destinationId &&
							!read.resources!.some(
								(actual) =>
									actual.id === r.destinationId &&
									actual.name === r.destinationName &&
									(actual.size === undefined ||
										r.size === undefined ||
										actual.size === r.size),
							),
					)
				) {
					classified.classification = "changed";
					classified.reasons.push("destination-resource-differs");
				}
			}
			let trash: SyncPlan["items"][number]["trash"] = {
				allowed: false,
				reason: "Provider cannot prove a reversible published leaf",
			};
			if (
				read &&
				dest?.trashEvidence &&
				dest.trashPage &&
				dest.verifyTrashedPage
			)
				try {
					const evidence = await dest.trashEvidence(read.page);
					trash = {
						allowed: evidence.allowed && evidence.version === read.page.version,
						...(evidence.reason ? { reason: evidence.reason } : {}),
					};
				} catch {
					trash = {
						allowed: false,
						reason: "Provider did not confirm reversible leaf trash",
					};
				}
			if (
				graph.pages.some(
					(child) => child.projectedParentId === page.canonicalId,
				)
			)
				trash = {
					allowed: false,
					reason: "The synchronization plan contains children of this page",
				};
			if (referenceFailures.length)
				trash = {
					allowed: false,
					reason: "Incoming reference audit is incomplete",
				};
			items.push({
				id: page.canonicalId,
				sourceId: page.id,
				title: page.title,
				sourceUrl: page.url,
				...(page.projectedParentId ? { parentId: page.projectedParentId } : {}),
				...(prior?.destinationId ? { destinationId: prior.destinationId } : {}),
				...(read?.page.url ? { destinationUrl: read.page.url } : {}),
				...classified,
				evidence: record.evidence,
				resources: record.resources.length,
				comments: record.comments?.comments ?? 0,
				trash,
			});
		}
		if (destination.type === "directory")
			data.exportHash = await exportEvidence(destination.path);
		const targets = createSyncLinkIndex(linkTargets(data)),
			protectedLinks = protectedUrls(data.policies);
		let patches = 0,
			unresolved = 0;
		for (const [id, record] of Object.entries(reads))
			for (const location of ["page", "comment"] as const) {
				const body =
						location === "page" ? record.page.content : record.comment?.body,
					version =
						location === "page" ? record.page.version : record.comment?.version;
				if (!body) continue;
				const indexed = await indexSyncReferences({
					workspace: workspace.root,
					stateId: baseline.baseline.state.id,
					pageId: id,
					location,
					body,
					...(record.page.space ? { space: record.page.space } : {}),
					...(version ? { version } : {}),
					provider: dest!.kind,
					base:
						records[id]?.page.url ??
						baseline.baseline.pages.find((p) => p.sourceCanonicalId === id)
							?.sourceUrl ??
						scopedRoot.url,
					targets,
					protectedUrls: protectedLinks,
				});
				data.links.push(...indexed.intents);
				patches += indexed.intents.filter((intent) => intent.needsPatch).length;
				unresolved += indexed.unresolved;
			}
		const plan = await new SyncPlanStore(workspace.root).create(
			{
				baselineRunId: baseline.baseline.runId,
				stateId: baseline.baseline.state.id,
				sourceRootId: originalRoot.id,
				sourceUrl: scopedRoot.url,
				...(baseline.baseline.destination.url
					? { destinationUrl: baseline.baseline.destination.url }
					: {}),
				status: failures.length ? "partial" : "review",
				items,
				inventory: {
					complete: !failures.length,
					selected: graph.pages.filter((p) => !p.sourceSpace).length,
					failures,
				},
				references: {
					...(referenceFailures.length
						? { unreadable: referenceFailures }
						: {}),
					pages: Object.keys(reads).length,
					comments: Object.values(reads).filter((r) => r.comment).length,
					patches,
					unresolved,
				},
			},
			data,
		);
		hooks.onEvent?.({
			type: "message",
			message: `Synchronization plan ${plan.id} · ${items.filter((i) => i.classification === "add").length} new · ${items.filter((i) => ["changed", "unknown-baseline"].includes(i.classification)).length} need decisions · ${items.filter((i) => ["unchanged", "kept"].includes(i.classification)).length} reused`,
		});
		return {
			exitCode: hooks.signal?.aborted
				? hooks.signal.reason?.exitCode === 143
					? 143
					: 130
				: failures.length
					? 1
					: 0,
			status: hooks.signal?.aborted
				? "cancelled"
				: failures.length
					? "partial"
					: referenceFailures.length
						? "completed-with-warnings"
						: "completed",
			planId: plan.id,
		};
	} finally {
		reviewProgress.stop();
	}
}

export async function applySync(
	prepared: PreparedOperation,
	config: AppConfig,
	workspace: Workspace,
	hooks: OperationHooks = {},
	factory: typeof createProviderAdapter = createProviderAdapter,
): Promise<OperationResult> {
	const request = prepared.request;
	if (request.kind !== "sync-apply")
		throw new SyncPlanValidationError("Expected sync apply");
	const directory = await new SyncPlanStore(workspace.root).directory(
			request.planId,
		),
		lease = await acquireExclusiveLease(
			path.join(directory, "edit.lock"),
			"synchronization application",
			request.planId,
		);
	const progress = new ContinuousProgress(undefined, {
		...(hooks.onEvent ? { onEvent: hooks.onEvent } : {}),
	});
	progress.phase(
		"Sync apply · validating source bytes and destination versions",
	);
	try {
		return await applySyncLocked(
			prepared,
			config,
			workspace,
			hooks,
			factory,
			progress,
		);
	} finally {
		progress.stop();
		await lease.release();
	}
}

async function applySyncLocked(
	prepared: PreparedOperation,
	config: AppConfig,
	workspace: Workspace,
	hooks: OperationHooks = {},
	factory: typeof createProviderAdapter = createProviderAdapter,
	progress: ContinuousProgress,
): Promise<OperationResult> {
	const request = prepared.request;
	if (request.kind !== "sync-apply")
		throw new SyncPlanValidationError("Expected sync apply");
	const plans = new SyncPlanStore(workspace.root),
		plan = await plans.get(request.planId),
		decisions = await plans.decisions(plan.id),
		saved = await plans.prepared<PreparedSync>(plan.id);
	const authority = await resolveRetryBaseline(
		workspace.reportsDirectory,
		plan.baselineRunId,
		workspace.root,
	);
	if (
		stableHash(authority.requested) !== stableHash(saved.baseline.baseline) ||
		plan.stateId !== authority.requested.state.id ||
		saved.baseline.invocation.state.path !== authority.invocation.state.path
	)
		throw new SyncPlanValidationError(
			"Plan baseline or state identity is inconsistent",
		);
	plans.validateDecisions(plan, decisions);
	if (request.revision !== plan.revision)
		throw new SyncPlanValidationError(
			"Plan decisions changed; refresh before applying",
		);
	if (plan.status === "applied")
		return (
			saved.result ?? { exitCode: 0, status: "completed", planId: plan.id }
		);
	if (stableHash(saved.bindings) !== stableHash(prepared.bindings))
		throw new SyncPlanValidationError(
			"Connection bindings changed; analyze again",
		);
	const trash = new Set(
		Object.entries(decisions.decisions)
			.filter(([, d]) => d === "trash")
			.map(([id]) => id),
	);
	if (trash.size && !request.confirmTrash)
		throw new SyncPlanValidationError(
			"Trash requires separate --confirm-trash confirmation",
		);
	const inv = saved.baseline.invocation,
		sourceLocator = resolveSourceLocator(
			config,
			inv.source.locator,
			inv.source.profile,
		),
		destination = resolveDestinationLocator({
			config,
			value:
				inv.destination.type === "remote"
					? inv.destination.locator
					: inv.destination.path,
			...(inv.destination.type === "remote"
				? { profile: inv.destination.profile }
				: { format: inv.destination.format }),
			cwd: workspace.root,
		});
	const source = factory(sourceLocator.profile, config),
		dest =
			destination.type === "remote"
				? factory(destination.profile, config)
				: undefined;
	if (!saved.state.identity.source.objectId.startsWith("space:"))
		sourceLocator.value = saved.state.identity.source.objectId;
	if (
		destination.type === "remote" &&
		saved.state.identity.destination.provider !== "filesystem"
	)
		destination.value = saved.state.identity.destination.objectId;
	const originalRoot = await resolveSourceRoot(source, sourceLocator.value),
		scopedRoot = await resolveSourceRoot(source, saved.sourceSelector),
		fresh = await discoverPageGraph({
			adapter: source,
			root: scopedRoot,
			scope: saved.sourceScope,
			sourceStatus: inv.sourceStatus,
			...(hooks.signal ? { signal: hooks.signal } : {}),
		});
	if (
		stableHash(fresh.pages.map((p) => p.canonicalId).sort()) !==
		stableHash(saved.graph.pages.map((p) => p.canonicalId).sort())
	)
		throw new SyncPlanValidationError(
			"Source membership changed; analyze again",
		);
	const records: PreparedSync["records"] = {},
		queue = new PQueue({ concurrency: prepared.concurrency });
	await Promise.all(
		fresh.pages
			.filter((p) => !p.sourceSpace)
			.map((page) =>
				queue.add(async () => {
					hooks.signal?.throwIfAborted();
					const resources = await source.listResources(page),
						comments = inv.comments
							? await source.readComments?.(page)
							: undefined,
						record = saved.records[page.canonicalId];
					if (!record)
						throw new SyncPlanValidationError(
							"Prepared source inventory is missing",
						);
					const projected = saved.graph.pages.find(
						(p) => p.canonicalId === page.canonicalId,
					)!;
					const full = {
						...page,
						...(projected.projectedParentId
							? { projectedParentId: projected.projectedParentId }
							: {}),
					};
					const files = await checkSyncFiles(
						source,
						full,
						resources,
						workspace.cacheDirectory,
						hooks.signal,
						progress,
					);
					const evidence = createSyncEvidence(
						full,
						resources,
						comments,
						prepared,
						files,
					);
					if (evidence.sourceHash !== record.evidence.sourceHash)
						throw new SyncPlanValidationError(
							`Source or effective decisions changed: ${page.title}; analyze again`,
						);
					records[page.canonicalId] = {
						files,
						page: full,
						resources,
						...(comments ? { comments } : {}),
						evidence,
					};
				}),
			),
	);
	const owned = {
		...saved.owned,
		...(await plans.checkpoints<ReadRecord>(plan.id)),
	};
	const guardReads = async () => {
		if (
			destination.type === "directory" &&
			saved.exportHash !== (await exportEvidence(destination.path))
		)
			throw new SyncPlanValidationError(
				"Managed export changed after preview; analyze again",
			);
		if (!dest) return;
		await Promise.all(
			Object.entries(saved.reads).map(([id, record]) =>
				queue.add(async () => {
					if (trash.has(id) && saved.state.pages[id]?.exclusion) return;
					const expected = owned[id] ?? record,
						page = await dest.verifyPage(expected.page);
					const comment =
						expected.comment && dest.readArchiveComment
							? await dest.readArchiveComment({
									page,
									commentId: expected.comment.id,
								})
							: undefined;
					if (
						readHash({
							page,
							...(comment ? { comment } : {}),
							...(expected.resources
								? { resources: await dest.listUploadedResources(page) }
								: {}),
						}) !== readHash(expected)
					)
						throw new SyncPlanValidationError(
							`Destination changed after preview: ${id}; analyze again`,
						);
				}),
			),
		);
	};
	await guardReads();
	hooks.signal?.throwIfAborted();
	const selected = new Set(
			plan.items
				.filter(
					(i) =>
						i.classification === "add" ||
						decisions.decisions[i.id] === "update",
				)
				.map((i) => i.id),
		),
		kept = new Set(
			plan.items
				.filter(
					(i) =>
						i.classification === "kept" || decisions.decisions[i.id] === "keep",
				)
				.map((i) => i.id),
		);
	if (!selected.size && !trash.size && !plan.references.patches) {
		const store = new StateStore(inv.state.path);
		await store.load(saved.state.identity);
		try {
			assertOwnership(store.value);
			for (const [id, row] of Object.entries(saved.state.pages))
				if (stableHash(store.value.pages[id]) !== stableHash(row))
					throw new SyncPlanValidationError(
						`State changed after preview: ${id}`,
					);
			for (const id of kept) {
				const row = store.page(id),
					item = plan.items.find((i) => i.id === id);
				if (row && item) {
					row.syncKeep = {
						sourceHash: item.evidence.sourceHash,
						decidedAt: new Date().toISOString(),
					};
					await store.setPage(row);
				}
			}
		} finally {
			await store.release();
		}
		const result: OperationResult = {
			exitCode: 0,
			status: "completed",
			planId: plan.id,
			runId: saved.baseline.baseline.runId,
			reportHtml: path.join(
				workspace.reportsDirectory,
				saved.baseline.baseline.runId,
				"index.html",
			),
		};
		saved.result = result;
		await plans.savePrepared(plan.id, saved);
		await plans.savePlan({
			...plan,
			status: "applied",
			result: { status: "no-transfer-required", runId: result.runId },
		});
		return result;
	}
	const expanded = selection(saved.baseline.baseline, saved.graph),
		retry = execution(saved.baseline, expanded, selected, inv.comments);
	for (const id of selected) {
		const changed = Object.entries(records[id]?.files ?? {})
			.filter(
				([resourceId, file]) =>
					saved.state.pages[id]?.resources[resourceId]?.sha256 !== file.sha256,
			)
			.map(([resourceId]) => resourceId);
		if (changed.length) {
			retry.plan.pages[id]!.resourceIds = changed;
			retry.plan.selectedResourceIds[id] = changed;
		}
	}
	const graphIds = new Set([...selected, ...retry.plan.contextPageIds]);
	const pages = [] as PageGraph["pages"];
	const available = new Map(saved.graph.pages.map((p) => [p.canonicalId, p]));
	for (const row of expanded.pages) {
		if (destination.type === "remote" && !graphIds.has(row.sourceCanonicalId))
			continue;
		let page = available.get(row.sourceCanonicalId);
		if (!page) {
			const current = await source.getPage(row.sourceId);
			if (current.canonicalId !== row.sourceCanonicalId)
				throw new SyncPlanValidationError(
					`Context identity mismatch: ${row.sourceCanonicalId}`,
				);
			page = {
				...current,
				depth: row.depth,
				...(row.projectedParentId
					? { projectedParentId: row.projectedParentId }
					: {}),
			};
		}
		pages.push(page);
	}
	const graph: PageGraph = {
		...saved.graph,
		pages: originalRoot.sourceSpace
			? [{ ...originalRoot, depth: 0 }, ...pages]
			: pages,
		selection: expanded.selection!,
		edges: expanded.edges,
	};
	const metadata: SyncRunMetadata = {
		planId: plan.id,
		baselineRunId: saved.baseline.baseline.runId,
		added: 0,
		updated: 0,
		reused: plan.items.filter((i) => i.classification === "unchanged").length,
		kept: kept.size,
		excluded: 0,
		linkPatches: 0,
		unresolvedReferences: 0,
	};
	const checkpointHashes = new Map(
		Object.entries(owned).map(([id, record]) => [id, readHash(record)]),
	);
	const checkpoint = async () => {
		for (const [id, record] of Object.entries(owned)) {
			const hash = readHash(record);
			if (checkpointHashes.get(id) === hash) continue;
			await plans.checkpoint(plan.id, id, record);
			checkpointHashes.set(id, hash);
		}
	};
	const wrapped: typeof factory = (profile, settings) => {
		const adapter = factory(profile, settings),
			frozen = frozenSource(adapter, records);
		return new Proxy(frozen, {
			get(target, property) {
				const member = Reflect.get(target, property);
				if (typeof member !== "function") return member;
				if (!noMutations.has(String(property))) return member.bind(target);
				return async (...args: any[]) => {
					hooks.signal?.throwIfAborted();
					const page: DestinationPage | undefined =
						args[0]?.page ??
						(args[0]?.comment
							? owned[
									Object.keys(owned).find(
										(id) => owned[id]?.comment?.id === args[0].comment.id,
									) ?? ""
								]?.page
							: undefined);
					if (page && dest) {
						const id =
								Object.keys(saved.state.pages).find(
									(id) => saved.state.pages[id]?.destinationId === page.id,
								) ??
								Object.keys(owned).find((id) => owned[id]?.page.id === page.id),
							expected = id ? (owned[id] ?? saved.reads[id]) : undefined;
						if (expected) {
							const actual = await adapter.verifyPage(page);
							if (stableHash(actual) !== stableHash(expected.page))
								throw new SyncPlanValidationError(
									"Object changed since its preview/checkpoint",
								);
							await atomicJson(
								path.join(
									await plans.directory(plan.id),
									"backups",
									`${stableHash(page.id)}-${stableHash(actual.version)}.json`,
								),
								{
									page: actual,
									...(expected.comment ? { comment: expected.comment } : {}),
								},
							);
						}
					}
					const result = await member.apply(target, args);
					const written: DestinationPage | undefined = [
						"createPage",
						"updatePage",
						"reparentPage",
					].includes(String(property))
						? result
						: page;
					if (written) {
						const id =
							Object.keys(saved.state.pages).find(
								(id) => saved.state.pages[id]?.destinationId === written.id,
							) ??
							plan.items.find(
								(i) =>
									selected.has(i.id) &&
									i.title === written.title &&
									!saved.state.pages[i.id]?.destinationId,
							)?.id;
						if (id) {
							const current = await adapter.verifyPage(written),
								old = owned[id] ?? saved.reads[id],
								comment = [
									"createArchiveComment",
									"updateArchiveComment",
								].includes(String(property))
									? result
									: old?.comment;
							owned[id] = {
								page: current,
								...(comment ? { comment } : {}),
								...(old?.resources || property === "uploadResource"
									? { resources: await adapter.listUploadedResources(current) }
									: {}),
							};
							await checkpoint();
						}
					}
					return result;
				};
			},
		});
	};
	const beforeRun: NonNullable<TransferOptions["beforeRun"]> = async ({
		state,
		source: root,
	}) => {
		if ((await plans.get(plan.id)).revision !== plan.revision)
			throw new SyncPlanValidationError("Decisions changed after confirmation");
		if (
			root.id !== saved.state.identity.source.objectId ||
			stableHash(state.identity) !== stableHash(saved.state.identity)
		)
			throw new SyncPlanValidationError("Migration identity changed");
		assertOwnership(state);
		await atomicJson(
			path.join(
				await plans.directory(plan.id),
				"backups",
				"state-before-apply.json",
			),
			state,
		);
		for (const [id, row] of Object.entries(saved.state.pages)) {
			if (owned[id]) continue;
			if (stableHash(state.pages[id]) !== stableHash(row))
				throw new SyncPlanValidationError(
					`State baseline changed: ${id}; analyze again`,
				);
		}
		await guardReads();
	};
	const afterTransfer: NonNullable<TransferOptions["afterTransfer"]> = async ({
		store,
		report,
		progress,
	}) => {
		progress.phase("Sync · recording decisions and repairing incoming links");
		metadata.linkPatches = Math.max(
			metadata.linkPatches,
			report.data.sync?.linkPatches ?? 0,
		);
		for (const failure of plan.references.unreadable ?? [])
			report.issue({
				code: "sync-reference-audit-incomplete",
				severity: "warning",
				phase: "verification",
				pageId: failure.pageId,
				retryable: false,
				message: `Incoming links could not be audited: ${failure.message}. Repeat sync analysis after restoring read access.`,
			});
		for (const item of plan.items) {
			const state = store.value.pages[item.id];
			if (!state) continue;
			if (
				selected.has(item.id) &&
				["complete", "partial"].includes(state.status)
			) {
				if (item.classification === "add") metadata.added++;
				else metadata.updated++;
			}
			if (kept.has(item.id)) {
				state.syncKeep = {
					sourceHash: item.evidence.sourceHash,
					decidedAt: new Date().toISOString(),
				};
				await store.setPage(state);
			} else if (selected.has(item.id) && state.status === "complete") {
				delete state.syncKeep;
				await store.setPage(state);
			}
		}
		if (dest) {
			for (const [id, state] of Object.entries(store.value.pages)) {
				if (!state.destinationId || state.exclusion) continue;
				if (
					!owned[id] &&
					!saved.reads[id] &&
					selected.has(id) &&
					["complete", "partial"].includes(state.status)
				) {
					try {
						owned[id] = {
							page: await dest.verifyPage(
								mappedPage(store.value, id, dest.kind, dest.profile.name),
							),
						};
					} catch (error) {
						report.issue({
							code: "sync-mapping-verification-failed",
							severity: "error",
							phase: "verification",
							pageId: id,
							retryable: true,
							message: redact(error, secretValues(config)),
						});
					}
				}
			}
			const targets = createSyncLinkIndex(
					linkTargets({ ...saved, owned }, store.value, trash),
				),
				protectedLinks = protectedUrls(saved.policies);
			const trashTargets = new Map(
				[...trash].map((id) => {
					const item = plan.items.find((i) => i.id === id)!;
					return [
						item.destinationId!,
						{
							sourceUrl: item.sourceUrl,
							title: (owned[id] ?? saved.reads[id])?.page.title ?? item.title,
						},
					] as const;
				}),
			);
			for (const [id, record] of Object.entries({ ...saved.reads, ...owned })) {
				hooks.signal?.throwIfAborted();
				if (trash.has(id)) continue;
				progress.phase(`Sync links · ${record.page.title}`);
				const patched = (
					dest.kind === "yandex-wiki" ? patchMarkdownSyncLinks : patchSyncLinks
				)(
					record.page.content ?? "",
					targets,
					records[id]?.page.url ??
						saved.baseline.baseline.pages.find(
							(p) => p.sourceCanonicalId === id,
						)?.sourceUrl ??
						saved.baseline.baseline.source.url,
					protectedLinks,
				);
				const native = await patchNativeTrashLinks(
					patched.body,
					record.page,
					dest,
					trashTargets,
				);
				patched.body = native.body;
				metadata.unresolvedReferences +=
					patched.unresolved.length + native.unresolved;
				if (patched.changes.length || native.count) {
					const current = await dest.verifyPage(record.page);
					if (stableHash(current) !== stableHash(record.page))
						throw new SyncPlanValidationError(`Link patch is stale: ${id}`);
					await atomicJson(
						path.join(
							await plans.directory(plan.id),
							"backups",
							`${stableHash(id)}-links.json`,
						),
						record,
					);
					await dest.updatePage({
						page: current,
						title: current.title,
						body: patched.body,
					});
					const actual = await dest.verifyPage(current),
						sourcePage =
							records[id]?.page ??
							({
								provider: source.kind,
								profile: source.profile.name,
								id: stateId(id),
								canonicalId: id,
								title: current.title,
								url: saved.baseline.baseline.source.url,
								locator: stateId(id),
								rawContent: "",
								rawFormat: "yfm",
								references: [],
							} as SourcePage);
					const verification = await verifyProviderContent(
						patched.body,
						actual.content,
						dest,
						sourcePage,
						actual,
					);
					if (verification.status !== "complete")
						throw new Error(`Link patch verification failed: ${id}`);
					record.page = actual;
					owned[id] = record;
					const state = store.value.pages[id];
					if (state) {
						if (actual.fingerprint)
							state.destinationFingerprint = actual.fingerprint;
						if (actual.version) state.destinationVersion = actual.version;
						await store.setPage(state);
					}
					metadata.linkPatches += patched.changes.length + native.count;
					await checkpoint();
				}
				if (
					record.comment &&
					dest.updateArchiveComment &&
					dest.readArchiveComment
				) {
					const patch = (
						dest.kind === "yandex-wiki"
							? patchMarkdownSyncLinks
							: patchSyncLinks
					)(
						record.comment.body,
						targets,
						records[id]?.page.url ??
							saved.baseline.baseline.pages.find(
								(p) => p.sourceCanonicalId === id,
							)?.sourceUrl ??
							saved.baseline.baseline.source.url,
						protectedLinks,
					);
					metadata.unresolvedReferences += patch.unresolved.length;
					if (patch.changes.length) {
						const current = await dest.readArchiveComment({
							page: record.page,
							commentId: record.comment.id,
						});
						if (stableHash(current) !== stableHash(record.comment))
							throw new SyncPlanValidationError(
								`Comment link patch is stale: ${id}`,
							);
						await atomicJson(
							path.join(
								await plans.directory(plan.id),
								"backups",
								`${stableHash(id)}-comment.json`,
							),
							current,
						);
						await dest.updateArchiveComment({
							comment: current,
							body: patch.body,
						});
						const actual = await dest.readArchiveComment({
							page: record.page,
							commentId: current.id,
						});
						if (actual.body !== patch.body)
							throw new Error(`Comment link patch verification failed: ${id}`);
						record.comment = actual;
						owned[id] = record;
						metadata.linkPatches += patch.changes.length;
						await checkpoint();
					}
				}
			}
		}
		if (trash.size) {
			if (!dest?.trashPage || !dest.trashEvidence || !dest.verifyTrashedPage)
				throw new SyncPlanValidationError("Reversible trash is unavailable");
			if (metadata.unresolvedReferences)
				throw new Error(
					"Trash is blocked by unresolved incoming links; review them before retrying",
				);
			for (const id of trash) {
				const row = store.value.pages[id],
					record = owned[id] ?? saved.reads[id];
				if (!row?.destinationId || !record)
					throw new SyncPlanValidationError("Trash mapping is unavailable");
				const current = await dest.verifyPage(record.page),
					evidence = await dest.trashEvidence(current);
				if (!evidence.allowed || current.version !== record.page.version)
					throw new SyncPlanValidationError(
						"Trash evidence changed; analyze again",
					);
				await atomicJson(
					path.join(
						await plans.directory(plan.id),
						"backups",
						`${stableHash(id)}-trash.json`,
					),
					{ page: current, state: row },
				);
				row.exclusion = {
					reason: "operator-trash",
					planId: plan.id,
					destinationId: current.id,
					confirmedAt: new Date().toISOString(),
				};
				await store.setPage(row);
				try {
					await dest.trashPage(current);
				} catch (error) {
					if (!(await dest.verifyTrashedPage(current))) throw error;
				}
				if (!(await dest.verifyTrashedPage(current)))
					throw new Error(`Trash read-back failed: ${id}`);
				metadata.excluded++;
				report.data.pages = report.data.pages.filter(
					(p) => p.sourceCanonicalId !== id,
				);
				report.resolveIssues({
					pageId: id,
					codes: saved.baseline.baseline.issues
						.filter((issue) => issue.pageId === id)
						.map((issue) => issue.code),
				});
				const item = plan.items.find((i) => i.id === id)!;
				report.data.excludedPages.push({
					sourceCanonicalId: id,
					sourceId: item.sourceId,
					sourceTitle: item.title,
					sourceUrl: item.sourceUrl,
					status: "excluded",
					reason: "operator-trash",
					metadataComplete: true,
					...(item.parentId ? { projectedParentId: item.parentId } : {}),
				});
				report.data.selection.excluded.push({
					id: item.sourceId,
					canonicalId: id,
					locator: item.sourceUrl,
					title: item.title,
					url: item.sourceUrl,
					reason: "operator-trash",
					metadataComplete: true,
				});
				report.data.selection.selectedDescendants = Math.max(
					0,
					report.data.selection.selectedDescendants - 1,
				);
				await checkpoint();
			}
		}
		if (report.data.sync) Object.assign(report.data.sync, metadata);
	};
	progress.stop();
	const result = await new Migrator(config, quiet, wrapped).run({
		source: sourceLocator,
		destination,
		scope: inv.scope,
		sourceStatus: inv.sourceStatus,
		comments: inv.comments,
		dryRun: false,
		archive: inv.archive,
		concurrency: prepared.concurrency,
		freshInventory: true,
		preserveMappedIds: true,
		keptPageIds: new Set([...kept, ...retry.plan.contextPageIds]),
		...(destination.type === "directory"
			? { preserveExportIdentity: true }
			: {}),
		runtimeDirectory: workspace.statesDirectory,
		cacheDirectory: workspace.cacheDirectory,
		reportsDirectory: workspace.reportsDirectory,
		stateFilename: inv.state.path,
		preparedGraph: graph,
		retry,
		mentionPolicy: prepared.mentions,
		hashtagPolicy: prepared.hashtags,
		sync: metadata,
		beforeRun,
		...(destination.type === "directory"
			? { beforeDestinationMutation: guardReads }
			: {}),
		afterTransfer,
		onPreparedPage: async (input) => {
			if (input.destination.id.startsWith("dry-run:") || !dest) return;
			const current = await dest.verifyPage(input.destination),
				previous =
					owned[input.page.canonicalId] ?? saved.reads[input.page.canonicalId];
			owned[input.page.canonicalId] = {
				page: current,
				...(previous?.comment ? { comment: previous.comment } : {}),
				...(previous?.resources ? { resources: previous.resources } : {}),
			};
			await checkpoint();
		},
		...(hooks.signal ? { signal: hooks.signal } : {}),
		...(hooks.onEvent ? { onEvent: hooks.onEvent } : {}),
	});
	const outcome: OperationResult = {
		exitCode: result.hasErrors ? 1 : 0,
		status: result.status === "running" ? "failed" : result.status,
		runId: result.reportPaths.runId,
		reportHtml: result.reportPaths.html,
		reportJson: result.reportPaths.json,
		planId: plan.id,
		transfer: result,
	};
	saved.result = outcome;
	await checkpoint();
	await plans.savePrepared(plan.id, saved);
	const finalReport = JSON.parse(
		await readFile(result.reportPaths.json, "utf8"),
	) as TransferReportData;
	const selectedIncomplete =
		finalReport.pages.some(
			(page) =>
				selected.has(page.sourceCanonicalId) &&
				["failed", "blocked", "conflict", "not-started"].includes(page.status),
		) ||
		finalReport.issues.some(
			(issue) =>
				issue.lifecycle !== "resolved" &&
				issue.severity === "error" &&
				Boolean(
					(issue.pageId && selected.has(issue.pageId)) ||
						issue.code.startsWith("sync-"),
				),
		);
	await plans.savePlan({
		...plan,
		status: selectedIncomplete ? "review" : "applied",
		result: {
			runId: outcome.runId,
			reportHtml: outcome.reportHtml,
			status: outcome.status,
		},
	});
	return outcome;
}
function stateId(canonicalId: string): string {
	return canonicalId.slice(canonicalId.lastIndexOf(":") + 1);
}
