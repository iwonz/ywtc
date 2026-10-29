import { execFile } from "node:child_process";
import {
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

type Manifest = {
	name: string;
	version: string;
	main?: string;
	types?: string;
	typings?: string;
	exports?: unknown;
	files?: string[];
	bundleDependencies?: string[];
	bundledDependencies?: unknown;
	overrides?: unknown;
	scripts?: unknown;
	bin?: unknown;
	devDependencies?: unknown;
	peerDependenciesMeta?: unknown;
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};
type Locked = { version?: string; name?: string; inBundle?: boolean };
const exec = promisify(execFile);
async function json<T>(filename: string): Promise<T> {
	return JSON.parse(await readFile(filename, "utf8")) as T;
}
function relativePath(value: string): string {
	if (
		!value ||
		value === "." ||
		path.posix.isAbsolute(value) ||
		value.includes("\\") ||
		path.posix.normalize(value) !== value ||
		value.split("/").includes("..")
	)
		throw Error("Unsafe publication path");
	return value;
}
async function copyPackageFiles(
	source: string,
	destination: string,
	bundled: boolean,
): Promise<void> {
	await cp(source, destination, {
		recursive: true,
		filter: async (filename) => {
			if (
				bundled &&
				path.relative(source, filename).split(path.sep).includes("node_modules")
			)
				return false;
			if ((await lstat(filename)).isSymbolicLink())
				throw Error("Publication symlink is not permitted");
			return true;
		},
	});
}

export async function prepareReleaseStaging(
	inputRoot: string,
	stage: string,
): Promise<void> {
	const root = await realpath(inputRoot);
	if (
		path.resolve(stage) === root ||
		path.resolve(stage).startsWith(`${root}${path.sep}`)
	)
		throw Error("Publication staging must be outside the source checkout");
	await mkdir(stage, { recursive: true });
	stage = await realpath(stage);
	if (stage === root || stage.startsWith(`${root}${path.sep}`))
		throw Error("Publication staging must be outside the source checkout");
	if ((await readdir(stage)).length)
		throw Error("Publication staging must be empty");
	const pkg = await json<Manifest>(path.join(root, "package.json"));
	const lock = await json<{
		version: string;
		packages: Record<string, Locked>;
	}>(path.join(root, "package-lock.json"));
	if (
		pkg.version !== lock.version ||
		pkg.version !== lock.packages[""]?.version
	)
		throw Error("Package/lock version mismatch; run npm ci");
	const bundled = new Map<string, { source: string; manifest: Manifest }>();
	for (const [key, expected] of Object.entries(lock.packages)) {
		if (!expected.inBundle) continue;
		relativePath(key);
		if (!key.startsWith("node_modules/"))
			throw Error("Invalid bundled package path");
		const source = path.join(root, key);
		const resolved = await realpath(source).catch(() => {
			throw Error(`Missing locked bundled package ${key}; run npm ci`);
		});
		if (
			resolved !== source ||
			!resolved.startsWith(`${root}${path.sep}node_modules${path.sep}`)
		)
			throw Error("Escaping bundled package path or symlink");
		const manifest = await json<Manifest>(path.join(source, "package.json"));
		if (
			!manifest.name ||
			!manifest.version ||
			manifest.version !== expected.version ||
			(expected.name && manifest.name !== expected.name)
		)
			throw Error(`Locked bundled version mismatch for ${key}; run npm ci`);
		bundled.set(key, { source, manifest });
	}
	if (
		pkg.bundleDependencies?.some((name) => !bundled.has(`node_modules/${name}`))
	)
		throw Error("Incomplete bundled dependency closure");
	if ((pkg.bundleDependencies?.length ?? 0) > 1)
		throw Error("Only one isolated audited runtime bundle is supported");
	const bundleName = pkg.bundleDependencies?.[0];
	const runtime = bundleName
		? path.join(stage, "node_modules", bundleName, "runtime")
		: stage;
	function binding(from: string, name: string): Manifest | undefined {
		for (let cursor = from; ; cursor = path.posix.dirname(cursor)) {
			const found = bundled.get(path.posix.join(cursor, "node_modules", name));
			if (found) return found.manifest;
			if (cursor === ".") return;
		}
	}
	for (const file of pkg.files ?? []) {
		relativePath(file);
		if (
			/^(?:node_modules|\.states|\.env)(?:\/|$)/.test(file) ||
			file === "ywtc.config.yaml"
		)
			throw Error("Runtime files are not publication inputs");
		await copyPackageFiles(
			path.join(root, file),
			path.join(stage, file),
			false,
		);
	}
	for (const [key, { source, manifest }] of bundled) {
		await copyPackageFiles(source, path.join(runtime, key), true);
		const published = structuredClone(manifest);
		for (const group of [
			"dependencies",
			"optionalDependencies",
			"peerDependencies",
		] as const) {
			for (const name of Object.keys(published[group] ?? {})) {
				const actual = binding(key, name);
				if (!actual) {
					if (
						group === "dependencies" &&
						!published.optionalDependencies?.[name]
					)
						throw Error(
							`Incomplete bundled dependency closure: ${key} → ${name}`,
						);
					continue;
				}
				published[group]![name] =
					actual.name === name
						? actual.version
						: `npm:${actual.name}@${actual.version}`;
				// npm-packlist does not reliably include a bundled package's peer-only edges.
				// Materialize every audited peer binding as its own dependency as well.
				if (group === "peerDependencies") {
					if (actual.name !== name)
						throw Error("Unsupported aliased bundled peer dependency");
					published.dependencies ??= {};
					published.dependencies[name] = actual.version;
				}
			}
		}
		delete published.overrides;
		await writeFile(
			path.join(runtime, key, "package.json"),
			`${JSON.stringify(published, null, 2)}\n`,
		);
	}
	if (bundleName) {
		const key = `node_modules/${bundleName}`,
			original = bundled.get(key)!;
		const outer = path.join(stage, key),
			entry = path.posix.join("runtime", key);
		if (original.manifest.exports)
			throw Error("Bundled runtime exports require an explicit adapter");
		const main = relativePath(
			(original.manifest.main ?? "index.js").replace(/^\.\//, ""),
		);
		await lstat(path.join(original.source, main));
		await copyPackageFiles(original.source, outer, true);
		const wrapper = structuredClone(original.manifest);
		wrapper.main = path.posix.join(entry, main);
		wrapper.files = [
			"runtime",
			...(wrapper.files ?? ["lib", "dist", "src", "index.js"]),
		];
		for (const field of [
			"dependencies",
			"optionalDependencies",
			"peerDependencies",
			"peerDependenciesMeta",
			"devDependencies",
			"overrides",
			"scripts",
			"bin",
			"bundleDependencies",
			"bundledDependencies",
		] as const)
			delete wrapper[field];
		for (const field of ["types", "typings"] as const)
			if (wrapper[field])
				wrapper[field] = path.posix.join(
					entry,
					relativePath(wrapper[field]!.replace(/^\.\//, "")),
				);
		// Forward the existing CJS subpaths into the same isolated module instances.
		// In particular lib/log.js must share the transform's diagnostics collector.
		async function forward(directory: string): Promise<void> {
			for (const file of await readdir(directory, { withFileTypes: true })) {
				const filename = path.join(directory, file.name);
				if (file.isDirectory()) await forward(filename);
				else if (file.name.endsWith(".js")) {
					const target = path.join(
						runtime,
						key,
						path.relative(outer, filename),
					);
					let request = path
						.relative(path.dirname(filename), target)
						.split(path.sep)
						.join("/");
					if (!request.startsWith(".")) request = `./${request}`;
					await writeFile(
						filename,
						`module.exports = require(${JSON.stringify(request)});\n`,
					);
				}
			}
		}
		if (
			await lstat(path.join(outer, "lib"))
				.then((s) => s.isDirectory())
				.catch(() => false)
		)
			await forward(path.join(outer, "lib"));
		await writeFile(
			path.join(outer, "package.json"),
			`${JSON.stringify(wrapper, null, 2)}\n`,
		);
	}
	delete pkg.overrides;
	await writeFile(
		path.join(stage, "package.json"),
		`${JSON.stringify(pkg, null, 2)}\n`,
	);
}

export async function packRelease(
	root: string,
	output: string,
): Promise<string> {
	const temporary = await mkdtemp(
		path.join(os.tmpdir(), "ywtc-release-staging-"),
	);
	try {
		await prepareReleaseStaging(root, path.join(temporary, "package"));
		await mkdir(output, { recursive: true });
		const result = await exec(
			"npm",
			[
				"pack",
				"--ignore-scripts",
				"--json",
				"--pack-destination",
				path.resolve(output),
			],
			{
				cwd: path.join(temporary, "package"),
				encoding: "utf8",
				maxBuffer: 16 * 1024 * 1024,
			},
		);
		return result.stdout;
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}
