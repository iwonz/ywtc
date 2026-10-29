import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareOperation } from '../operations.js';
import type { OperationResult } from '../operations.js';
import { initializeWorkspace, type Workspace } from '../workspace.js';
import {
	atomicJson,
	JobStore,
	privateDirectory,
	type JobEvent,
} from './store.js';
import { jobEntrypoint, jobPath, ownedWorkerIsAlive } from './runtime.js';
import type { Job } from './contracts.js';

interface CoordinatorEndpoint {
	port: number;
	nonce: string;
	pid: number;
}
async function coordinatorRequest(
	workspace: Workspace,
	operation: 'ping' | 'wake' | 'stop',
	id?: string,
	exitCode = 130,
): Promise<boolean> {
	let endpoint: CoordinatorEndpoint;
	try {
		endpoint = JSON.parse(
			await readFile(
				path.join(workspace.statesDirectory, 'jobs/coordinator.json'),
				'utf8',
			),
		);
	} catch {
		return false;
	}
	if (
		!Number.isInteger(endpoint.port) ||
		endpoint.port < 1 ||
		endpoint.port > 65535 ||
		typeof endpoint.nonce !== 'string'
	)
		return false;
	return new Promise((resolve) => {
		const connection = createConnection({
			host: '127.0.0.1',
			port: endpoint.port,
		});
		let body = '',
			settled = false;
		const done = (value: boolean) => {
			if (settled) return;
			settled = true;
			connection.destroy();
			resolve(value);
		};
		connection.setTimeout(1500, () => done(false));
		connection.on('error', () => done(false));
		connection.on('connect', () =>
			connection.write(
				`${JSON.stringify({ nonce: endpoint.nonce, operation, id, exitCode })}\n`,
			),
		);
		connection.on('data', (data) => {
			body += data.toString();
			if (body.length > 65536) return done(false);
			if (body.includes('\n')) {
				try {
					const response = JSON.parse(body.split('\n')[0]!);
					done(response.ok === true && response.nonce === endpoint.nonce);
				} catch {
					done(false);
				}
			}
		});
		connection.on('end', () => done(false));
	});
}
async function ensureCoordinator(workspace: Workspace): Promise<void> {
	if (await coordinatorRequest(workspace, 'wake')) return;
	const directory = path.join(workspace.statesDirectory, 'jobs');
	await privateDirectory(directory);
	const log = await open(path.join(directory, 'coordinator.log'), 'a', 0o600),
		runtime = jobEntrypoint('coordinator');
	const child = spawn(
		process.execPath,
		[...runtime.execArgv, runtime.entry, workspace.root],
		{
			cwd: workspace.root,
			detached: true,
			stdio: ['ignore', log.fd, log.fd],
			windowsHide: true,
		},
	);
	child.unref();
	await log.close();
	let error: Error | undefined;
	child.once('error', (cause) => {
		error = cause;
	});
	for (let attempt = 0; attempt < 80; attempt++) {
		if (error) throw error;
		if (await coordinatorRequest(workspace, 'wake')) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(
		`Job accepted but coordinator did not acknowledge startup; inspect ${path.join(directory, 'coordinator.log')}`,
	);
}
export async function submitJob(
	workspace: Workspace,
	value: unknown,
	cwd = process.cwd(),
): Promise<Job> {
	await initializeWorkspace(workspace);
	const prepared = await prepareOperation(value, workspace, cwd),
		job = await new JobStore(workspace.root).create(prepared.request, prepared);
	await ensureCoordinator(workspace);
	return job;
}
export async function stopJob(
	workspace: Workspace,
	id: string,
	exitCode = 130,
): Promise<Job> {
	const store = new JobStore(workspace.root);
	let job = await store.get(id);
	if (['finished', 'interrupted'].includes(job.status)) return job;
	if (job.status === 'queued') {
		try {
			return await store.transition(
				id,
				'finished',
				{ result: { status: 'cancelled', exitCode } },
				'queued',
			);
		} catch {
			job = await store.get(id);
			if (['finished', 'interrupted'].includes(job.status)) return job;
		}
	}
	if (!job.nonce)
		throw new Error(
			'Worker identity unavailable; do not signal an unverified process',
		);
	await atomicJson(jobPath(workspace.root, id, 'cancel.json'), {
		nonce: job.nonce,
		exitCode,
	});
	await coordinatorRequest(workspace, 'stop', id, exitCode);
	job = await store.get(id);
	if (job.status === 'running')
		return store.transition(id, 'stopping', {}, 'running');
	return job;
}
export async function waitForJob(
	workspace: Workspace,
	id: string,
	onEvent?: (event: JobEvent) => void,
): Promise<Job> {
	const store = new JobStore(workspace.root);
	let cursor = 0;
	for (;;) {
		const batch = await store.events(id, cursor);
		if (batch.reset) cursor = batch.job.lastSequence;
		for (const event of batch.events) {
			cursor = event.sequence;
			onEvent?.(event);
		}
		if (
			['finished', 'interrupted'].includes(batch.job.status) &&
			cursor >= batch.job.lastSequence
		)
			return batch.job;
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
}
export async function reconcileInterruptedJobs(
	workspace: Workspace,
): Promise<void> {
	const store = new JobStore(workspace.root);
	if (await coordinatorRequest(workspace, 'ping')) return;
	for (const job of await store.list({ activeOnly: true })) {
		if (job.status !== 'running' && job.status !== 'stopping') continue;
		if ((await ownedWorkerIsAlive(job)) === false)
			await store
				.transition(
					job.id,
					'interrupted',
					{
						error: 'The owned worker is no longer present; continue explicitly',
					},
					job.status,
				)
				.catch(() => undefined);
	}
}
export async function readJobResult(
	workspace: Workspace,
	id: string,
): Promise<OperationResult | undefined> {
	const job = await new JobStore(workspace.root).get(id);
	try {
		return JSON.parse(
			await readFile(jobPath(workspace.root, job.id, 'result.json'), 'utf8'),
		) as OperationResult;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}
