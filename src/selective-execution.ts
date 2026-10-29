import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import type { createProviderAdapter } from './adapters/factory.js';
import type { AppConfig } from './config.js';
import { semanticContentFingerprint } from './content-model.js';
import {
	decisionRevision,
	DecisionWorkspace,
	type DecisionKind,
} from './decision-workspace.js';
import type {
	DestinationPage,
	MentionProcessingPolicy,
	SourcePage,
} from './domain.js';
import {
	hashtagPresentation,
	type HashtagProcessingPolicy,
} from './hashtag-decisions.js';
import {
	type JobRequest,
	type TargetSelection,
	targetSelectionSchema,
} from './jobs/contracts.js';
import { atomicJson } from './jobs/store.js';
import { boundedPath } from './local-paths.js';
import { resolveDestinationLocator, resolveSourceLocator } from './locators.js';
import type { Logger } from './logger.js';
import {
	canonicalMentionInstance,
	decisionIdentityKey,
	parseMentionDecisions,
} from './mention-decisions.js';
import { prepareMentionPresentation } from './mentions.js';
import { Migrator } from './migrator.js';
import type {
	OperationHooks,
	OperationResult,
	PreparedOperation,
} from './operations.js';
import type { TransferReportData } from './report-contract.js';
import { resolveRetryBaseline } from './retry-report.js';
import {
	assertPreviewEvidence,
	buildOperatorPlan,
	StalePreviewError,
} from './targeted-operations.js';
import type { Workspace } from './workspace.js';

