import path from 'node:path';
import {boundedPath} from './local-paths.js';
import { createProviderAdapter } from './adapters/factory.js';
import {
	readWorkspaceConfig,
	secretValues,
	validateProfileSecrets,
	type AppConfig,
	type ConnectionProfile,
} from './config.js';
import {
	collectDecisionCatalogs,
	DecisionWorkspace,
	mergeDecisionCatalog,
} from './decision-workspace.js';
import type { MentionProcessingPolicy } from './domain.js';
import type { HashtagProcessingPolicy } from './hashtag-decisions.js';
import { writeHashtagBundle } from './hashtag-export.js';
import { loadHashtagPolicy } from './hashtag-policy.js';
import {
	jobRequestSchema,
	type JobRequest,
	type JobResult,
} from './jobs/contracts.js';
import {
	profileBaseUrl,
	resolveDestinationLocator,
	resolveSourceLocator,
} from './locators.js';
import { redact, type Logger } from './logger.js';
import { withMentionOutput, writeMentionBundle } from './mention-export.js';
import { loadMentionPolicy } from './mention-policy.js';
import {
	MigrationRunError,
	Migrator,
	type TransferResult,
} from './migrator.js';
import type { OperationEvent } from './operation-events.js';
import { buildRetryPlan, type RetryExecution } from './retry-plan.js';
import { resolveRetryBaseline } from './retry-report.js';
import { decisionRevision } from './decision-workspace.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';

export interface PreparedOperation {
	request: JobRequest;
	bindings: Record<string, string>;
	timeoutMs: number;
	concurrency: number;
	limits: Record<string, ConnectionProfile['limits']>;
	mentions: MentionProcessingPolicy;
	hashtags: HashtagProcessingPolicy;
}
export interface OperationHooks {
	signal?: AbortSignal;
	onEvent?: (event: OperationEvent) => void;
}
export interface OperationResult extends JobResult {
	transfer?: TransferResult;
	error?: string;
}
export class OperationCancelled extends Error {
	constructor(readonly exitCode: number) {
		super(`Cancelled (${exitCode})`);
	}
}

