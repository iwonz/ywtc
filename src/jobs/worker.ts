import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	executeOperation,
	OperationCancelled,
	type OperationResult,
	type PreparedOperation,
} from '../operations.js';
import type { OperationEvent } from '../operation-events.js';
import { resolveWorkspace, type Workspace } from '../workspace.js';
import { JobStore, atomicJson } from './store.js';
import { jobPath } from './runtime.js';

export async function runWorker(
	workspace: Workspace,
	id: string,
	nonce: string,
): Promise<void> {
	const store = new JobStore(workspace.root),
		job = await store.get(id);
	if (job.nonce !== nonce || job.status !== 'running')
		throw new Error('Worker identity is not the accepted job owner');
	const controller = new AbortController();
	let writes = Promise.resolve(),
		lastSnapshot = 0,
		lastPhase = '',
		finished = false,
		orphaned = false;
	const queue = (operation: () => Promise<unknown>) => {
		writes = writes.then(operation).then(() => undefined);
	};
	const emit = (event: OperationEvent): void => {
		if (event.type === 'progress') {
			const now = Date.now();
			if (
				event.reason !== 'heartbeat' &&
				event.phase === lastPhase &&
				now - lastSnapshot < 750
			)
				return;
			lastSnapshot = now;
			lastPhase = event.phase;
		}
		queue(async () => {
			await store.append(id, {
				type: event.type,
				...(event.type === 'message' ? { message: event.message } : {}),
				data: event,
			});
			if (event.type === 'run')
				await store.evidence(id, { runId: event.runId });
		});
	};
	const cancel = (code: number) => {
		if (!controller.signal.aborted)
			controller.abort(new OperationCancelled(code === 143 ? 143 : 130));
	};
	const message = (value: unknown) => {
		const data = value as { type?: string; nonce?: string; exitCode?: number };
		if (data?.type === 'cancel' && data.nonce === id)
			cancel(data.exitCode ?? 130);
	};
	const disconnected = () => {
		if (!finished) {
			orphaned = true;
			cancel(143);
		}
	};
	const interrupt = () => cancel(130),
		terminate = () => cancel(143);
	process.on('message', message);
	process.once('disconnect', disconnected);
	process.once('SIGINT', interrupt);
	process.once('SIGTERM', terminate);
	const poll = setInterval(() => {
		readFile(jobPath(workspace.root, id, 'cancel.json'), 'utf8')
			.then((text) => {
				const data = JSON.parse(text);
				if (data.nonce === nonce) cancel(data.exitCode);
			})
			.catch(() => undefined);
	}, 250);
	const heartbeat = setInterval(() => {
		queue(() =>
			store.append(id, {
				type: 'heartbeat',
				data: { at: new Date().toISOString() },
			}),
		);
	}, 5000);
	let result: OperationResult;
	try {
		const prepared = JSON.parse(
			await readFile(jobPath(workspace.root, id, 'prepared.json'), 'utf8'),
		) as PreparedOperation;
		result = await executeOperation(prepared, workspace, {
			signal: controller.signal,
			onEvent: emit,
		});
	} catch (error) {
		result = {
			exitCode: 2,
			status: 'failed',
			error: error instanceof Error ? error.message : 'Worker failed',
		};
	} finally {
		clearInterval(poll);
		clearInterval(heartbeat);
		process.removeListener('message', message);
		process.removeListener('disconnect', disconnected);
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', terminate);
	}
	await writes;
	await atomicJson(jobPath(workspace.root, id, 'result.json'), result);
	const { transfer: _transfer, error, ...summary } = result;
	await store.append(id, { type: 'final', data: summary });
	await store.transition(id, orphaned ? 'interrupted' : 'finished', {
		result: summary,
		...(error ? { error } : {}),
	});
	finished = true;
	if (process.connected) process.disconnect?.();
}
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	resolveWorkspace({ explicit: process.argv[2] ?? '' })
		.then((workspace) =>
			runWorker(workspace, process.argv[3] ?? '', process.argv[4] ?? ''),
		)
		.catch((error) => {
			console.error((error as Error).message);
			process.exitCode = 2;
		});
}
