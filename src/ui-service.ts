import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { load } from 'cheerio';
import { createProviderAdapter } from './adapters/factory.js';
import {
	readWorkspaceConfig,
	secretValues,
	ConfigurationError,
} from './config.js';
import { DecisionWorkspace } from './decision-workspace.js';
import { submitJob, stopJob, reconcileInterruptedJobs } from './jobs/client.js';
import { jobRequestSchema, uuid } from './jobs/contracts.js';
import { atomicJson, JobStore } from './jobs/store.js';
import { boundedPath } from './local-paths.js';
import { redact } from './logger.js';
import {InteractiveConfigConflictError} from './interactive-config.js';
import { readSelectivePreview } from './selective-execution.js';
import {SyncPlanStore,SyncRevisionError} from './sync-store.js';
import type {PreparedSync} from './sync-execution.js';
import {renderCommentArchive} from './comments.js';
import type { TransferReportData } from './report-contract.js';
import {
	activateDecision,
	settingsSnapshot,
	SettingsRevisionError,
	updateSettings,
} from './ui-settings.js';
import {
	resolveWorkspace,
	ensureWorkspaceDirectories,
	type Workspace,
} from './workspace.js';

interface CenterOptions {
	workdir: string;
	port: number;
	bootstrap: string;
}
interface RegisteredWorkspace {
	id: string;
	path: string;
}
class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}
const json = (
	value: unknown,
	status = 200,
	headers: Record<string, string> = {},
) =>
	new Response(JSON.stringify(value), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
			...headers,
		},
	});