function profileBinding(profile: ConnectionProfile): string {
	const { token: _token, ...rest } = profile;
	if ('email' in rest) delete rest.email;
	return decisionRevision(rest);
}
async function effectiveMigration(
	request: Extract<JobRequest, { kind: 'retry' | 'targeted' }>,
	workspace: Workspace,
) {
	const baseline = await resolveRetryBaseline(
		workspace.reportsDirectory,
		request.runId,
		workspace.root,
	);
	const invocation = baseline.invocation;
	const migration: Extract<JobRequest, { kind: 'migrate' }> = {
		kind: 'migrate' as const,
		source: invocation.source.locator,
		sourceProfile: invocation.source.profile,
		destination:
			invocation.destination.type === 'remote'
				? invocation.destination.locator
				: invocation.destination.path,
		...(invocation.destination.type === 'remote'
			? { destinationProfile: invocation.destination.profile }
			: { format: invocation.destination.format }),
		scope: invocation.scope,
		sourceStatus: invocation.sourceStatus,
		comments: invocation.comments,
		archive: invocation.archive,
		dryRun: request.dryRun,
		stateFilename: invocation.state.path,
		...((request.kind === 'retry' && request.rewrite) || invocation.rewrite
			? { rewrite: true }
			: {}),
		...(request.kind === 'retry' && request.concurrency !== undefined
			? { concurrency: request.concurrency }
			: {}),
	};
	return { baseline, migration };
}
export async function prepareOperation(
	value: unknown,
	workspace: Workspace,
	cwd = process.cwd(),
): Promise<PreparedOperation> {
	let request = jobRequestSchema.parse(value);
	const config = readWorkspaceConfig(workspace.configFile);
	const effective =
		request.kind === 'retry' || request.kind === 'targeted'
			? (await effectiveMigration(request, workspace)).migration
			: request;
	const source = resolveSourceLocator(
		config,
		effective.source,
		effective.sourceProfile,
	);
	const selected = [source.profile];
	if (effective.kind === 'migrate') {
		const destination = resolveDestinationLocator({
			config,
			value: effective.destination,
			...(effective.destinationProfile
				? { profile: effective.destinationProfile }
				: {}),
			...(effective.format ? { format: effective.format } : {}),
			cwd,
		});
		if (destination.type === 'remote') selected.push(destination.profile);
		if (effective.rewrite && (effective.fresh || destination.type !== 'remote'))
			throw new Error(
				'Rewrite requires a remote destination and cannot use fresh',
			);
		if (request.kind === 'migrate')
			request = {
				...request,
				sourceProfile: source.profile.name,
				destination:
					destination.type === 'directory'
						? destination.path
						: request.destination,
				...(destination.type === 'remote'
					? { destinationProfile: destination.profile.name }
					: {}),
			};
		if (effective.stateFilename) await boundedPath(workspace.root, path.relative(workspace.root, resolveWorkspacePath(workspace, effective.stateFilename)), true);
	} else if (request.kind === 'scan')
		request = {
			...request,
			sourceProfile: source.profile.name,
			...(request.output ? { output: path.resolve(cwd, request.output) } : {}),
		};
	validateProfileSecrets(config, selected);
	const isScan = request.kind === 'scan';
	const applicationPolicies =
		request.kind === 'targeted'
			? await (await import('./selective-execution.js')).revisionPolicies(
					request,
					(await effectiveMigration(request, workspace)).baseline.baseline,
					workspace,
					profileBaseUrl(source.profile),
				)
			: undefined;
	return {
		request,
		bindings: Object.fromEntries(
			selected.map((profile) => [profile.name, profileBinding(profile)]),
		),
		timeoutMs: config.timeoutMs,
		concurrency: config.concurrency,
		limits: Object.fromEntries(
			selected.map((profile) => [profile.name, profile.limits]),
		),
		mentions:
			applicationPolicies?.mentions ??
			(isScan ? { mode: 'off' } : loadMentionPolicy(config, source.profile)),
		hashtags:
			applicationPolicies?.hashtags ??
			(isScan ? { mode: 'off' } : loadHashtagPolicy(config, source.profile)),
	};
}
export function restoreOperationConfig(
	prepared: PreparedOperation,
	workspace: Workspace,
): AppConfig {
	const config = readWorkspaceConfig(workspace.configFile);
	for (const [name, binding] of Object.entries(prepared.bindings)) {
		const profile = config.profiles[name];
		if (!profile || profileBinding(profile) !== binding)
			throw new Error(
				`Connection identity/settings changed for ${name}; confirm a new operation`,
			);
		profile.limits = prepared.limits[name]!;
	}
	config.timeoutMs = prepared.timeoutMs;
	config.concurrency = prepared.concurrency;
	return config;
}
export async function executeOperation(
	prepared: PreparedOperation,
	workspace: Workspace,
	hooks: OperationHooks = {},
	factory: typeof createProviderAdapter = createProviderAdapter,
): Promise<OperationResult> {
	const config = restoreOperationConfig(prepared, workspace),
		secrets = secretValues(config),
		request = prepared.request;
	const emit = (event: OperationEvent): void => {
		const clean = (value: unknown): unknown =>
			typeof value === 'string'
				? redact(value, secrets)
				: Array.isArray(value)
					? value.map(clean)
					: value && typeof value === 'object'
						? Object.fromEntries(
								Object.entries(value).map(([key, child]) => [
									key,
									clean(child),
								]),
							)
						: value;
		hooks.onEvent?.(clean(event) as OperationEvent);
	};
	const logger: Logger = {
		info: (message) => emit({ type: 'message', message }),
		warn: (message) => emit({ type: 'message', message }),
		error: (message) => emit({ type: 'message', message }),
	};
	try {
		if (request.kind === 'scan') {
			const source = resolveSourceLocator(
				config,
				request.source,
				request.sourceProfile,
			);
			const collect = () =>
				collectDecisionCatalogs({
					adapter: factory(source.profile, config),
					locator: source.value,
					scope: request.scope,
					sourceStatus: request.sourceStatus,
					comments: request.comments,
					concurrency: request.concurrency ?? config.concurrency,
					kinds: request.kinds,
					...(hooks.signal ? { signal: hooks.signal } : {}),
					secrets,
					onProgress: (message) => emit({ type: 'message', message }),
				});
			let result: OperationResult;
			if (request.output) {
				result = await withMentionOutput(request.output, async (output) => {
					const catalogs = await collect();
					if (request.kinds.length !== 1)
						throw new Error('A single output bundle requires one catalog kind');
					const paths = catalogs.mentions
						? await writeMentionBundle(output, catalogs.mentions)
						: await writeHashtagBundle(output, catalogs.hashtags!);
					const complete = (catalogs.mentions ?? catalogs.hashtags)!.inventory
						?.complete;
					return {
						exitCode: complete ? 0 : 1,
						status: complete ? 'completed' : 'partial',
						output: paths.html,
					};
				});
			} else {
				const catalogs = await collect(),
					store = new DecisionWorkspace(workspace.root);
				let catalogId: string | undefined,
					complete = true;
				for (const kind of request.kinds) {
					let document = catalogs[kind]!,
						staleKeys: string[] | undefined;
					if (request.catalogId) {
						const previous = await store.get(request.catalogId);
						const related =
							previous.kind === kind
								? previous
								: (await store.list())
										.filter(
											(item) =>
												item.kind === kind &&
												decisionRevision(item.document.source) ===
													decisionRevision(document.source),
										)
										.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
						if (related) {
							const merged = mergeDecisionCatalog(
								kind,
								related.document,
								document,
							);
							document = merged.document as typeof document;
							staleKeys = merged.staleKeys;
						}
					}
					const saved = await store.save(
						kind,
						document,
						undefined,
						undefined,
						staleKeys,
					);
					catalogId ??= saved.id;
					complete &&= document.inventory?.complete === true;
					emit({
						type: 'message',
						message: `${kind}: ${document.entries.length} identities · catalog ${saved.id} · inventory ${document.inventory?.complete ? 'complete' : 'incomplete'}`,
					});
				}
				result = {
					exitCode: complete ? 0 : 1,
					status: complete ? 'completed' : 'partial',
					...(catalogId ? { catalogId } : {}),
				};
			}
			if (hooks.signal?.aborted)
				return {
					...result,
					status: 'cancelled',
					exitCode:
						hooks.signal.reason instanceof OperationCancelled
							? hooks.signal.reason.exitCode
							: 130,
				};
			return result;
		}
		if (request.kind === 'targeted')
			return await (await import('./selective-execution.js')).executeSelective(
				prepared,
				config,
				workspace,
				hooks,
				logger,
				factory,
			);
		const resolved =
			request.kind === 'retry'
				? await effectiveMigration(request, workspace)
				: undefined;
		const migration =
			resolved?.migration ??
			(request as Extract<JobRequest, { kind: 'migrate' }>);
		let retry: RetryExecution | undefined;
		if (resolved) {
			const { baseline } = resolved,
				plan = buildRetryPlan(baseline.baseline);
			if (!plan.remainingRetryable && !plan.discoveryIncomplete)
				return {
					exitCode: plan.remainingTerminal ? 1 : 0,
					status: plan.remainingTerminal ? 'partial' : 'completed',
					runId: baseline.baseline.runId,
					reportHtml: path.join(
						workspace.reportsDirectory,
						baseline.baseline.runId,
						'index.html',
					),
					reportJson: path.join(
						workspace.reportsDirectory,
						baseline.baseline.runId,
						'report.json',
					),
				};
			retry = {
				rootRunId: baseline.rootRunId,
				parentRunId: baseline.baseline.runId,
				attempt: baseline.attempt,
				baseline: baseline.baseline,
				plan,
			};
		}
		const source = resolveSourceLocator(
			config,
			migration.source,
			migration.sourceProfile,
		);
		const destination = resolveDestinationLocator({
			config,
			value: migration.destination,
			...(migration.destinationProfile
				? { profile: migration.destinationProfile }
				: {}),
			...(migration.format ? { format: migration.format } : {}),
			cwd: workspace.root,
		});
		const result = await new Migrator(config, logger, factory).run({
			source,
			destination,
			scope: migration.scope,
			sourceStatus: migration.sourceStatus,
			comments: migration.comments,
			dryRun: migration.dryRun,
			archive: migration.archive,
			fresh: migration.fresh ?? false,
			...(migration.rewrite ? { rewrite: true } : {}),
			concurrency: migration.concurrency ?? prepared.concurrency,
			runtimeDirectory: workspace.statesDirectory,
			cacheDirectory: workspace.cacheDirectory,
			reportsDirectory: workspace.reportsDirectory,
			...(migration.stateFilename
				? {
						stateFilename: resolveWorkspacePath(
							workspace,
							migration.stateFilename,
						),
					}
				: {}),
			...(retry ? { retry } : {}),
			...(hooks.signal ? { signal: hooks.signal } : {}),
			onEvent: emit,
			onStatus: (message) => emit({ type: 'message', message }),
			mentionPolicy: prepared.mentions,
			hashtagPolicy: prepared.hashtags,
		});
		if (result.status === 'running')
			throw new Error('Operation returned an unconfirmed running result');
		const incomplete =
			result.hasErrors ||
			(result.retry?.remainingRetryable ?? 0) > 0 ||
			(result.retry?.remainingTerminal ?? 0) > 0;
		return {
			exitCode: incomplete ? 1 : 0,
			status: result.status,
			runId: result.reportPaths.runId,
			reportHtml: result.reportPaths.html,
			reportJson: result.reportPaths.json,
			transfer: result,
			...(result.output ? { output: result.output } : {}),
		};
	} catch (error) {
		const cancelled = hooks.signal?.aborted;
		const code = cancelled
			? hooks.signal?.reason instanceof OperationCancelled
				? hooks.signal.reason.exitCode
				: 130
			: 2;
		const message = redact(error, secrets);
		emit({
			type: 'diagnostic',
			code: cancelled ? 'operation-cancelled' : 'operation-failed',
			severity: 'error',
			retryable: false,
			message,
		});
		return {
			exitCode: code,
			status: cancelled ? 'cancelled' : 'failed',
			error: message,
			...(error instanceof MigrationRunError
				? {
						runId: error.reportPaths.runId,
						reportHtml: error.reportPaths.html,
						reportJson: error.reportPaths.json,
					}
				: {}),
		};
	}
}
