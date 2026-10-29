import { describe, expect, it } from "vitest";
import type {
	CommentInventory,
	SourcePage,
	SourceResource,
} from "../src/domain.js";
import {
	classifySyncPage,
	createSyncEvidence,
	parseSyncDecisions,
	stableHash,
} from "../src/sync-contract.js";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateStore, type TransferIdentity } from "../src/state.js";

const page: SourcePage = {
	provider: "yandex-wiki",
	profile: "wiki",
	id: "10",
	canonicalId: "wiki:yandex-wiki:10",
	title: "Guide",
	locator: "guide",
	url: "https://wiki.example.com/guide/",
	rawContent: "Hello",
	rawFormat: "yfm",
	references: [],
};
const empty: CommentInventory = {
	status: "complete",
	threads: [],
	comments: 0,
	participants: 0,
	attachments: 0,
	knownBytes: 0,
	unknownSizes: 0,
	warnings: [],
};
const file: SourceResource = {
	provider: "yandex-wiki",
	id: "file",
	pageId: "10",
	name: "file.png",
	kind: "image",
	downloadUrl: "https://files.example.com/file.png?version=1",
};
const evidence = (
	p = page,
	resources: SourceResource[] = [],
	comments = empty,
) =>
	createSyncEvidence(p, resources, comments, {
		mentions: { mode: "off" },
		hashtags: { mode: "off" },
	});