const equal = (a: string, b: string) => {
	const x = Buffer.from(a),
		y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
};
const publicJob = ({ nonce: _n, pid: _pid, ...job }: any) => job;
function pageProjection(page: any) {
	return {
		id: page.sourceCanonicalId,
		title: page.sourceTitle,
		sourceUrl: page.sourceUrl,
		destinationUrl: page.destinationUrl,
		status: page.status,
		depth: page.depth,
		parentId: page.projectedParentId ?? page.parentId ?? page.sourceParentId,
		files: page.resourceItems?.length ?? 0,
		comments: page.comments?.comments ?? 0,
		error: page.error ?? page.blockedReason ?? page.reason,
	};
}
export function projectReportRows(
	report: TransferReportData,
	options: { query: string; filter: string; offset: number; limit: number },
) {
	const pages = [
		...(report.container ? [report.container] : []),
		...report.pages,
		...(report.excludedPages ?? []),
	];
	const indexed = new Map(pages.map((p) => [p.sourceCanonicalId, p]));
	const included = new Set<string>(),
		query = options.query.toLocaleLowerCase();
	const issuesByPage = new Map<string, string[]>();
	for (const issue of report.issues) {
		if (!issue.pageId) continue;
		const bucket = issuesByPage.get(issue.pageId) ?? [];
		bucket.push(`${issue.code} ${issue.message}`);
		issuesByPage.set(issue.pageId, bucket);
	}
	for (const page of pages) {
		const p = page as any;
		const search = [
			p.sourceTitle,
			p.sourceId,
			p.sourceCanonicalId,
			p.destinationId,
			p.error,
			p.reason,
			p.blockedReason,
			...(p.resourceItems ?? []).map(
				(r: any) => `${r.sourceName} ${r.sourceId} ${r.error ?? ''}`,
			),
			...(issuesByPage.get(p.sourceCanonicalId) ?? []),
		]
			.join(' ')
			.toLocaleLowerCase();
		if (query && !search.includes(query)) continue;
		if (
			options.filter !== 'all' &&
			(options.filter === 'problems'
				? ['complete', 'planned'].includes(p.status)
				: p.status !== options.filter)
		)
			continue;
		let current: any = p;
		const visited = new Set<string>();
		while (current && !visited.has(current.sourceCanonicalId)) {
			included.add(current.sourceCanonicalId);
			visited.add(current.sourceCanonicalId);
			current = indexed.get(
				current.projectedParentId ?? current.parentId ?? current.sourceParentId,
			);
		}
	}
	const ordered: any[] = [],
		children = new Map<string, any[]>(),
		roots: any[] = [];
	for (const p of pages) {
		if (!included.has(p.sourceCanonicalId)) continue;
		const parent =
			(p as any).projectedParentId ?? (p as any).parentId ?? p.sourceParentId;
		if (parent && included.has(parent) && parent !== p.sourceCanonicalId) {
			const bucket = children.get(parent) ?? [];
			bucket.push(p);
			children.set(parent, bucket);
		} else roots.push(p);
	}
	const visited = new Set<string>();
	const walk = (p: any, depth: number) => {
		const stack = [{ p, depth }];
		while (stack.length) {
			const item = stack.pop()!;
			if (visited.has(item.p.sourceCanonicalId)) continue;
			visited.add(item.p.sourceCanonicalId);
			ordered.push({ ...pageProjection(item.p), depth: item.depth });
			for (const child of [
				...(children.get(item.p.sourceCanonicalId) ?? []),
			].reverse())
				stack.push({ p: child, depth: item.depth + 1 });
		}
	};
	for (const root of roots) walk(root, 0);
	for (const p of pages)
		if (included.has(p.sourceCanonicalId) && !visited.has(p.sourceCanonicalId))
			walk(p, 0);
	return {
		items: ordered.slice(options.offset, options.offset + options.limit),
		total: ordered.length,
	};
}
export class LocalControlCenter {
	private sessions = new Map<string, number>();
	private bootstrapUsed = false;
	private registered?: RegisteredWorkspace[];
	private initial: Promise<Workspace>;
	constructor(private readonly options: CenterOptions) {
		this.initial = resolveWorkspace({ explicit: options.workdir });
	}
	private async registry() {
		if (this.registered) return this.registered;
		const primary = await this.initial;
		await ensureWorkspaceDirectories(primary);
		const filename = await boundedPath(
			primary.root,
			'.states/ui/workspaces.json',
			true,
		);
		try {
			this.registered = z
				.array(z.object({ id: uuid, path: z.string() }))
				.parse(JSON.parse(await readFile(filename, 'utf8')));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			this.registered = [
				{ id: randomUUID(), path: await realpath(primary.root) },
			];
			await atomicJson(filename, this.registered);
		}
		return this.registered;
	}
	private async workspace(id: string) {
		const entry = (await this.registry()).find((w) => w.id === id);
		if (!entry) throw new HttpError(404, 'Workspace is not registered');
		if ((await realpath(entry.path)) !== entry.path)
			throw new HttpError(400, 'Workspace filesystem identity changed');
		const workspace = await resolveWorkspace({ explicit: entry.path });
		await boundedPath(workspace.root, '.states', true);
		return workspace;
	}
	private async body(request: Request) {
		if (
			request.headers.get('content-type')?.split(';')[0] !== 'application/json'
		)
			throw new HttpError(415, 'Expected JSON');
		const reader = request.body?.getReader();
		if (!reader) return {};
		const chunks: Uint8Array[] = [];
		let length = 0;
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			length += chunk.value.length;
			if (length > 16 * 1024 * 1024) {
				await reader.cancel();
				throw new HttpError(413, 'Request is too large');
			}
			chunks.push(chunk.value);
		}
		try {
			return JSON.parse(Buffer.concat(chunks).toString('utf8'));
		} catch {
			throw new HttpError(400, 'Invalid JSON');
		}
	}
	private authorize(request: Request) {
		const origin = `http://127.0.0.1:${this.options.port}`,
			url = new URL(request.url);
		if (request.headers.get('host') !== `127.0.0.1:${this.options.port}`)
			throw new HttpError(403, 'Invalid local Host');
		const supplied = request.headers.get('origin');
		if (
			(supplied && supplied !== origin) ||
			(!['GET', 'HEAD'].includes(request.method) && supplied !== origin) ||
			request.headers.get('sec-fetch-site') === 'cross-site'
		)
			throw new HttpError(403, 'Invalid local Origin');
		if (url.pathname === '/api/session' && request.method === 'POST') return;
		const cookie = request.headers
			.get('cookie')
			?.split(';')
			.map((s) => s.trim())
			.find((s) => s.startsWith('ywtc-session='))
			?.slice(13);
		if (!cookie || (this.sessions.get(cookie) ?? 0) < Date.now())
			throw new HttpError(401, 'Connect using the URL printed by ywtc ui');
	}
	async handle(request: Request): Promise<Response> {
		let workspace: Workspace | undefined;
		try {
			this.authorize(request);
			const url = new URL(request.url),
				parts = url.pathname.slice(5).split('/').map(decodeURIComponent),
				method = request.method;
			if (parts[0] === 'session') {
				const input = await this.body(request);
				if (
					method !== 'POST' ||
					this.bootstrapUsed ||
					typeof input.secret !== 'string' ||
					!equal(input.secret, this.options.bootstrap)
				)
					throw new HttpError(401, 'Invalid or already used bootstrap');
				this.bootstrapUsed = true;
				const session = randomBytes(32).toString('hex');
				this.sessions.set(session, Date.now() + 12 * 3600_000);
				return json({ connected: true }, 200, {
					'set-cookie': `ywtc-session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
				});
			}
			if (parts[0] === 'workspaces') {
				const items = await this.registry();
				if (method === 'POST') {
					const input = z
						.object({ path: z.string().min(1), create: z.boolean().optional() })
						.strict()
						.parse(await this.body(request));
					const target = await resolveWorkspace({ explicit: input.path });
					if (input.create)
						await mkdir(target.root, { recursive: true, mode: 0o700 });
					const root = await realpath(target.root);
					await boundedPath(root, '.states', true);
					if (!items.some((w) => w.path === root)) {
						items.push({ id: randomUUID(), path: root });
						await atomicJson(
							path.join(
								(await this.initial).statesDirectory,
								'ui/workspaces.json',
							),
							items,
						);
					}
				} else if (method !== 'GET')
					throw new HttpError(405, 'Method not allowed');
				return json({ items });
			}
			if (parts[0] !== 'w') throw new HttpError(404, 'Unknown route');
			workspace = await this.workspace(parts[1]!);
			const area = parts[2],
				id = parts[3],
				action = parts[4];
			const page = (defaultLimit = 100) => {
				const offset = Number(url.searchParams.get('offset') ?? 0),
					limit = Number(url.searchParams.get('limit') ?? defaultLimit);
				if (
					!Number.isSafeInteger(offset) ||
					offset < 0 ||
					!Number.isSafeInteger(limit) ||
					limit < 1 ||
					limit > 500
				)
					throw new HttpError(400, 'Invalid pagination');
				return { offset, limit };
			};
			if (area === 'settings') {
				if (method === 'GET') return json(await settingsSnapshot(workspace));
				if (method === 'PUT')
					return json(
						await updateSettings(workspace, await this.body(request)),
					);
				if (method === 'POST' && id === 'probe') {
					const input = z
							.object({ profile: z.string() })
							.strict()
							.parse(await this.body(request)),
						config = readWorkspaceConfig(workspace.configFile),
						profile = config.profiles[input.profile];
					if (!profile) throw new HttpError(404, 'Profile not found');
					return json(await createProviderAdapter(profile, config).preflight());
				}
			}
			if(area==='sync') {
        const store=new SyncPlanStore(workspace.root);
        if(method==='GET'&&!id){const p=page(),plans=await store.list();return json({items:plans.slice(p.offset,p.offset+p.limit).map(({items,...plan})=>({...plan,counts:items.reduce<Record<string,number>>((counts,item)=>{counts[item.classification]=(counts[item.classification]??0)+1;return counts;},{})})),total:plans.length});}
        if(method==='GET'&&id){
          const plan=await store.get(id),decisions=await store.decisions(id);
          if(action==='links'){const prepared=await store.prepared<PreparedSync>(id),trash=new Set(Object.entries(decisions.decisions).filter(([,decision])=>decision==='trash').map(([id])=>id)),links=prepared.links.filter(link=>link.needsPatch||trash.has(link.targetId)).map(link=>({...link,title:prepared.baseline.baseline.pages.find(page=>page.sourceCanonicalId===link.pageId)?.sourceTitle??link.pageId,...(trash.has(link.targetId)?{destinationUrl:plan.items.find(item=>item.id===link.targetId)?.sourceUrl}: {})})),p=page();const groups=new Map<string,any>();for(const link of links){const key=JSON.stringify([link.pageId,link.location,link.targetId,link.href,link.native]);const existing=groups.get(key);if(existing)existing.occurrences++;else groups.set(key,{...link,id:key,occurrences:1});}const rows=[...groups.values()];return json({items:rows.slice(p.offset,p.offset+p.limit),total:rows.length});}
          if(action==='detail'){const itemId=url.searchParams.get('pageId')??'',prepared=await store.prepared<PreparedSync>(id),row=prepared.baseline.baseline.pages.find(page=>page.sourceCanonicalId===itemId),item=plan.items.find(item=>item.id===itemId)??(row?{id:itemId,title:row.sourceTitle}:undefined);if(!item)throw new HttpError(404,'Synchronization item not found');const sourceRecord=prepared.records?.[itemId],resources=Object.entries(sourceRecord?.files??{}).map(([resourceId,file])=>({id:resourceId,name:sourceRecord!.resources.find(r=>r.id===resourceId)?.preferredName??sourceRecord!.resources.find(r=>r.id===resourceId)?.name??resourceId,size:file.size,sha256:file.sha256,previousSha256:prepared.state?.pages[itemId]?.resources[resourceId]?.sha256})),inventory=sourceRecord?.comments,comments=inventory?{current:prepared.reads[itemId]?.comment?.body??'',proposed:inventory.status==='complete'?renderCommentArchive(inventory,prepared.baseline.baseline.destination.provider==='filesystem'?(prepared.baseline.baseline.destination.format==='html'?'html':'markdown'):prepared.baseline.baseline.destination.provider,{sourceUrl:sourceRecord!.page.url,mentionPolicy:prepared.policies.mentions,hashtagPolicy:prepared.policies.hashtags}):''}:undefined;return json({item,resources,comments,preview:prepared.previews[itemId]??{current:prepared.reads[itemId]?.page.content??'',proposed:prepared.reads[itemId]?.page.content??''},links:prepared.links.filter(link=>link.pageId===itemId)});}
          const p=page(),query=(url.searchParams.get('q')??'').toLowerCase(),filter=url.searchParams.get('filter')??'all',items=plan.items.filter(item=>(filter==='all'||item.classification===filter)&&`${item.title} ${item.id} ${item.reasons.join(' ')}`.toLowerCase().includes(query)),missingDecisions=plan.items.filter(item=>['changed','unknown-baseline'].includes(item.classification)&&!decisions.decisions[item.id]).length;
          return json({...plan,items:items.slice(p.offset,p.offset+p.limit),total:items.length,decisions,missingDecisions});
        }
        if(method==='PUT'&&id){const input=z.object({revision:z.string(),document:z.unknown()}).strict().parse(await this.body(request));const plan=await store.setDecisions(id,input.document,input.revision);return json({revision:plan.revision});}
      }
			if (area === 'jobs') {
				await reconcileInterruptedJobs(workspace);
				const store = new JobStore(workspace.root);
				if (method === 'POST' && !id) {
					const input = z
						.object({
							request: jobRequestSchema,
							confirmed: z.boolean().default(false),
							exportRoot: z.string().optional(),
						})
						.strict()
						.parse(await this.body(request));
					if(input.request.kind==='sync-apply'&&!input.confirmed)throw new HttpError(400,'Explicit synchronization apply confirmation is required');
					if (
						(input.request.kind === 'migrate' ||
							input.request.kind === 'retry' ||
							input.request.kind === 'targeted') &&
						!input.request.dryRun &&
						!input.confirmed
					)
						throw new HttpError(400, 'Explicit live confirmation is required');
					if (input.request.kind === 'scan' && input.request.output)
						throw new HttpError(
							400,
							'Use managed decision catalogs from the UI',
						);
					if (input.request.kind === 'migrate' && input.request.format) {
						if (input.exportRoot !== input.request.destination)
							throw new HttpError(400, 'Confirm the selected export root');
						const directory = path.resolve(input.exportRoot);
						await boundedPath(
							path.dirname(directory),
							path.basename(directory),
							true,
						);
					}
					return json(
						publicJob(
							await submitJob(workspace, input.request, workspace.root),
						),
						202,
					);
				}
				if (!id) {
					const p = page();
					const jobs = (await store.list()).reverse();
					return json({
						items: jobs.slice(p.offset, p.offset + p.limit).map(publicJob),
						total: jobs.length,
					});
				}
				if (action === 'stop' && method === 'POST')
					return json(publicJob(await stopJob(workspace, id)));
				if (action === 'events' && method === 'GET')
					return this.events(workspace, id, request);
				if (method === 'GET') return json(publicJob(await store.get(id)));
			}
			if (area === 'decisions') {
				const store = new DecisionWorkspace(workspace.root);
				if (method === 'GET' && !id) {
					const p = page();
					const items = (await store.list()).sort((a, b) =>
						b.updatedAt.localeCompare(a.updatedAt),
					);
					return json({
						items: items
							.slice(p.offset, p.offset + p.limit)
							.map(({ document, ...meta }) => ({
								...meta,
								source: document.source,
								entries: document.entries.length,
								inventory: document.inventory,
							})),
						total: items.length,
					});
				}
				if (method === 'GET' && id) return json(await store.get(id));
				if (method === 'POST' && action === 'publish') {
					const input = z
						.object({ revision: z.string() })
						.strict()
						.parse(await this.body(request));
					return json(await store.publish(id!, input.revision));
				}
				if (method === 'POST' && action === 'activate') {
					const input = z
						.object({ configRevision: z.string() })
						.strict()
						.parse(await this.body(request));
					return json(
						await activateDecision(workspace, id!, input.configRevision),
					);
				}
				if (method === 'PUT' || method === 'POST') {
					const input = z
						.object({
							kind: z.enum(['mentions', 'hashtags']),
							document: z.unknown(),
							revision: z.string().optional(),
						})
						.strict()
						.parse(await this.body(request));
					return json(
						await store.save(input.kind, input.document, id, input.revision),
					);
				}
			}
			if (area === 'previews' && method === 'GET')
				return json(await readSelectivePreview(workspace, id!));
			if (area === 'reports' && method === 'GET') {
				if (!id) {
					let names: string[] = [];
					try {
						names = await readdir(
							await boundedPath(workspace.root, '.states/reports'),
						);
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
					}
					const items = [],
						problems = [];
					for (const name of names.filter((n) => uuid.safeParse(n).success))
						try {
							const r = await this.report(workspace, name);
							const {
								pages: _p,
								excludedPages: _e,
								edges: _g,
								issues: _i,
								...meta
							} = r;
							items.push(meta);
						} catch {
							problems.push(name);
						}
					items.sort((a, b) =>
						(b.finishedAt ?? b.startedAt).localeCompare(
							a.finishedAt ?? a.startedAt,
						),
					);
					const p = page();
					return json({
						items: items.slice(p.offset, p.offset + p.limit),
						total: items.length,
						invalid: problems,
					});
				}
				const report = await this.report(workspace, id);
				if (action === 'rows')
					return json(
						projectReportRows(report, {
							...page(),
							query: url.searchParams.get('q') ?? '',
							filter: url.searchParams.get('filter') ?? 'all',
						}),
					);
				if (action === 'page') {
					const pageId = url.searchParams.get('id'),
						item =
							report.pages.find((p) => p.sourceCanonicalId === pageId) ??
							report.excludedPages?.find(
								(p) => p.sourceCanonicalId === pageId,
							) ??
							(report.container?.sourceCanonicalId === pageId
								? report.container
								: undefined);
					if (!item) throw new HttpError(404, 'Report page not found');
					return json({
						page: item,
						issues: report.issues.filter((i) => i.pageId === pageId),
						preview: await this.reportPreview(workspace, id, pageId!),
					});
				}
				const {
					pages: _p,
					excludedPages: _e,
					edges: _g,
					issues: _i,
					...meta
				} = report;
				return json(meta);
			}
			if (area === 'states' && method === 'GET') {
				const files = (await readdir(workspace.statesDirectory)).filter((n) =>
					/^[a-f0-9]{24}\.json$/.test(n),
				);
				const items = [];
				for (const file of files) {
					if (id && file !== `${id}.json`) continue;
					const value = JSON.parse(
						await readFile(
							await boundedPath(workspace.root, `.states/${file}`),
							'utf8',
						),
					);
					const { pages, graph, runs, ...meta } = value;
					const p = page();
					items.push({
						...meta,
            graph: {rootId: graph?.rootId, edges: graph?.edges?.length ?? 0},
            runs: (runs ?? []).slice(-100), runCount: runs?.length ?? 0,
						pageCount: Object.keys(pages ?? {}).length,
						...(id
							? {
									pages: Object.entries(pages ?? {})
										.slice(p.offset, p.offset + p.limit)
										.map(([key, value]) => {const copy = structuredClone(value as any);if (copy.comments) delete copy.comments.preview;return {id: key, ...copy};}),
								}
							: {}),
					});
				}
				return json({ items });
			}
			throw new HttpError(405, 'Method not allowed');
		} catch (error) {
			let secrets: string[] = [];
			try {
				if (workspace)
					secrets = secretValues(readWorkspaceConfig(workspace.configFile));
			} catch {}
			const status =
				error instanceof HttpError
					? error.status
					: error instanceof SettingsRevisionError || error instanceof InteractiveConfigConflictError || error instanceof SyncRevisionError ||
							(error instanceof Error &&
								/revision changed|reload before|immutable/.test(error.message))
						? 409
						: 400;
			const message =
				error instanceof z.ZodError
					? `Invalid fields: ${error.issues.map((i) => i.path.join('.')).join(', ')}`
					: error instanceof ConfigurationError
						? `Invalid configuration: ${error.fields.join(', ')}`
						: redact(error, secrets);
			return json({ error: message }, status);
		}
	}
	private async report(
		workspace: Workspace,
		id: string,
	): Promise<TransferReportData> {
		uuid.parse(id);
		const filename = await boundedPath(
				workspace.root,
				`.states/reports/${id}/report.json`,
			),
			data = JSON.parse(await readFile(filename, 'utf8'));
		if (
			data.runId !== id ||
			!Array.isArray(data.pages) ||
			!data.summary ||
			!Array.isArray(data.issues)
		)
			throw new Error('Corrupted report bundle');
		return data;
	}
	private async reportPreview(
		workspace: Workspace,
		id: string,
		pageId: string,
	) {
		const filename = await boundedPath(
			workspace.root,
			`.states/reports/${id}/index.html`,
		);
		const html = await readFile(filename, 'utf8'),
			$ = load(html),
			raw = $('#ywtc-report-data').text();
		if (!raw) return undefined;
		try {
			const pair = JSON.parse(raw).previews?.[pageId];
			if (!pair) return undefined;
			for (const side of ['source', 'destination']) {
				const parsed = load(String(pair[side] ?? '')),
					href = parsed('section[data-ywtc-preview-truncated="true"] a').attr(
						'href',
					);
				if (
					href &&
					/^previews\/[a-f0-9]+-(?:source|destination)\.txt$/.test(href)
				)
					pair[side] = await readFile(
						await boundedPath(workspace.root, `.states/reports/${id}/${href}`),
						'utf8',
					);
			}
			return pair;
		} catch {
			return undefined;
		}
	}
	private events(workspace: Workspace, id: string, request: Request): Response {
		uuid.parse(id);
		let cursor = Number(
				request.headers.get('last-event-id') ??
					new URL(request.url).searchParams.get('after') ??
					0,
			),
			cancelled = false;
		const encoder = new TextEncoder(),
			store = new JobStore(workspace.root);
		const stream = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				try {
					while (!cancelled && !request.signal.aborted) {
						const batch = await store.events(id, cursor, 250);
						const send = (name: string, value: unknown, sequence?: number) =>
							controller.enqueue(
								encoder.encode(
									`${sequence === undefined ? '' : `id: ${sequence}\n`}event: ${name}\ndata: ${JSON.stringify(value)}\n\n`,
								),
							);
						if (batch.reset) {
							cursor = batch.job.lastSequence;
							send('snapshot', publicJob(batch.job), cursor);
						}
						for (const event of batch.events) {
							cursor = event.sequence;
							send('event', event, cursor);
						}
						send('snapshot', publicJob(batch.job));
						if (
							['finished', 'interrupted'].includes(batch.job.status) &&
							cursor >= batch.job.lastSequence
						)
							break;
						await delay(1000, undefined, { signal: request.signal });
					}
				} catch {
					if (!request.signal.aborted && !cancelled)
						controller.enqueue(
							encoder.encode(
								`event: fault\ndata: ${JSON.stringify({ error: 'Event stream unavailable; reconnect for a snapshot' })}\n\n`,
							),
						);
				} finally {
					if (!cancelled) controller.close();
				}
			},
			cancel() {
				cancelled = true;
			},
		});
		return new Response(stream, {
			headers: {
				'content-type': 'text/event-stream',
				'cache-control': 'no-store',
				'x-accel-buffering': 'no',
				'x-content-type-options': 'nosniff',
			},
		});
	}
}

let singleton: LocalControlCenter | undefined;
export function handleUiRequest(request: Request): Promise<Response> {
	singleton ??= new LocalControlCenter({
		workdir: process.env.YWTC_UI_WORKDIR!,
		port: Number(process.env.PORT),
		bootstrap: process.env.YWTC_UI_BOOTSTRAP!,
	});
	return singleton.handle(request);
}
