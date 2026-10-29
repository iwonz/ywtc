import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Listr } from 'listr2';
import type { CliCommand } from '../cli-arguments.js';
import {
	migrationContinuationCommand,
	presentMigrationResult,
	type MigrationCommandOutcome,
	type ReadyMigrationCommand,
} from '../migration-command.js';
import type { ProgressSnapshot } from '../operation-events.js';
import type { RetryExecution } from '../retry-plan.js';
import { resolveWorkspace, type Workspace } from '../workspace.js';
import {
	readJobResult,
	reconcileInterruptedJobs,
	stopJob,
	submitJob,
	waitForJob,
} from './client.js';
import type { JobRequest } from './contracts.js';
import { JobStore, type JobEvent } from './store.js';

function jobEventLabel(event: JobEvent): string | undefined {
	if (event.message) return event.message;
	if (event.type === 'progress') {
		const data = event.data as ProgressSnapshot;
		return `${data.reason === 'heartbeat' ? 'Still working · ' : ''}${data.phase}${data.completed !== undefined ? ` · ${data.completed}${data.total !== undefined ? `/${data.total}` : ''} ${data.unit ?? ''}` : ''}${data.detail ? ` · ${data.detail}` : ''}${data.active.length ? ` · active ${data.active.map((item) => item.label).join('; ')}` : ''}`;
	}
	if (event.type === 'diagnostic') {
		const data = event.data as { message?: string; code?: string };
		return `${data.code}: ${data.message}`;
	}
	return undefined;
}
function accepted(id: string, workspace: Workspace): void {
	console.log(
		`\n◆ Background job accepted\n  Job ID    ${id}\n  Status    queued\n  Inspect   ywtc migrations show ${id} --workdir ${JSON.stringify(workspace.root)}\n  Logs      ywtc migrations logs ${id} --follow --workdir ${JSON.stringify(workspace.root)}`,
	);
}
async function foreground(workspace: Workspace, id: string): Promise<void> {
	const interrupt = () => {
			void stopJob(workspace, id, 130);
		},
		terminate = () => {
			void stopJob(workspace, id, 143);
		};
	process.once('SIGINT', interrupt);
	process.once('SIGTERM', terminate);
	try {
		const tasks = new Listr(
			[
				{
					title: 'Discover, transfer, and verify',
					task: async (_context, task) => {
						await waitForJob(workspace, id, (event) => {
							const label = jobEventLabel(event);
							if (label) task.output = label;
						});
					},
				},
			],
			{
				renderer: process.stdout.isTTY ? 'default' : 'simple',
				registerSignalListeners: false,
				rendererOptions: { collapseErrors: false, collapseSubtasks: false },
			},
		);
		await tasks.run();
	} finally {
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', terminate);
	}
}
export async function runManagedMigration(
	command: ReadyMigrationCommand,
	retry?: RetryExecution,
): Promise<MigrationCommandOutcome> {
	const workspace = await resolveWorkspace(
		command.workdir ? { explicit: command.workdir } : {},
	);
	const request: JobRequest = retry
		? {
				kind: 'retry',
				runId: retry.rootRunId,
				dryRun: command.dryRun,
				...(command.concurrency !== undefined
					? { concurrency: command.concurrency }
					: {}),
				...(command.rewrite ? { rewrite: true } : {}),
			}
		: {
				kind: 'migrate',
				source: command.source,
				destination: command.destination,
				scope: command.scope,
				sourceStatus: command.sourceStatus,
				comments: command.comments,
				dryRun: command.dryRun,
				archive: command.archive,
				fresh: command.fresh,
				...(command.sourceProfile
					? { sourceProfile: command.sourceProfile }
					: {}),
				...(command.destinationProfile
					? { destinationProfile: command.destinationProfile }
					: {}),
				...(command.format ? { format: command.format } : {}),
				...(command.stateFilename
					? { stateFilename: command.stateFilename }
					: {}),
				...(command.concurrency !== undefined
					? { concurrency: command.concurrency }
					: {}),
				...(command.rewrite ? { rewrite: true } : {}),
			};
	const job = await submitJob(workspace, request);
	if (command.background) {
		accepted(job.id, workspace);
		return { code: 0, workspaceRoot: workspace.root };
	}
	console.log(
		`\n◆ ywtc ${retry ? 'targeted retry' : 'transfer'}\n  Workdir      ${workspace.root}\n  Source       ${command.source}\n  Destination  ${command.destination}\n  Scope        ${command.scope}\n  Source state ${command.sourceStatus}\n  Comments     ${command.comments ? 'enabled' : 'disabled'}\n  Mode         ${command.dryRun ? 'dry-run · read-only' : 'live'}\n  Job ID       ${job.id}`,
	);
	await foreground(workspace, job.id);
	const result = await readJobResult(workspace, job.id),
		final = await new JobStore(workspace.root).get(job.id);
	if (result?.transfer)
		return presentMigrationResult(
			result.transfer,
			command,
			workspace.root,
			retry,
		);
	console.log(
		`\n◆ ${final.status === 'interrupted' ? 'Transfer interrupted' : result?.status === 'completed' ? 'Migration is already complete' : 'Transfer finished'}\n  Status   ${result?.status ?? final.status}\n  Job ID   ${job.id}`,
	);
	if (result?.reportHtml)
		console.log(
			`  Report   ${pathToFileURL(result.reportHtml).href}\n  Open     ywtc reports open ${result.runId} --workdir ${JSON.stringify(workspace.root)}`,
		);
	if (result?.reportHtml && command.openReport) {
		try {
			await (await import('../report-catalog.js')).openReportFile(
				result.reportHtml,
			);
		} catch (error) {
			console.warn(String(error));
		}
	}
	if (result?.error || final.status === 'interrupted')
		console.log(
			`  Resume   ${migrationContinuationCommand(command, workspace.root, result?.runId, retry)}`,
		);
	if (result?.error || final.error)
		console.error(`ERROR ${result?.error ?? final.error}`);
	return {
		code: result?.exitCode ?? 1,
		workspaceRoot: workspace.root,
		...(result?.reportHtml && result.reportJson && result.runId
			? {
					reportPaths: {
						runId: result.runId,
						directory: path.dirname(result.reportHtml),
						html: result.reportHtml,
						json: result.reportJson,
					},
				}
			: {}),
	};
}
export async function runManagedExport(
	command: Extract<
		CliCommand,
		{ command: 'mentions-export' | 'hashtags-export' }
	>,
): Promise<number> {
	const workspace = await resolveWorkspace(
		command.workdir ? { explicit: command.workdir } : {},
	);
	const job = await submitJob(workspace, {
		kind: 'scan',
		source: command.source,
		scope: command.scope,
		sourceStatus: command.sourceStatus,
		comments: command.comments,
		kinds: [command.command === 'mentions-export' ? 'mentions' : 'hashtags'],
		output: command.output,
		...(command.sourceProfile ? { sourceProfile: command.sourceProfile } : {}),
		...(command.concurrency !== undefined
			? { concurrency: command.concurrency }
			: {}),
	});
	if (command.background) {
		accepted(job.id, workspace);
		return 0;
	}
	await foreground(workspace, job.id);
	const result = await readJobResult(workspace, job.id);
	if (result?.output) {
		const json = path.join(path.dirname(result.output), 'decisions.json'),
			document = JSON.parse(await readFile(json, 'utf8'));
		console.log(
			`\n◆ ${command.command === 'mentions-export' ? 'Mention' : 'Hashtag'} decisions exported\n  Entries    ${document.entries.length}\n  Inventory  ${document.inventory?.complete ? 'complete' : 'incomplete'}\n  JSON       ${json}\n  Editor     ${result.output}\n  URL        ${pathToFileURL(result.output).href}`,
		);
		for (const issue of document.inventory?.issues ?? [])
			console.error(`  ${issue.code}: ${issue.message}`);
	}
	if (result?.error) console.error(`ERROR ${result.error}`);
	return result?.exitCode ?? 1;
}
export async function runMigrationsCommand(
	command: Extract<CliCommand, { command: 'migrations' }>,
): Promise<number> {
	const workspace = await resolveWorkspace(
			command.workdir ? { explicit: command.workdir } : {},
		),
		store = new JobStore(workspace.root);
	await reconcileInterruptedJobs(workspace);
	if (command.action === 'list') {
		const jobs = await store.list({ activeOnly: !command.all });
		console.log(`\n◆ Workspace jobs\n  Workdir  ${workspace.root}`);
		for (const job of jobs)
			console.log(
				`  ${job.id}  ${job.status}  ${job.request.kind}  ${job.createdAt}${job.runId ? `  Run ${job.runId}` : ''}`,
			);
		if (!jobs.length) console.log('  No matching jobs');
		return 0;
	}
	const id = command.jobId!;
	if (command.action === 'stop') {
		const job = await stopJob(workspace, id);
		console.log(`${job.id}  ${job.status}`);
		return 0;
	}
	if (command.action === 'show') {
		const { nonce: _nonce, ...job } = await store.get(id);
		console.log(
			command.json
				? JSON.stringify(job, null, 2)
				: `${job.id}\n  Status  ${job.status}\n  Kind    ${job.request.kind}\n  Run ID  ${job.runId ?? 'not created'}\n  Result  ${job.result?.status ?? 'not confirmed'}${job.error ? `\n  Error   ${job.error}` : ''}`,
		);
		return 0;
	}
	const print = (event: JobEvent) => {
		const label = jobEventLabel(event);
		if (label) console.log(`${event.at} ${label}`);
	};
	if (command.follow) await waitForJob(workspace, id, print);
	else {
		let cursor = 0;
		for (;;) {
			const batch = await store.events(id, cursor, 1000);
			for (const event of batch.events) {
				cursor = event.sequence;
				print(event);
			}
			if (!batch.events.length || cursor >= batch.job.lastSequence) break;
		}
	}
	return 0;
}
