import { randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
	lstat,
	mkdir,
	open,
	readFile,
	readdir,
	rename,
} from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import {
	acquireExclusiveLease,
	ExclusiveLeaseBusyError,
	type ExclusiveLease,
} from '../exclusive-lease.js';
import {
	jobRequestSchema,
	jobSchema,
	type Job,
	type JobStatus,
	uuid,
} from './contracts.js';
import { boundedPath } from '../local-paths.js';

export interface JobEvent {
	jobId: string;
	sequence: number;
	at: string;
	type: string;
	message?: string;
	data?: unknown;
}
const transitions: Record<JobStatus, JobStatus[]> = {
	queued: ['running', 'finished', 'interrupted'],
	running: ['stopping', 'finished', 'interrupted'],
	stopping: ['finished', 'interrupted'],
	finished: [],
	interrupted: [],
};
export async function privateDirectory(directory: string): Promise<void> {
	const parent = path.dirname(directory);
	if (parent !== directory) {
		try {
			const info = await lstat(parent);
			if (info.isSymbolicLink()) throw new Error('Unsafe symlink boundary');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			await privateDirectory(parent);
		}
	}
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const info = await lstat(directory);
	if (!info.isDirectory() || info.isSymbolicLink())
		throw new Error('Unsafe symlink directory boundary');
}
export async function atomicJson(
	filename: string,
	value: unknown,
): Promise<void> {
	await privateDirectory(path.dirname(filename));
	const temporary = `${filename}.${randomUUID()}.tmp`,
		handle = await open(temporary, 'wx', 0o600);
	try {
		await handle.writeFile(`${JSON.stringify(value)}\n`);
		await handle.sync();
	} finally {
		await handle.close();
	}
	await rename(temporary, filename);
  const directory = await open(path.dirname(filename), 'r');
  try {await directory.sync();} finally {await directory.close();}
}
export class JobStore {
	private writes: Promise<unknown> = Promise.resolve();
	readonly directory: string;
	constructor(workdir: string) {
		this.directory = path.join(path.resolve(workdir), '.states', 'jobs');
	}
	filename(id: string): string {
		if (!uuid.safeParse(id).success)
			throw new Error('Job ID must be a canonical UUID');
		return path.join(this.directory, id, 'job.json');
	}
	async create(
		request: unknown,
		prepared?: import('../operations.js').PreparedOperation,
	): Promise<Job> {
		const checked = jobRequestSchema.parse(request),
			now = new Date().toISOString();
		await boundedPath(
			path.dirname(path.dirname(this.directory)),
			'.states/jobs',
			true,
		);
		const job: Job = {
			id: randomUUID(),
			request: checked,
			status: 'queued',
			createdAt: now,
			updatedAt: now,
			lastSequence: 0,
		};
		if (prepared)
			await atomicJson(
				path.join(path.dirname(this.filename(job.id)), 'prepared.json'),
				prepared,
			);
		await atomicJson(this.filename(job.id), job);
		return job;
	}
	async get(id: string): Promise<Job> {
		const filename = this.filename(id),
			directory = path.dirname(filename);
		for (const target of [
			path.dirname(this.directory),
			this.directory,
			directory,
			filename,
		]) {
			const info = await lstat(target);
			if (info.isSymbolicLink()) throw new Error('Unsafe symlink boundary');
		}
		return jobSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
	}
	async list(options: { activeOnly?: boolean } = {}): Promise<Job[]> {
		let names: string[];
		try {
			names = await readdir(this.directory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
		const jobs: Job[] = [];
		for (const name of names)
			if (uuid.safeParse(name).success) jobs.push(await this.get(name));
		return jobs
			.filter(
				(job) =>
					!options.activeOnly ||
					['queued', 'running', 'stopping'].includes(job.status),
			)
			.sort(
				(a, b) =>
					a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
			);
	}
	private async mutate(
		id: string,
		update: (job: Job) => Promise<void> | void,
	): Promise<Job> {
		const result = this.writes.then(() => this.mutateExclusive(id, update));
		this.writes = result.catch(() => undefined);
		return result;
	}
	private async mutateExclusive(
		id: string,
		update: (job: Job) => Promise<void> | void,
	): Promise<Job> {
		await this.get(id);
		let lease: ExclusiveLease | undefined;
		for (let attempt = 0; !lease; attempt++) {
			try {
				lease = await acquireExclusiveLease(
					`${this.filename(id)}.lock`,
					'job evidence',
					id,
				);
			} catch (error) {
				if (!(error instanceof ExclusiveLeaseBusyError) || attempt >= 100)
					throw error;
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		}
		try {
			const job = await this.get(id);
			await update(job);
			job.updatedAt = new Date().toISOString();
			await atomicJson(this.filename(id), jobSchema.parse(job));
			return job;
		} finally {
			await lease.release();
		}
	}
	async transition(
		id: string,
		status: JobStatus,
		evidence: Partial<
			Pick<Job, 'pid' | 'nonce' | 'result' | 'error' | 'runId' | 'heartbeatAt'>
		> = {},
		expected?: JobStatus,
	): Promise<Job> {
		return this.mutate(id, (job) => {
			if (expected && job.status !== expected)
				throw new Error('Job status changed; reload before controlling it');
			if (job.status !== status && !transitions[job.status].includes(status))
				throw new Error(`Invalid job transition ${job.status} -> ${status}`);
			Object.assign(job, evidence, { status });
		});
	}
	async evidence(
		id: string,
		evidence: Partial<Pick<Job, 'runId' | 'heartbeatAt' | 'pid'>>,
	): Promise<Job> {
		return this.mutate(id, (job) => {
			Object.assign(job, evidence);
		});
	}
	async append(
		id: string,
		event: Omit<JobEvent, 'jobId' | 'sequence' | 'at'>,
	): Promise<JobEvent> {
		let result!: JobEvent;
		await this.mutate(id, async (job) => {
			const journal = path.join(
				path.dirname(this.filename(id)),
				'events.ndjson',
			);
			const handle = await open(
				journal,
				constants.O_CREAT |
					constants.O_RDWR |
					constants.O_APPEND |
					constants.O_NOFOLLOW,
				0o600,
			);
			try {
				const size = (await handle.stat()).size;
				if (size) {
					const tail = Buffer.alloc(Math.min(size, 1024 * 1024));
					await handle.read(tail, 0, tail.length, size - tail.length);
					const end = tail.lastIndexOf(10);
					if (end < 0)
						throw new Error('Event journal has no complete bounded record');
					if (end < tail.length - 1)
						await handle.truncate(size - tail.length + end + 1);
					const start = tail.lastIndexOf(10, end - 1) + 1;
					const previous = JSON.parse(
						tail.subarray(start, end).toString('utf8'),
					) as JobEvent;
					if (previous.jobId !== id || !Number.isSafeInteger(previous.sequence))
						throw new Error('Invalid event journal ownership');
					job.lastSequence = Math.max(job.lastSequence, previous.sequence);
				}
				result = {
					...event,
					jobId: id,
					sequence: job.lastSequence + 1,
					at: new Date().toISOString(),
				};
				await handle.writeFile(`${JSON.stringify(result)}\n`);
				await handle.sync();
				job.lastSequence = result.sequence;
				job.heartbeatAt = result.at;
				if (event.type === 'progress') job.progress = event.data;
				if (event.type === 'inventory')
					job.inventory = (
						event.data as { counts: Record<string, number> }
					).counts;
			} finally {
				await handle.close();
			}
		});
		return result;
	}
	async events(
		id: string,
		after = 0,
		limit = 250,
	): Promise<{ events: JobEvent[]; reset: boolean; job: Job }> {
		const job = await this.get(id),
			events: JobEvent[] = [],
			reset =
				!Number.isSafeInteger(after) || after < 0 || after > job.lastSequence;
		if (reset || !job.lastSequence) return { events, reset, job };
		const journal = path.join(path.dirname(this.filename(id)), 'events.ndjson');
		try {
			if ((await lstat(journal)).isSymbolicLink())
				throw new Error('Unsafe symlink journal boundary');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT')
				return { events, reset: true, job };
			throw error;
		}
		const stream = createReadStream(journal),
			lines = createInterface({ input: stream, crlfDelay: Infinity });
		try {
			for await (const line of lines) {
				let event: JobEvent;
				try {
					event = JSON.parse(line) as JobEvent;
				} catch {
					continue;
				}
				if (event.sequence > after) {
					if (
						event.jobId !== id ||
						event.sequence !== after + events.length + 1
					)
						return { events: [], reset: true, job };
					events.push(event);
				}
				if (events.length >= Math.max(1, Math.min(1_000, limit))) break;
			}
		} finally {
			lines.close();
			stream.destroy();
		}
		return {
			events,
			reset: reset || (!events.length && after < job.lastSequence),
			job,
		};
	}
}
