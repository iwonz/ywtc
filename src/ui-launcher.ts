import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { resolveWorkspace } from './workspace.js';

export async function launchUi(options: {
	workdir?: string;
	port: number;
	open: boolean;
}): Promise<number> {
	const workspace = await resolveWorkspace(
		options.workdir ? { explicit: options.workdir } : {},
	);
	await new Promise<void>((resolve, reject) => {
		const probe = createServer();
		probe.once('error', () =>
			reject(
				new Error(
					`Port ${options.port} is unavailable. Choose another --port; no existing process was stopped.`,
				),
			),
		);
		probe.listen(options.port, '127.0.0.1', () =>
			probe.close((error) => (error ? reject(error) : resolve())),
		);
	});
	const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
	const compiledRoot = runtimeRoot.endsWith(`${path.sep}src`)
		? path.resolve(runtimeRoot, '../dist')
		: runtimeRoot;
	const server = path.join(compiledRoot, 'web/server.js');
	await access(server).catch(() => {
		throw new Error(
			'Local UI build is missing. Run npm run build before starting ywtc ui.',
		);
	});
	const secret = randomBytes(32).toString('hex'),
		url = `http://127.0.0.1:${options.port}/#${secret}`;
	const child = spawn(process.execPath, [server], {
		cwd: path.dirname(server),
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			HOSTNAME: '127.0.0.1',
			PORT: String(options.port),
			NEXT_TELEMETRY_DISABLED: '1',
			YWTC_UI_WORKDIR: workspace.root,
			YWTC_UI_BOOTSTRAP: secret,
			YWTC_UI_RUNTIME: compiledRoot,
		},
	});
	let stderr = '',
		childError: Error | undefined,
		exited = false;
	child.stdout.resume();
	child.stderr.on('data', (data) => {
		stderr = (stderr + data.toString()).slice(-8000);
	});
	child.once('error', (error) => {
		childError = error;
	});
	child.once('exit', () => {
		exited = true;
	});
	const stop = () => child.kill('SIGTERM');
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
	try {
		let ready = false;
		for (let attempt = 0; attempt < 150 && !exited; attempt++) {
			if (childError) throw childError;
			try {
				const response = await fetch(
					`http://127.0.0.1:${options.port}/api/health`,
					{ signal: AbortSignal.timeout(500) },
				);
				if (response.ok) {
					ready = true;
					break;
				}
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		if (!ready) {
			stop();
			throw new Error(`Local UI did not become ready. ${stderr}`);
		}
		console.log(
			`ywtc control center\n  Workdir  ${workspace.root}\n  URL      ${url}\n  Stop     Ctrl+C (background jobs continue)`,
		);
		if (options.open)
			await open(url, { wait: false }).catch(() =>
				console.log('Open the URL above in your browser.'),
			);
		return await new Promise<number>((resolve) => {
			if (exited) resolve(child.exitCode ?? 0);
			else child.once('exit', (code) => resolve(code ?? 0));
		});
	} finally {
		process.removeListener('SIGINT', stop);
		process.removeListener('SIGTERM', stop);
	}
}
