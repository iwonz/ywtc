import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { prepareReleaseStaging } from "../scripts/release-package.js";

async function fixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), "ywtc-pack-fixture-"));
	const stage = `${root}-stage`;
	const put = async (name: string, value: unknown) => {
		await mkdir(path.dirname(path.join(root, name)), { recursive: true });
		await writeFile(
			path.join(root, name),
			typeof value === "string" ? value : JSON.stringify(value),
		);
	};
	const pkg = {
		name: "fixture",
		version: "1.0.0",
		files: ["dist"],
		bundleDependencies: ["renderer"],
		overrides: { css: "npm:parser@4.0.0" },
	};
	const packages: Record<string, any> = {
		"": { version: "1.0.0" },
		"node_modules/renderer": { version: "1.0.0", inBundle: true },
		"node_modules/css": { name: "parser", version: "4.0.0", inBundle: true },
	};
	await put("package.json", pkg);
	await put("package-lock.json", { version: "1.0.0", packages });
	await put("dist/cli.js", "source bytes");
	await put("node_modules/renderer/package.json", {
		name: "renderer",
		version: "1.0.0",
		dependencies: { css: "^3.0.0" },
	});
	await put(
		"node_modules/renderer/index.js",
		'module.exports = require("css");',
	);
	await put("node_modules/renderer/LICENSE", "license bytes");
	await put("node_modules/css/package.json", {
		name: "parser",
		version: "4.0.0",
	});
	await put("node_modules/css/index.js", "module.exports = {fixture:true};");
	await put("ywtc.config.yaml", "private fixture");
	return { root, stage, put, pkg, packages };
}
describe("audited publication staging", () => {
	it("pins valid aliases and preserves code/licenses without mutating source or copying runtime files", async () => {
		const f = await fixture();
		await prepareReleaseStaging(f.root, f.stage);
		const staged = JSON.parse(
			await readFile(path.join(f.stage, "package.json"), "utf8"),
		);
		expect(staged.overrides).toBeUndefined();
		const runtime = path.join(f.stage, "node_modules/renderer/runtime");
		expect(
			JSON.parse(
				await readFile(
					path.join(runtime, "node_modules/renderer/package.json"),
					"utf8",
				),
			).dependencies.css,
		).toBe("npm:parser@4.0.0");
		expect(
			await readFile(
				path.join(f.stage, "node_modules/renderer/LICENSE"),
				"utf8",
			),
		).toBe("license bytes");
		expect(
			await readFile(path.join(runtime, "node_modules/css/index.js"), "utf8"),
		).toBe("module.exports = {fixture:true};");
		expect(
			createRequire(path.join(f.stage, "package.json"))("renderer"),
		).toEqual({ fixture: true });
		expect(
			JSON.parse(await readFile(path.join(f.root, "package.json"), "utf8")),
		).toEqual(f.pkg);
		expect(
			JSON.parse(
				await readFile(
					path.join(f.root, "node_modules/renderer/package.json"),
					"utf8",
				),
			).dependencies.css,
		).toBe("^3.0.0");
		await expect(
			readFile(path.join(f.stage, "ywtc.config.yaml")),
		).rejects.toThrow();
	});
	it("rejects stale installed versions", async () => {
		const f = await fixture();
		await f.put("node_modules/css/package.json", {
			name: "parser",
			version: "3.0.0",
		});
		await expect(prepareReleaseStaging(f.root, f.stage)).rejects.toThrow(
			/version|npm ci/i,
		);
	});
	it("rejects an incomplete required closure", async () => {
		const f = await fixture();
		delete f.packages["node_modules/css"];
		await f.put("package-lock.json", {
			version: "1.0.0",
			packages: f.packages,
		});
		await expect(prepareReleaseStaging(f.root, f.stage)).rejects.toThrow(
			/closure|dependency/i,
		);
	});
	it("rejects traversal in locked bundled paths", async () => {
		const f = await fixture();
		f.packages["node_modules/../../escape"] = {
			version: "1.0.0",
			inBundle: true,
		};
		await f.put("package-lock.json", {
			version: "1.0.0",
			packages: f.packages,
		});
		await expect(prepareReleaseStaging(f.root, f.stage)).rejects.toThrow(
			/path/i,
		);
	});
	it("rejects escaping symlinks", async () => {
		const f = await fixture();
		await f.put("outside/file", "private");
		await symlink(path.join(f.root, "outside"), path.join(f.root, "dist/link"));
		await expect(prepareReleaseStaging(f.root, f.stage)).rejects.toThrow(
			/symlink/i,
		);
	});
	it("preserves optional unavailable peers without inventing a package", async () => {
		const f = await fixture();
		await f.put("node_modules/css/package.json", {
			name: "parser",
			version: "4.0.0",
			peerDependencies: { optional: "*" },
			peerDependenciesMeta: { optional: { optional: true } },
		});
		await prepareReleaseStaging(f.root, f.stage);
		expect(
			JSON.parse(
				await readFile(
					path.join(
						f.stage,
						"node_modules/renderer/runtime/node_modules/css/package.json",
					),
					"utf8",
				),
			).peerDependencies.optional,
		).toBe("*");
	});
	it("materializes audited peer bindings in the private snapshot", async () => {
		const f = await fixture();
		await f.put("node_modules/css/package.json", {
			name: "parser",
			version: "4.0.0",
			peerDependencies: { helper: "^1.0.0" },
		});
		f.packages["node_modules/helper"] = { version: "2.0.0", inBundle: true };
		await f.put("node_modules/helper/package.json", {
			name: "helper",
			version: "2.0.0",
		});
		await f.put("package-lock.json", {
			version: "1.0.0",
			packages: f.packages,
		});
		await prepareReleaseStaging(f.root, f.stage);
		const result = JSON.parse(
			await readFile(
				path.join(
					f.stage,
					"node_modules/renderer/runtime/node_modules/css/package.json",
				),
				"utf8",
			),
		);
		expect(result.dependencies.helper).toBe("2.0.0");
		expect(result.peerDependencies.helper).toBe("2.0.0");
	});
});
