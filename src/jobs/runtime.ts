import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export function jobEntrypoint(name: 'worker' | 'coordinator'): {
	entry: string;
	execArgv: string[];
} {
	const source = import.meta.url.endsWith('.ts');
	return {
		entry: fileURLToPath(
			new URL(`./${name}.${source ? 'ts' : 'js'}`, import.meta.url),
		),
		execArgv: source
			? [
					'--import',
					pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href,
				]
			: [],
	};
}
export const jobPath = (
	workdir: string,
	id: string,
	filename: string,
): string => path.join(workdir, '.states', 'jobs', id, filename);
function processIsAlive(pid: number | undefined): boolean {
	if (!pid || !Number.isSafeInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}
export async function ownedWorkerIsAlive(job: {
	pid?: number | undefined;
	nonce?: string | undefined;
	id: string;
}): Promise<boolean | undefined> {
	if (!processIsAlive(job.pid)) return false;
	if (!job.nonce) return undefined;
	try {
		const { stdout } = await promisify(execFile)(
			'ps',
			['-p', String(job.pid), '-o', 'command='],
			{ timeout: 2000, maxBuffer: 65536 },
		);
		return (
			stdout.includes(job.id) &&
			stdout.includes(job.nonce) &&
			/worker\.(?:ts|js)/.test(stdout)
		);
	} catch {
		return processIsAlive(job.pid) ? undefined : false;
	}
}
