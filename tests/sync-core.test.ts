import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Migrator } from "../src/migrator.js";
import { StateStore } from "../src/state.js";
import { syncFixture, syncConfig, syncOptions } from "./sync-fixture.js";
const logger = { info: () => {}, warn: () => {}, error: () => {} };
describe("reviewed core execution boundaries", () => {
	it("rejects a stale review under the state lease before creating a live run", async () => {
		const directory = await mkdtemp(
				path.join(os.tmpdir(), "ywtc-sync-before-"),
			),
			fixture = syncFixture();
		try {
			await expect(
				new Migrator(syncConfig, logger, fixture.factory).run({
					...syncOptions(directory),
					beforeRun: async () => {
						throw new Error("stale review");
					},
				}),
			).rejects.toThrow(/stale review/);
			expect(fixture.creates).toHaveLength(0);
			expect(fixture.updates).toHaveLength(0);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	it("persists reusable version-independent evidence and runs completion while the state is leased", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "ywtc-sync-hook-")),
			fixture = syncFixture();
		let called = false;
		try {
			const result = await new Migrator(
				syncConfig,
				logger,
				fixture.factory,
			).run({
				...syncOptions(directory),
				afterTransfer: async ({ store, report }) => {
					called = true;
					expect(
						store.page(fixture.root.canonicalId)?.syncEvidence?.sourceHash,
					).toHaveLength(64);
					const second = new StateStore(store.filename);
					await expect(second.load(store.value.identity)).rejects.toThrow(
						/active|lease|locked|busy/i,
					);
					expect(report.data.pages[0]?.status).toBe("complete");
				},
			});
			expect(called).toBe(true);
			const state = JSON.parse(await readFile(result.stateFilename, "utf8"));
			expect(
				state.pages[fixture.root.canonicalId].syncEvidence.snapshot,
			).toBeTruthy();
			const puts = fixture.updates.length;
			fixture.root.version = "999";
			await new Migrator(syncConfig, logger, fixture.factory).run(
				syncOptions(directory),
			);
			expect(fixture.updates).toHaveLength(puts);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
