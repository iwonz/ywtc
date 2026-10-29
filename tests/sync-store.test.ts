import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SyncPlanStore } from "../src/sync-store.js";
import { createSyncEvidence, type SyncPlanItem } from "../src/sync-contract.js";
import type { SourcePage } from "../src/domain.js";
const source: SourcePage = {
	id: "1",
	canonicalId: "wiki:1",
	profile: "wiki",
	provider: "yandex-wiki",
	title: "Guide",
	url: "https://wiki.example.com/guide",
	locator: "guide",
	rawContent: "Guide",
	rawFormat: "yfm",
	references: [],
};
const item: SyncPlanItem = {
	id: "wiki:1",
	sourceId: "1",
	title: "Guide",
	sourceUrl: source.url,
	classification: "changed",
	reasons: ["body"],
	resources: 0,
	comments: 0,
	trash: { allowed: false, reason: "children" },
	evidence: createSyncEvidence(source, [], undefined, {
		mentions: { mode: "off" },
		hashtags: { mode: "off" },
	}),
};
describe("private synchronization plans", () => {
	it("enforces revision edits, explicit decisions, and immutable applied plans", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "ywtc-sync-store-")),
			store = new SyncPlanStore(root);
		try {
			const plan = await store.create(
				{
					baselineRunId: "old",
					stateId: "state",
					sourceRootId: "root",
					sourceUrl: source.url,
					status: "review",
					items: [item],
					inventory: { complete: true, selected: 1, failures: [] },
					references: { pages: 0, comments: 0, patches: 0, unresolved: 0 },
				},
				{ private: "not sent to UI" },
			);
			expect(() =>
				store.validateDecisions(plan, { planId: plan.id, decisions: {} }),
			).toThrow(/require decisions/);
			const updated = await store.setDecisions(
				plan.id,
				{ planId: plan.id, decisions: { "wiki:1": "keep" } },
				plan.revision,
			);
			await expect(
				store.setDecisions(
					plan.id,
					{ planId: plan.id, decisions: { "wiki:1": "update" } },
					plan.revision,
				),
			).rejects.toThrow(/changed|refresh/);
			await expect(
				store.setDecisions(
					plan.id,
					{ planId: plan.id, decisions: { "wiki:1": "trash" } },
					updated.revision,
				),
			).rejects.toThrow(/Trash is unavailable/);
			await store.savePlan({ ...updated, status: "applied" });
			await expect(
				store.setDecisions(
					plan.id,
					{ planId: plan.id, decisions: {} },
					updated.revision,
				),
			).rejects.toThrow(/immutable/);
			expect((await store.list()).length).toBe(1);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("rejects traversal, symlinks and malformed manual decisions", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "ywtc-sync-paths-")),
			outside = await mkdtemp(path.join(os.tmpdir(), "ywtc-sync-outside-")),
			store = new SyncPlanStore(root),
			id = "899b0c37-3bee-49f6-adc2-4fa14c252f20";
		try {
			await expect(store.get("../escape")).rejects.toThrow(/canonical/);
			await mkdir(path.join(root, ".states"), { recursive: true });
			await symlink(outside, path.join(root, ".states", "sync"));
			await expect(store.directory(id, true)).rejects.toThrow(/symlink/);
			await rm(path.join(root, ".states", "sync"));
			await mkdir(path.join(root, ".states", "sync", id), { recursive: true });
			await writeFile(
				path.join(root, ".states", "sync", id, "decisions.json"),
				"{}",
			);
			await expect(store.decisions(id)).rejects.toThrow(/Invalid/);
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(outside, { recursive: true, force: true });
		}
	});
});
