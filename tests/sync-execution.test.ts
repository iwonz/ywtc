import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Migrator } from "../src/migrator.js";
import { normalizeCommentForest } from "../src/comments.js";
import { analyzeSync, applySync } from "../src/sync-execution.js";
import { SyncPlanStore } from "../src/sync-store.js";
import { buildRetryPlan } from "../src/retry-plan.js";
import type { PreparedOperation } from "../src/operations.js";
import type { Workspace } from "../src/workspace.js";
import {
	syncConfig,
	syncFixture,
	syncOptions,
	sourcePage,
} from "./sync-fixture.js";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories.map((p) => rm(p, { recursive: true, force: true })),
	);
	directories.length = 0;
});
async function setup(
	settings: {
		comments?: boolean;
		format?: "html" | "markdown";
		initialize?: (fixture: ReturnType<typeof syncFixture>) => void;
	} = {},
) {
	const directory = await mkdtemp(path.join(os.tmpdir(), "ywtc-sync-"));
	directories.push(directory);
	const fixture = syncFixture(),
		options = {
			...syncOptions(directory),
			comments: settings.comments ?? false,
			...(settings.format
				? {
						destination: {
							type: "directory" as const,
							path: path.join(directory, "export"),
							format: settings.format,
						},
					}
				: {}),
		};
	settings.initialize?.(fixture);
	const result = await new Migrator(
		syncConfig,
		{ info: () => {}, warn: () => {}, error: () => {} },
		fixture.factory,
	).run(options);
	const workspace: Workspace = {
		root: directory,
		configFile: path.join(directory, "ywtc.config.yaml"),
		statesDirectory: options.runtimeDirectory,
		cacheDirectory: options.cacheDirectory,
		reportsDirectory: options.reportsDirectory,
		source: "explicit",
	};
	const prepared: PreparedOperation = {
		request: { kind: "sync-plan", runId: result.reportPaths.runId },
		bindings: {},
		timeoutMs: 30000,
		concurrency: 2,
		limits: {},
		mentions: { mode: "off" },
		hashtags: { mode: "off" },
	};
	return {
		directory,
		fixture,
		workspace,
		prepared,
		options,
		result,
		store: new SyncPlanStore(directory),
	};
}
describe("reviewed synchronization", () => {
	it("retains failed discovery diagnostics and rejects apply before provider requests", async () => {
		const s = await setup();
		s.fixture.source.getDescendants = async () => {
			throw new Error("fixture hierarchy unavailable");
		};
		const analyzed = await analyzeSync(
			s.prepared,
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		const plan = await s.store.get(analyzed.planId!);
		expect(analyzed.exitCode).toBe(1);
		expect(plan.status).toBe("partial");
		expect(plan.inventory.complete).toBe(false);
		expect(plan.inventory.failures[0]?.message).toContain(
			"fixture hierarchy unavailable",
		);
		const before = {
			creates: s.fixture.creates.length,
			updates: s.fixture.updates.length,
			reads: s.fixture.reads.length,
		};
		s.fixture.source.resolvePage = async () => {
			throw new Error("Unexpected provider request");
		};
		await expect(
			applySync(
				{
					...s.prepared,
					request: {
						kind: "sync-apply",
						planId: plan.id,
						revision: plan.revision,
						confirmTrash: false,
					},
				},
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
		).rejects.toThrow(/inventory/i);
		expect({
			creates: s.fixture.creates.length,
			updates: s.fixture.updates.length,
			reads: s.fixture.reads.length,
		}).toEqual(before);
	});
	it("rejects changed source bytes after preview without destination writes", async () => {
		const s = await setup();
		s.fixture.resourceLists.set("1", [
			{
				provider: "yandex-wiki",
				id: "a",
				pageId: "1",
				name: "document.txt",
				kind: "attachment",
				size: 6,
			},
		]);
		s.fixture.bytes.set("a", Buffer.from("before"));
		const analyzed = await analyzeSync(
			s.prepared,
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		const plan = await s.store.get(analyzed.planId!);
		const decided = await s.store.setDecisions(
			plan.id,
			{ planId: plan.id, decisions: { [plan.items[0]!.id]: "update" } },
			plan.revision,
		);
		const before = {
			creates: s.fixture.creates.length,
			updates: s.fixture.updates.length,
			uploads: s.fixture.uploads.length,
		};
		s.fixture.bytes.set("a", Buffer.from("after!"));
		await expect(
			applySync(
				{
					...s.prepared,
					request: {
						kind: "sync-apply",
						planId: plan.id,
						revision: decided.revision,
						confirmTrash: false,
					},
				},
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
		).rejects.toThrow(/source.*changed|source.*stale|source.*preview/i);
		expect({
			creates: s.fixture.creates.length,
			updates: s.fixture.updates.length,
			uploads: s.fixture.uploads.length,
		}).toEqual(before);
	});
	it("detects changed bytes with identical resource ID, name and size and replaces the verified mapping", async () => {
		const s = await setup({
			initialize: (fixture) => {
				fixture.resourceLists.set("1", [
					{
						provider: "yandex-wiki",
						id: "a",
						pageId: "1",
						name: "document.txt",
						kind: "attachment",
						size: 6,
					},
				]);
				fixture.bytes.set("a", Buffer.from("before"));
			},
		});
		s.fixture.bytes.set("a", Buffer.from("after!"));
		const analyzed = await analyzeSync(
				s.prepared,
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analyzed.planId!);
		expect(plan.items[0]?.classification).toBe("changed");
		expect(plan.items[0]?.reasons).toContain("resource");
		const decided = await s.store.setDecisions(
				plan.id,
				{ planId: plan.id, decisions: { [plan.items[0]!.id]: "update" } },
				plan.revision,
			),
			fileId = s.fixture.uploads[0];
		const result = await applySync(
			{
				...s.prepared,
				request: {
					kind: "sync-apply",
					planId: plan.id,
					revision: decided.revision,
					confirmTrash: false,
				},
			},
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(result.exitCode).toBe(0);
		expect(s.fixture.bytes.get(fileId!)?.toString()).toBe("after!");
		expect(s.fixture.uploads).toEqual([fileId, fileId]);
	});
	it("transfers independently changed attachments without rewriting an identical body", async () => {
		const s = await setup();
		s.fixture.resourceLists.set("1", [
			{
				provider: "yandex-wiki",
				id: "a",
				pageId: "1",
				name: "document.txt",
				kind: "attachment",
			},
		]);
		s.fixture.bytes.set("a", Buffer.from("payload"));
		const analyzed = await analyzeSync(
				s.prepared,
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analyzed.planId!);
		expect(plan.items[0]?.reasons).toContain("resource");
		const decided = await s.store.setDecisions(
				plan.id,
				{ planId: plan.id, decisions: { [plan.items[0]!.id]: "update" } },
				plan.revision,
			),
			before = s.fixture.updates.length;
		const result = await applySync(
			{
				...s.prepared,
				request: {
					kind: "sync-apply",
					planId: plan.id,
					revision: decided.revision,
					confirmTrash: false,
				},
			},
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(result.exitCode).toBe(0);
		expect(s.fixture.updates).toHaveLength(before);
		expect(s.fixture.uploads).toHaveLength(1);
	});
	it("resumes an interrupted owned plan without creating duplicate pages", async () => {
		const s = await setup();
		s.fixture.sources.set("2", sourcePage("2", "Second", "# Second", "1"));
		s.fixture.sources.set("3", sourcePage("3", "Third", "# Third", "1"));
		const analyzed = await analyzeSync(
				s.prepared,
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analyzed.planId!),
			request = {
				kind: "sync-apply" as const,
				planId: plan.id,
				revision: plan.revision,
				confirmTrash: false,
			},
			controller = new AbortController();
		await expect(
			applySync(
				{ ...s.prepared, request },
				syncConfig,
				s.workspace,
				{
					signal: controller.signal,
					onEvent: (event) => {
						if (
							event.type === "outcome" &&
							event.objectType === "page" &&
							event.objectId.endsWith(":2") &&
							event.status === "complete"
						)
							controller.abort(new Error("fixture interruption"));
					},
				},
				s.fixture.factory,
			),
		).rejects.toThrow();
		const ids = s.fixture.creates.map((p) => p.id);
		const resumed = await applySync(
			{ ...s.prepared, request },
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(resumed.exitCode).toBe(0);
		expect(s.fixture.creates.map((p) => p.id)).toEqual(ids);
		expect(
			JSON.parse(await readFile(resumed.reportJson!, "utf8")).summary.complete,
		).toBe(3);
	});
	it("reconciles a lost leaf-trash response and keeps exclusions across ordinary migrate and retry", async () => {
		const s = await setup(),
			trashed = new Set<string>(),
			verify = s.fixture.destination.verifyPage;
		s.fixture.destination.trashEvidence = async (page) => ({
			id: page.id,
			status: "current",
			version: page.version!,
			leaf: true,
			allowed: true,
		});
		s.fixture.destination.trashPage = async (page) => {
			trashed.add(page.id);
			throw new Error("Fixture lost response after reversible trash");
		};
		s.fixture.destination.verifyTrashedPage = async (page) =>
			trashed.has(page.id);
		s.fixture.destination.verifyPage = async (page) => {
			if (trashed.has(page.id)) throw new Error("Trashed page is unavailable");
			return verify(page);
		};
		s.fixture.root.rawContent = "# Changed";
		const analyzed = await analyzeSync(
				s.prepared,
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analyzed.planId!);
		expect(plan.items[0]?.trash.allowed).toBe(true);
		const decided = await s.store.setDecisions(
				plan.id,
				{ planId: plan.id, decisions: { [plan.items[0]!.id]: "trash" } },
				plan.revision,
			),
			base = {
				...s.prepared,
				request: {
					kind: "sync-apply" as const,
					planId: plan.id,
					revision: decided.revision,
					confirmTrash: false,
				},
			};
		await expect(
			applySync(base, syncConfig, s.workspace, {}, s.fixture.factory),
		).rejects.toThrow("confirm-trash");
		const result = await applySync(
			{ ...base, request: { ...base.request, confirmTrash: true } },
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(result.exitCode).toBe(0);
		const report = JSON.parse(await readFile(result.reportJson!, "utf8"));
		expect(report.excludedPages[0].reason).toBe("operator-trash");
		expect(buildRetryPlan(report).remainingRetryable).toBe(0);
		const normal = await new Migrator(
			syncConfig,
			{ info: () => {}, warn: () => {}, error: () => {} },
			s.fixture.factory,
		).run(s.options);
		expect(normal.summary.excludedPages).toBe(1);
		expect(s.fixture.creates).toHaveLength(1);
		s.fixture.sources.set("2", sourcePage("2", "Child", "Child", "1"));
		const blocked = await new Migrator(
			syncConfig,
			{ info: () => {}, warn: () => {}, error: () => {} },
			s.fixture.factory,
		).run(s.options);
		expect(blocked.summary.blocked).toBe(1);
		expect(blocked.summary.errors).toBe(1);
		expect(s.fixture.creates).toHaveLength(1);
	});
	it.each(["markdown", "html"] as const)(
		"expands managed %s output with stable paths and no unnecessary body replacement",
		async (format) => {
			const s = await setup({ format });
			s.fixture.sources.set("2", sourcePage("2", "New", "# New", "1"));
			const manifestBefore = JSON.parse(
				await readFile(
					path.join(s.directory, "export/.ywtc-export.json"),
					"utf8",
				),
			);
			const analyzed = await analyzeSync(
					s.prepared,
					syncConfig,
					s.workspace,
					{},
					s.fixture.factory,
				),
				plan = await s.store.get(analyzed.planId!);
			expect(plan.inventory.failures).toEqual([]);
			expect(plan.items[0]?.classification).toBe("unchanged");
			const result = await applySync(
				{
					...s.prepared,
					request: {
						kind: "sync-apply",
						planId: plan.id,
						revision: plan.revision,
						confirmTrash: false,
					},
				},
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			);
			expect(result.exitCode).toBe(0);
			const after = JSON.parse(
				await readFile(
					path.join(s.directory, "export/.ywtc-export.json"),
					"utf8",
				),
			);
			expect(after.pages).toHaveLength(2);
			expect(
				after.pages.find(
					(p: any) => p.sourceCanonicalId === s.fixture.root.canonicalId,
				).path,
			).toBe(manifestBefore.pages[0].path);
			expect(
				await readFile(
					path.join(
						s.directory,
						"export",
						after.pages.find((p: any) => p.sourceCanonicalId.endsWith(":2"))
							.path,
					),
					"utf8",
				),
			).toContain("New");
			const report = JSON.parse(await readFile(result.reportJson!, "utf8"));
			const repeated = await analyzeSync(
				{ ...s.prepared, request: { kind: "sync-plan", runId: report.runId } },
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			);
			expect(
				(await s.store.get(repeated.planId!)).items.map(
					(item) => item.classification,
				),
			).toEqual(["unchanged", "unchanged"]);
		},
	);
	it("compares and transfers comments independently of an unchanged page body", async () => {
		const s = await setup({ comments: true });
		s.fixture.comments.set(
			"1",
			normalizeCommentForest(
				[{ id: "c1", author: { providerId: "user" }, body: "New discussion" }],
				"yfm",
			),
		);
		const analyzed = await analyzeSync(
				s.prepared,
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analyzed.planId!);
		expect(plan.items[0]?.reasons).toContain("comment");
		const decided = await s.store.setDecisions(
				plan.id,
				{ planId: plan.id, decisions: { [plan.items[0]!.id]: "update" } },
				plan.revision,
			),
			before = s.fixture.updates.length;
		const result = await applySync(
			{
				...s.prepared,
				request: {
					kind: "sync-apply",
					planId: plan.id,
					revision: decided.revision,
					confirmTrash: false,
				},
			},
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(result.exitCode).toBe(0);
		expect(s.fixture.updates).toHaveLength(before);
		expect(s.fixture.archives.size).toBe(1);
	});
	it("patches an incoming source fallback without changing manual mentions or labels", async () => {
		const s = await setup();
		const id = s.fixture.creates[0]!.id;
		s.fixture.pages.get(id)!.content =
			'<h1>Root</h1><p><a href="https://wiki.example.com/2/#anchor">Chosen label</a><a href="https://people.example.com/ivan">@ivan</a></p>';
		s.fixture.sources.set("2", sourcePage("2", "New", "# New", "1"));
		const analyzed = await analyzeSync(
				{
					...s.prepared,
					request: {
						kind: "sync-plan",
						runId: s.result.reportPaths.runId,
						source: "2",
					},
				},
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analyzed.planId!);
		expect(plan.items).toHaveLength(1);
		const result = await applySync(
			{
				...s.prepared,
				request: {
					kind: "sync-apply",
					planId: plan.id,
					revision: plan.revision,
					confirmTrash: false,
				},
			},
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(result.exitCode).toBe(0);
		const body = s.fixture.pages.get(id)!.content;
		expect(body).toContain("pageId=201#anchor");
		expect(body).toContain(">Chosen label</a>");
		expect(body).toContain(
			'<a href="https://people.example.com/ivan">@ivan</a>',
		);
	});
	it("expands access under the existing mapping and does not PUT unchanged pages", async () => {
		const s = await setup();
		s.fixture.sources.set("2", sourcePage("2", "New", "# New", "1"));
		const before = s.fixture.updates.length,
			created = s.fixture.creates.length;
		const analysis = await analyzeSync(
			s.prepared,
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(analysis.exitCode).toBe(0);
		const plan = await s.store.get(analysis.planId!);
		expect(plan.items.map((i) => [i.sourceId, i.classification])).toEqual([
			["1", "unchanged"],
			["2", "add"],
		]);
		expect(s.fixture.creates).toHaveLength(created);
		const result = await applySync(
			{
				...s.prepared,
				request: {
					kind: "sync-apply",
					planId: plan.id,
					revision: plan.revision,
					confirmTrash: false,
				},
			},
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(result.exitCode).toBe(0);
		expect(s.fixture.creates).toHaveLength(created + 1);
		expect(s.fixture.updates).toHaveLength(before);
		const report = JSON.parse(await readFile(result.reportJson!, "utf8"));
		expect(report.pages).toHaveLength(2);
		expect(report.operation).toBe("sync");
		expect(s.fixture.creates.at(-1)?.parentId).toBe(s.fixture.creates[0]?.id);
	});
	it("requires decisions, preserves Keep, then expires it on another source change", async () => {
		const s = await setup();
		s.fixture.sources.get("1")!.rawContent = "# Revised";
		const analysis = await analyzeSync(
				s.prepared,
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analysis.planId!);
		expect(plan.items[0]?.classification).toBe("changed");
		await expect(
			applySync(
				{
					...s.prepared,
					request: {
						kind: "sync-apply",
						planId: plan.id,
						revision: plan.revision,
						confirmTrash: false,
					},
				},
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
		).rejects.toThrow("require decisions");
		const updated = await s.store.setDecisions(
			plan.id,
			{ planId: plan.id, decisions: { [plan.items[0]!.id]: "keep" } },
			plan.revision,
		);
		const before = s.fixture.updates.length;
		const applied = await applySync(
			{
				...s.prepared,
				request: {
					kind: "sync-apply",
					planId: plan.id,
					revision: updated.revision,
					confirmTrash: false,
				},
			},
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect(applied.exitCode).toBe(0);
		expect(s.fixture.updates).toHaveLength(before);
		const next = await analyzeSync(
			s.prepared,
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect((await s.store.get(next.planId!)).items[0]?.classification).toBe(
			"kept",
		);
		s.fixture.sources.get("1")!.rawContent = "# Revised twice";
		const last = await analyzeSync(
			s.prepared,
			syncConfig,
			s.workspace,
			{},
			s.fixture.factory,
		);
		expect((await s.store.get(last.planId!)).items[0]?.classification).toBe(
			"changed",
		);
	});
	it("rejects source or destination drift before any write", async () => {
		const s = await setup();
		s.fixture.sources.set("2", sourcePage("2", "New", "# New", "1"));
		const analysis = await analyzeSync(
				s.prepared,
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
			plan = await s.store.get(analysis.planId!);
		s.fixture.pages.get(s.fixture.creates[0]!.id)!.content =
			"<p>Manual edit after preview</p>";
		const before = s.fixture.creates.length;
		await expect(
			applySync(
				{
					...s.prepared,
					request: {
						kind: "sync-apply",
						planId: plan.id,
						revision: plan.revision,
						confirmTrash: false,
					},
				},
				syncConfig,
				s.workspace,
				{},
				s.fixture.factory,
			),
		).rejects.toThrow("changed after preview");
		expect(s.fixture.creates).toHaveLength(before);
	});
});