describe("synchronization evidence and decisions", () => {
	it("ignores resource transport versions when the actual bytes match", () => {
		const policies = {
			mentions: { mode: "off" as const },
			hashtags: { mode: "off" as const },
		};
		const bytes = {
			file: { path: "/tmp/fixture-cache", size: 3, sha256: "a".repeat(64) },
		};
		const first = createSyncEvidence(page, [file], empty, policies, bytes);
		const next = createSyncEvidence(
			page,
			[
				{
					...file,
					downloadUrl: "https://files.example.com/file.png?version=999",
					size: 999,
				},
			],
			empty,
			policies,
			bytes,
		);
		expect(next.resourceHash).toBe(first.resourceHash);
		expect(next.sourceHash).toBe(first.sourceHash);
	});
	it("ignores versions, timestamps, line endings and object key order", () => {
		expect(
			evidence({
				...page,
				version: "2",
				modifiedAt: "later",
				rawContent: "Hello\r\n",
			}).bodyHash,
		).toBe(evidence({ ...page, rawContent: "Hello\n" }).bodyHash);
		expect(stableHash({ a: 1, nested: { b: 2, c: 3 } })).toBe(
			stableHash({ nested: { c: 3, b: 2 }, a: 1 }),
		);
	});
	it("tracks body, hierarchy, files and comments independently", () => {
		const a = evidence();
		expect(evidence({ ...page, rawContent: "Updated" }).bodyHash).not.toBe(
			a.bodyHash,
		);
		expect(evidence({ ...page, parentId: "parent" }).hierarchyHash).not.toBe(
			a.hierarchyHash,
		);
		expect(evidence(page, [file]).resourceHash).not.toBe(a.resourceHash);
		expect(
			evidence(page, [], { ...empty, fingerprint: "changed", comments: 1 })
				.commentHash,
		).not.toBe(a.commentHash);
		expect(evidence({ ...page, version: "999" })).toEqual(a);
	});
	it("hashes only effective mention and hashtag decisions", () => {
		const policy = {
			mentions: {
				mode: "mapping" as const,
				document: {
					source: {
						provider: "yandex-wiki" as const,
						instance: "https://wiki.example.com",
					},
					entries: [
						{
							identity: { username: "unused" },
							mention: "@unused",
							decision: "url" as const,
							url: "https://people.example.com/u",
						},
					],
				},
			},
			hashtags: { mode: "off" as const },
		};
		expect(createSyncEvidence(page, [], empty, policy).policyHash).toBe(
			evidence().policyHash,
		);
		expect(
			createSyncEvidence(
				{ ...page, rawContent: "Hi @unused" },
				[],
				empty,
				policy,
			).policyHash,
		).not.toBe(
			createSyncEvidence({ ...page, rawContent: "Hi @unused" }, [], empty, {
				mentions: { mode: "off" },
				hashtags: { mode: "off" },
			}).policyHash,
		);
	});
	it("reuses equivalent content, reports unknown baselines, and expires Keep", () => {
		const observed = evidence();
		expect(classifySyncPage({ observed, mapped: false }).classification).toBe(
			"add",
		);
		expect(classifySyncPage({ observed, mapped: true }).classification).toBe(
			"unknown-baseline",
		);
		expect(
			classifySyncPage({ observed, mapped: true, equivalent: true })
				.classification,
		).toBe("unchanged");
		expect(
			classifySyncPage({ observed, mapped: true, prior: observed })
				.classification,
		).toBe("unchanged");
		expect(
			classifySyncPage({
				observed,
				mapped: true,
				keep: { sourceHash: observed.sourceHash, decidedAt: "now" },
			}).classification,
		).toBe("kept");
		expect(
			classifySyncPage({
				observed: evidence({ ...page, rawContent: "new" }),
				mapped: true,
				prior: observed,
				keep: { sourceHash: observed.sourceHash, decidedAt: "now" },
			}).classification,
		).toBe("changed");
		expect(
			classifySyncPage({ observed, mapped: true, excluded: true })
				.classification,
		).toBe("excluded");
	});
	it("keeps strict decisions separate from prepared source data", () => {
		const id = "9d4c8ed8-96a5-4bdf-9494-fd11c9418023";
		expect(
			parseSyncDecisions({ planId: id, decisions: { "wiki:10": "keep" } })
				.decisions["wiki:10"],
		).toBe("keep");
		for (const x of [
			{ planId: "last", decisions: {} },
			{ planId: id, decisions: { x: "overwrite" } },
			{ planId: id, decisions: {}, token: "secret" },
		])
			expect(() => parseSyncDecisions(x)).toThrow(/decisions|Invalid/);
	});
	it("persists optional evidence without changing old state identity", async () => {
		const directory = await mkdtemp(
			path.join(os.tmpdir(), "ywtc-sync-evidence-"),
		);
		const filename = path.join(directory, "state.json");
		const identity: TransferIdentity = {
			source: {
				provider: "yandex-wiki",
				profile: "wiki",
				instance: "https://wiki.example.com",
				objectId: "10",
			},
			destination: {
				provider: "confluence",
				profile: "conf",
				instance: "https://conf.example.com",
				objectId: "20",
			},
		};
		const store = new StateStore(filename);
		await store.load(identity);
		const value = {
			sourceId: page.id,
			sourceCanonicalId: page.canonicalId,
			sourceLocator: page.locator,
			sourceTitle: page.title,
			destinationTitle: "Guide",
			status: "complete" as const,
			resources: {},
			degradations: [],
			updatedAt: "now",
		};
		await store.setPage(value);
		await store.release();
		const again = new StateStore(filename);
		await again.load(identity);
		expect(again.page(page.canonicalId)?.syncEvidence).toBeUndefined();
		await again.setPage({
			...value,
			syncEvidence: evidence(),
			syncKeep: { sourceHash: evidence().sourceHash, decidedAt: "now" },
		});
		await again.release();
		const final = new StateStore(filename);
		await final.load(identity);
		expect(final.page(page.canonicalId)?.syncEvidence).toEqual(evidence());
		expect(final.value.identity).toEqual(identity);
		await final.release();
		await rm(directory, { recursive: true, force: true });
	});
	it("processes megabyte inline payloads without invoking the renderer", () => {
		const content = `![image](data:image/png;base64,${"a".repeat(1_100_000)})`;
		expect(evidence({ ...page, rawContent: content }).sourceHash).toHaveLength(
			64,
		);
	});
});