type TargetRequest = Extract<JobRequest, { kind: 'targeted' }>;
interface EvidenceRead {
	method: string;
	args: unknown[];
	hash: string;
}
interface SelectivePreview {
	id: string;
	baselineRunId: string;
	binding: string;
	selection: TargetSelection;
	reads: Record<string, EvidenceRead>;
	plan: ReturnType<typeof buildOperatorPlan>;
	pages: Record<string, { title: string; current: string; proposed: string }>;
	comments?: Record<string, { current: string; proposed: string }>;
	ready?: boolean;
	blockers?: string[];
	exportHash?: string;
	reportRunId?: string;
}
const sourceMethods = new Set([
	'resolvePage',
	'getPage',
	'resolveRoot',
	'readComments',
	'listResources',
]);
const destinationMethods = new Set([
	'resolveContainer',
	'verifyPage',
	'readArchiveComment',
	'listUploadedResources',
]);
const mutations = new Set([
	'createPage',
	'updatePage',
	'reparentPage',
	'uploadResource',
	'createArchiveComment',
	'updateArchiveComment',
]);
function safeArgs(args: unknown[]): unknown[] {
	return args.map((value) => {
		if (!value || typeof value !== 'object') return value;
		const object = value as Record<string, unknown>;
		if ('page' in object)
			return { ...object, page: safeArgs([object.page])[0] };
		const {
			content: _body,
			rawContent: _source,
			references: _references,
			...rest
		} = object;
		return rest;
	});
}
function readKey(method: string, args: unknown[]): string {
	const input = args[0] as any;
	return `${method}:${typeof input === 'string' || typeof input === 'number' ? input : (input?.commentId ?? input?.id ?? input?.page?.id ?? '')}`;
}
function evidenceHash(
	method: string,
	value: any,
	provider: SourcePage['provider'],
): string {
	if (method === 'verifyPage')
		return decisionRevision({
			id: value.id,
			parent: value.parentId,
			title: value.title,
			body:
				typeof value.content === 'string'
					? semanticContentFingerprint(value.content, provider)
					: 'unreadable',
		});
	if (method === 'readArchiveComment')
		return decisionRevision({
			id: value.id,
			pageId: value.pageId,
			body: semanticContentFingerprint(value.body, provider),
		});
	if (method === 'listUploadedResources')
		return decisionRevision(
			value
				.map((item: any) => ({ id: item.id, name: item.name, size: item.size }))
				.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))),
		);
	if (method === 'listResources')
		return decisionRevision(
			value
				.map((item: any) => ({
					id: item.id,
					name: item.name,
					preferredName: item.preferredName,
					size: item.size,
					kind: item.kind,
					embedded: item.embedded,
					metadata: item.kind === 'grid' ? item.metadata : undefined,
				}))
				.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))),
		);
	return decisionRevision(value);
}
export function preservedPolicies(
	report: TransferReportData,
	instance: string,
	explicit: DecisionKind[] = [],
): { mentions: MentionProcessingPolicy; hashtags: HashtagProcessingPolicy } {
	const mentionEntries = new Map<string, any>(),
		tagEntries = new Map<string, any>();
	for (const page of report.pages) {
		for (const item of explicit.includes('mentions')
			? []
			: (page.mentions ?? [])) {
			if (item.outcome === 'native')
				throw new Error(
					'Historical native mentions require an explicit mention revision before safe decisions application',
				);
			if (!item.sourceIdentity) {
				if (item.outcome !== 'preserved')
					throw new Error(
						'Historical mention identity is unavailable; select an explicit revision',
					);
				continue;
			}
			const key = decisionIdentityKey(item.sourceIdentity)!;
			const entry =
				item.outcome === 'linked' && item.url
					? {
							identity: item.sourceIdentity,
							mention: item.source,
							decision: 'url',
							url: item.url,
							text: item.label,
						}
					: {
							identity: item.sourceIdentity,
							mention: item.source,
							decision: 'skip',
						};
			if (
				mentionEntries.has(key) &&
				decisionRevision(mentionEntries.get(key)) !== decisionRevision(entry)
			)
				throw new Error(
					'Ambiguous historical mention presentation; select an explicit revision',
				);
			mentionEntries.set(key, entry);
		}
		for (const item of explicit.includes('hashtags')
			? []
			: (page.hashtags ?? [])) {
			const entry =
				item.outcome === 'linked' && item.url
					? { tag: item.tag, decision: 'url', url: item.url, text: item.label }
					: item.outcome === 'text'
						? { tag: item.tag, decision: 'text', text: item.label }
						: { tag: item.tag, decision: 'skip' };
			if (
				tagEntries.has(item.tag) &&
				decisionRevision(tagEntries.get(item.tag)) !== decisionRevision(entry)
			)
				throw new Error(
					'Ambiguous historical hashtag presentation; select an explicit revision',
				);
			tagEntries.set(item.tag, entry);
		}
	}
	const source = {
		provider: report.source.provider,
		instance: canonicalMentionInstance(instance),
	};
	return {
		mentions: mentionEntries.size
			? {
					mode: 'mapping',
					document: parseMentionDecisions({
						source,
						entries: [...mentionEntries.values()],
					}),
				}
			: { mode: 'off' },
		hashtags: tagEntries.size
			? {
					mode: 'mapping',
					document: { source, entries: [...tagEntries.values()] },
				}
			: { mode: 'off' },
	};
}
export async function revisionPolicies(
	request: TargetRequest,
	report: TransferReportData,
	workspace: Workspace,
	instance: string,
): Promise<ReturnType<typeof preservedPolicies>> {
	const result = preservedPolicies(
			report,
			instance,
			(['mentions', 'hashtags'] as const).filter((kind) =>
				Boolean(request.revisions?.[kind]),
			),
		),
		store = new DecisionWorkspace(workspace.root);
	for (const kind of ['mentions', 'hashtags'] as const) {
		const id = request.revisions?.[kind];
		if (!id) continue;
		const revision = await store.get(id);
		if (!revision.published || revision.kind !== kind)
			throw new Error(`Select a published ${kind} revision`);
		if (
			revision.document.source.provider !== report.source.provider ||
			revision.document.source.instance !== canonicalMentionInstance(instance)
		)
			throw new Error('Decision source binding mismatch');
		(result as any)[kind] = { mode: 'mapping', document: revision.document };
	}
	return result;
}
function affectedSelection(
	report: TransferReportData,
	prepared: PreparedOperation,
): TargetSelection {
	const selection = targetSelectionSchema.parse({});
	for (const page of report.pages) {
		let pageChanged = false,
			commentsChanged = false;
		for (const item of page.mentions ?? []) {
			if (!item.sourceIdentity) continue;
			const next = prepareMentionPresentation(
				{ ...item.sourceIdentity, source: item.source },
				prepared.mentions,
			);
			if (
				next.outcome !== item.outcome ||
				next.label !== item.label ||
				next.url !== item.url
			) {
				if (item.location === 'comment') commentsChanged = true;
				else pageChanged = true;
			}
		}
		for (const item of page.hashtags ?? []) {
			const next = hashtagPresentation(item.tag, prepared.hashtags);
			if (
				next.outcome !== item.outcome ||
				next.label !== item.label ||
				next.url !== item.url
			) {
				if (item.location === 'comment') commentsChanged = true;
				else pageChanged = true;
			}
		}
		// Missing historical scanner evidence must be established, not guessed as no mentions/tags.
		if (
			(!page.mentions && prepared.mentions.mode === 'mapping') ||
			(!page.hashtags && prepared.hashtags.mode === 'mapping')
		) {
			pageChanged = true;
			if (report.commentsEnabled) commentsChanged = true;
		}
		if (pageChanged) selection.pageIds.push(page.sourceCanonicalId);
		if (commentsChanged) selection.commentPageIds.push(page.sourceCanonicalId);
	}
	return selection;
}
export async function readSelectivePreview(
	workspace: Workspace,
	id: string,
): Promise<SelectivePreview> {
	if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid preview ID');
	const filename = await boundedPath(
		workspace.root,
		`.states/previews/${id}.json`,
	);
	const result = JSON.parse(
		await readFile(filename, 'utf8'),
	) as SelectivePreview;
	if (result.id !== id) throw new Error('Invalid preview identity');
	return result;
}
export async function exportEvidence(directory: string): Promise<string> {
	const files: Array<[string, string]> = [];
	async function visit(relative: string): Promise<void> {
		const filename = path.join(directory, relative),
			info = await lstat(filename);
		if (info.isSymbolicLink())
			throw new Error('Export preview refuses symlinks');
		if (info.isDirectory()) {
			for (const name of (await readdir(filename)).sort())
				await visit(path.join(relative, name));
		} else if (info.isFile()) {
			const hash = createHash('sha256');
			for await (const data of createReadStream(filename)) hash.update(data);
			files.push([relative, hash.digest('hex')]);
		} else throw new Error('Unsupported export object');
	}
	try {
		await visit('');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
		throw error;
	}
	return decisionRevision(files);
}
export async function executeSelective(
	prepared: PreparedOperation,
	config: AppConfig,
	workspace: Workspace,
	hooks: OperationHooks,
	logger: Logger,
	factory: typeof createProviderAdapter,
): Promise<OperationResult> {
	const request = prepared.request as TargetRequest,
		baseline = await resolveRetryBaseline(
			workspace.reportsDirectory,
			request.runId,
			workspace.root,
		);
	const invocation = baseline.invocation,
		source = resolveSourceLocator(
			config,
			invocation.source.locator,
			invocation.source.profile,
		);
	const destination = resolveDestinationLocator({
		config,
		value:
			invocation.destination.type === 'remote'
				? invocation.destination.locator
				: invocation.destination.path,
		...(invocation.destination.type === 'remote'
			? { profile: invocation.destination.profile }
			: { format: invocation.destination.format }),
		cwd: workspace.root,
	});
	const selection =
		request.action === 'decisions' &&
		!request.selection.pageIds.length &&
		!request.selection.commentPageIds.length &&
		!Object.keys(request.selection.resourceIds).length
			? affectedSelection(baseline.baseline, prepared)
			: request.selection;
	const plan = buildOperatorPlan(baseline.baseline, selection, request.action);
	const binding = decisionRevision({
		baseline: baseline.baseline.runId,
		action: request.action,
		selection,
		mentions: prepared.mentions,
		hashtags: prepared.hashtags,
	});
	const approved = !request.dryRun
		? await readSelectivePreview(workspace, request.previewId ?? '')
		: undefined;
	if (
		approved &&
		(approved.binding !== binding ||
			approved.baselineRunId !== baseline.baseline.runId)
	)
		throw new StalePreviewError();
	if (approved?.ready === false)
		throw new Error(
			'Preview has blocking inventory/dependency failures; prepare a new preview',
		);
	const exportHash =
		destination.type === 'directory'
			? await exportEvidence(destination.path)
			: undefined;
	if (approved && approved.exportHash !== exportHash)
		throw new StalePreviewError();
  let preserveExportIdentity = false;
  if (destination.type === 'directory') {
    try {const manifest = JSON.parse(await readFile(path.join(destination.path, '.ywtc-export.json'), 'utf8'));preserveExportIdentity = manifest.tool === 'ywtc' && Array.isArray(manifest.pages);}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
    if (request.action === 'decisions' && !preserveExportIdentity) throw new Error('Decisions application requires an existing managed export');
  }
	const reads: Record<string, EvidenceRead> = {},
		pages: SelectivePreview['pages'] = {};
	const adapters = new Map<string, ReturnType<typeof createProviderAdapter>>();
	const isDestinationRead = (method: string) => destinationMethods.has(method);
	const recordedFactory: typeof factory = (profile, settings) => {
		const adapter = factory(profile, settings);
		adapters.set(profile.name, adapter);
		return new Proxy(adapter, {
			get(target, property) {
				if (property === 'capabilities' && request.action === 'decisions')
					return { ...target.capabilities, reparentPages: false };
				const member = Reflect.get(target, property);
				if (typeof member !== 'function' || typeof property !== 'string')
					return member;
				if (sourceMethods.has(property) || destinationMethods.has(property))
					return async (...args: any[]) => {
						const side = isDestinationRead(property) ? 'destination' : 'source',
							key = `${profile.name}:${side}:${readKey(property, args)}`;
						try {
							const value = await member.apply(target, args),
								hash = evidenceHash(property, value, profile.type);
							if (approved?.reads[key] && approved.reads[key]!.hash !== hash)
								throw new StalePreviewError();
							reads[key] = { method: property, args: safeArgs(args), hash };
							return value;
						} catch (error) {
							if ((error as any).status === 404) {
								if (
									approved?.reads[key] &&
									approved.reads[key]!.hash !== 'missing'
								)
									throw new StalePreviewError();
								reads[key] = {
									method: property,
									args: safeArgs(args),
									hash: 'missing',
								};
							}
							throw error;
						}
					};
				if (mutations.has(property))
					return async (...args: any[]) => {
						if (
							request.action === 'decisions' &&
							(property === 'createPage' || property === 'reparentPage')
						)
							throw new Error(
								'Decisions application cannot create or move pages; recover the mapping first',
							);
						if (request.dryRun)
							throw new Error('A preview cannot mutate destination');
						const inputPage = args[0]?.page;
						if (inputPage && approved) {
							const key = `${profile.name}:destination:${readKey('verifyPage', [inputPage])}`,
								evidence = approved.reads[key];
							if (
								evidence &&
								evidence.hash !==
									evidenceHash(
										'verifyPage',
										await target.verifyPage(inputPage),
										profile.type,
									)
							)
								throw new StalePreviewError();
						}
						const inputComment = args[0]?.comment;
						if (inputComment && approved && target.readArchiveComment) {
							const key = `${profile.name}:destination:readArchiveComment:${inputComment.id}`,
								evidence = approved.reads[key];
							if (
								evidence &&
								evidence.hash !==
									evidenceHash(
										'readArchiveComment',
										await target.readArchiveComment({
											page: { id: inputComment.pageId } as DestinationPage,
											commentId: inputComment.id,
										}),
										profile.type,
									)
							)
								throw new StalePreviewError();
						}
						const result = await member.apply(target, args);
						const page =
							property === 'createPage' ||
							property === 'updatePage' ||
							property === 'reparentPage'
								? result
								: args[0]?.page;
						if (page?.id) {
							const verified = await target.verifyPage(page),
								key = `${profile.name}:destination:${readKey('verifyPage', [page])}`;
							const evidence = {
								method: 'verifyPage',
								args: safeArgs([page]),
								hash: evidenceHash('verifyPage', verified, profile.type),
							};
							reads[key] = evidence;
							if (approved) approved.reads[key] = evidence;
						}
						if (property === 'uploadResource' && page) {
							const value = await target.listUploadedResources(page),
								key = `${profile.name}:destination:${readKey('listUploadedResources', [page])}`;
							const evidence = {
								method: 'listUploadedResources',
								args: safeArgs([page]),
								hash: evidenceHash(
									'listUploadedResources',
									value,
									profile.type,
								),
							};
							reads[key] = evidence;
							if (approved) approved.reads[key] = evidence;
						}
						if (
							(property === 'createArchiveComment' ||
								property === 'updateArchiveComment') &&
							result?.id
						) {
							const arg = {
								page: page ?? {
									id: result.pageId,
									provider: profile.type,
									profile: profile.name,
								},
								commentId: result.id,
							};
							const key = `${profile.name}:destination:${readKey('readArchiveComment', [arg])}`,
								evidence = {
									method: 'readArchiveComment',
									args: safeArgs([arg]),
									hash: evidenceHash(
										'readArchiveComment',
										result,
										profile.type,
									),
								};
							reads[key] = evidence;
							if (approved) approved.reads[key] = evidence;
						}
						return result;
					};
				return member.bind(target);
			},
		});
	};
	const guard = async () => {
		if (!approved) return;
		if (
			destination.type === 'directory' &&
			approved.exportHash !== (await exportEvidence(destination.path))
		)
			throw new StalePreviewError();
		const expectedSource = Object.fromEntries(
			Object.entries(approved.reads)
				.filter(([key]) => key.includes(':source:'))
				.map(([key, value]) => [key, value.hash]),
		);
		const actualSource = Object.fromEntries(
			Object.entries(reads)
				.filter(([key]) => key.includes(':source:'))
				.map(([key, value]) => [key, value.hash]),
		);
		assertPreviewEvidence(expectedSource, actualSource);
		for (const [key, evidence] of Object.entries(approved.reads)) {
			if (!key.includes(':destination:')) continue;
			const profile = config.profiles[key.slice(0, key.indexOf(':'))]!,
				adapter = adapters.get(profile.name) ?? factory(profile, config);
			let hash: string;
			try {
				hash = evidenceHash(
					evidence.method,
					await (adapter as any)[evidence.method](...evidence.args),
					profile.type,
				);
			} catch (error) {
				if ((error as any).status === 404) hash = 'missing';
				else throw error;
			}
			if (hash !== evidence.hash) throw new StalePreviewError();
		}
	};
	if (request.action === 'decisions')
		for (const id of plan.retryPageIds) {
			if (
				!baseline.baseline.pages.find((page) => page.sourceCanonicalId === id)
					?.destinationId
			)
				throw new Error(
					`Missing destination mapping for ${id}; recover before applying decisions`,
				);
		}
	const result = await new Migrator(config, logger, recordedFactory).run({
		source,
		destination,
		scope: invocation.scope,
		sourceStatus: invocation.sourceStatus,
		comments: invocation.comments,
		dryRun: request.dryRun,
		archive: invocation.archive,
		concurrency: prepared.concurrency,
		freshInventory: true,
    ...(preserveExportIdentity ? {preserveExportIdentity: true} : {}),
		runtimeDirectory: workspace.statesDirectory,
		cacheDirectory: workspace.cacheDirectory,
		reportsDirectory: workspace.reportsDirectory,
		stateFilename: invocation.state.path,
		retry: {
			rootRunId: baseline.rootRunId,
			parentRunId: baseline.baseline.runId,
			attempt: baseline.attempt,
			baseline: baseline.baseline,
			plan,
		},
		mentionPolicy: prepared.mentions,
		hashtagPolicy: prepared.hashtags,
		beforeDestinationMutation: guard,
		onPreparedPage: (input) => {
			pages[input.page.canonicalId] = {
				title: input.page.title,
				current: input.destination.id.startsWith('dry-run:')
					? ''
					: (input.destination.content ?? ''),
				proposed: input.body,
			};
		},
		...(hooks.signal ? { signal: hooks.signal } : {}),
		...(hooks.onEvent ? { onEvent: hooks.onEvent } : {}),
	});
	let previewId: string | undefined;
	if (request.dryRun) {
		previewId = randomUUID();
		const comments: NonNullable<SelectivePreview['comments']> = {},
			blockers: string[] = [];
		const data = JSON.parse(
			await readFile(result.reportPaths.json, 'utf8'),
		) as TransferReportData;
		const localPresentation = JSON.parse(
			load(await readFile(result.reportPaths.html, 'utf8'))(
				'#ywtc-report-data',
			).text(),
		).report as TransferReportData;
		if (!data.summary.inventoryComplete)
			blockers.push('Targeted source inventory is incomplete');
		for (const id of plan.retryPageIds) {
			const selected = data.pages.find((p) => p.sourceCanonicalId === id);
			if (
				!selected ||
				['failed', 'blocked', 'conflict'].includes(selected.status)
			)
				blockers.push(`Required page/dependency is unavailable: ${id}`);
			const previous = baseline.baseline.pages.find(
				(p) => p.sourceCanonicalId === id,
			);
			if (
				!invocation.comments ||
				!(plan.pages[id]?.retryComments || plan.pages[id]?.retryPage) ||
				!previous
			)
				continue;
			let current = '';
			if (
				destination.type === 'remote' &&
				previous.comments.destinationId &&
				previous.destinationId
			) {
				const adapter = recordedFactory(destination.profile, config);
				if (adapter.readArchiveComment)
					try {
						current = (
							await adapter.readArchiveComment({
								page: {
									id: previous.destinationId,
									provider: destination.profile.type,
									profile: destination.profile.name,
								} as DestinationPage,
								commentId: previous.comments.destinationId,
							})
						).body;
					} catch (error) {
						if ((error as any).status !== 404)
							blockers.push(`Cannot preview current comment archive on ${id}`);
					}
			}
			if (selected?.comments.status === 'failed')
				blockers.push(`Comment inventory is incomplete: ${id}`);
			comments[id] = {
				current,
				proposed:
					localPresentation.pages.find((p) => p.sourceCanonicalId === id)
						?.comments.preview ?? '',
			};
		}
		const record: SelectivePreview = {
			id: previewId,
			baselineRunId: baseline.baseline.runId,
			binding,
			selection,
			reads,
			pages,
			comments,
			plan,
			ready: !blockers.length,
			blockers,
			...(exportHash ? { exportHash } : {}),
			reportRunId: result.reportPaths.runId,
		};
		await atomicJson(
			path.join(workspace.statesDirectory, 'previews', `${previewId}.json`),
			record,
		);
	}
	return {
		exitCode: result.hasErrors ? 1 : 0,
		status: result.status === 'running' ? 'failed' : result.status,
		runId: result.reportPaths.runId,
		reportHtml: result.reportPaths.html,
		reportJson: result.reportPaths.json,
		transfer: result,
		...(previewId ? { previewId } : {}),
	};
}
