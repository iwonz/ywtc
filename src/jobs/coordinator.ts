import { fork, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	acquireExclusiveLease,
	ExclusiveLeaseBusyError,
} from '../exclusive-lease.js';
import { resolveWorkspace, type Workspace } from '../workspace.js';
import { jobEntrypoint, ownedWorkerIsAlive } from './runtime.js';
import { atomicJson, JobStore } from './store.js';

export async function runCoordinator(workspace: Workspace): Promise<void> {
	const directory = path.join(workspace.statesDirectory, 'jobs');
	const lease = await acquireExclusiveLease(
		path.join(directory, 'coordinator.lock'),
		'workspace job coordinator',
		workspace.root,
	);
	const nonce = randomBytes(32).toString('hex'),
		store = new JobStore(workspace.root);
	let closing = false,
		epoch = 0,
		worker: ChildProcess | undefined,
		activeId: string | undefined;
	const server = createServer((socket) => {
		let body = '';
		socket.setTimeout(2000, () => socket.destroy());
		socket.on('error', () => undefined);
		socket.on('data', (chunk) => {
			body += chunk.toString();
			if (body.length > 65536) {
				socket.destroy();
				return;
			}
			if (!body.includes('\n')) return;
			try {
				const request = JSON.parse(body.split('\n')[0]!);
				if (
					request.nonce !== nonce ||
					closing ||
					!['ping', 'wake', 'stop'].includes(request.operation)
				) {
					socket.end('{"ok":false}\n');
					return;
				}
				epoch++;
				if (
					request.operation === 'stop' &&
					request.id === activeId &&
					worker?.connected
				)
					worker.send({
						type: 'cancel',
						nonce: activeId,
						exitCode: request.exitCode === 143 ? 143 : 130,
					});
				socket.end(`${JSON.stringify({ ok: true, nonce })}\n`);
			} catch {
				socket.destroy();
			}
		});
	});
	const shutdown = () => {
		closing = true;
		if (worker?.connected)
			worker.send({ type: 'cancel', nonce: activeId, exitCode: 143 });
	};
	process.once('SIGINT', shutdown);
	process.once('SIGTERM', shutdown);
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const address = server.address();
		if (!address || typeof address === 'string')
			throw new Error('Coordinator IPC did not bind');
		await atomicJson(path.join(directory, 'coordinator.json'), {
			port: address.port,
			nonce,
			pid: process.pid,
		});
		while (!closing) {
			const before = epoch,
				jobs = await store.list({ activeOnly: true });
			const orphan = jobs.find(
				(job) => job.status === 'running' || job.status === 'stopping',
			);
			if (orphan) {
				if ((await ownedWorkerIsAlive(orphan)) !== false) {
					await new Promise((resolve) => setTimeout(resolve, 250));
					continue;
				}
				await store.transition(orphan.id, 'interrupted', {
					error:
						'Worker disappeared without a confirmed result; continue explicitly',
				});
				continue;
			}
			const next = jobs.find((job) => job.status === 'queued');
			if (!next) {
				await new Promise((resolve) => setTimeout(resolve, 250));
				if (epoch !== before || (await store.list({ activeOnly: true })).length)
					continue;
				closing = true;
				break;
			}
			const workerNonce = randomBytes(24).toString('hex');
			try {
				await store.transition(
					next.id,
					'running',
					{ nonce: workerNonce },
					'queued',
				);
			} catch {
				continue;
			}
			const runtime = jobEntrypoint('worker'),
				log = await open(
					path.join(directory, next.id, 'worker.log'),
					'a',
					0o600,
				);
			activeId = next.id;
			worker = fork(runtime.entry, [workspace.root, next.id, workerNonce], {
				cwd: workspace.root,
				execArgv: runtime.execArgv,
				stdio: ['ignore', log.fd, log.fd, 'ipc'],
				windowsHide: true,
			});
			await log.close();
			if (worker.pid) await store.evidence(next.id, { pid: worker.pid });
			await new Promise<void>((resolve) => {
				worker!.once('exit', () => resolve());
				worker!.once('error', () => resolve());
			});
			const completed = await store.get(next.id);
			if (!['finished', 'interrupted'].includes(completed.status))
				await store.transition(next.id, 'interrupted', {
					error: 'Worker exited before confirming completion',
				});
			worker = undefined;
			activeId = undefined;
		}
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		try {
			const current = JSON.parse(
				await readFile(path.join(directory, 'coordinator.json'), 'utf8'),
			);
			if (current.nonce === nonce)
				await unlink(path.join(directory, 'coordinator.json'));
		} catch {
			/* A stale endpoint is rejected by authenticated probing. */
		}
		await lease.release();
		process.removeListener('SIGINT', shutdown);
		process.removeListener('SIGTERM', shutdown);
	}
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	resolveWorkspace({ explicit: process.argv[2] ?? '' })
		.then(runCoordinator)
		.catch((error) => {
			if (!(error instanceof ExclusiveLeaseBusyError)) {
				console.error((error as Error).message);
				process.exitCode = 2;
			}
		});
}
