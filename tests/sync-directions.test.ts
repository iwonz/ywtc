import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { DestinationPage, SourcePage } from "../src/domain.js";
import type { PreparedOperation } from "../src/operations.js";
import { Migrator } from "../src/migrator.js";
import { analyzeSync, applySync } from "../src/sync-execution.js";
import { SyncPlanStore } from "../src/sync-store.js";
import { resolveWorkspace } from "../src/workspace.js";
import {
	syncConfig,
	syncFixture,
	syncOptions,
	sourcePage,
	destinationProfile,
} from "./sync-fixture.js";

describe("provider-neutral synchronization", () => {
	it.each([
		["yandex-wiki", "confluence", false],
		["yandex-wiki", "yandex-wiki", false],
		["confluence", "confluence", false],
		["confluence", "yandex-wiki", false],
		["confluence", "confluence", true],
	] as const)(
		"%s → %s (space=%s) expands the same identity without duplicate ancestors",
		async (from, to, space) => {
			const root = await mkdtemp(
				path.join(os.tmpdir(), "ywtc-sync-direction-"),
			);
			try {
				const fixture = syncFixture(),
					config = structuredClone(syncConfig);
				if (from === "confluence")
					config.profiles.source = {
						...destinationProfile,
						name: "source",
						baseUrl: "https://wiki.example.com",
					};
				if (to === "yandex-wiki")
					config.profiles.destination = {
						...syncConfig.profiles.source!,
						type: "yandex-wiki",
						name: "destination",
						apiUrl: "https://api.destination.example.com",
						webUrl: "https://destination.example.com",
					} as typeof fixture.source.profile;
				Object.assign(fixture.source, {
					profile: config.profiles.source,
					kind: from,
				});
				Object.assign(fixture.destination, {
					profile: config.profiles.destination,
					kind: to,
				});
				const adjust = (page: SourcePage) => ({
					...page,
					provider: from,
					canonicalId: `source:${from}:${page.id}`,
					rawFormat:
						from === "confluence"
							? ("confluence-storage" as const)
							: ("yfm" as const),
					rawContent:
						from === "confluence" ? `<p>${page.title}</p>` : page.rawContent,
					...(space ? { space: "~user" } : {}),
				});
				Object.assign(fixture.root, adjust(fixture.root));
				const destinationBase =
					to === "confluence"
						? "https://conf.example.com"
						: "https://destination.example.com";
				Object.assign(fixture.container, {
					provider: to,
					canonicalId: `destination:${to}:100`,
					url: `${destinationBase}/pages/100`,
				});
				const create = fixture.destination.createPage.bind(fixture.destination);
				fixture.destination.createPage = async (input) => {
					const page = await create(input),
						current: DestinationPage = {
							...page,
							provider: to,
							canonicalId: `destination:${to}:${page.id}`,
							url: `${destinationBase}/pages/${page.id}`,
						};
					fixture.pages.set(current.id, current);
					return structuredClone(current);
				};
				if (space) {
					fixture.sources.clear();
					Object.assign(fixture.root, {
						id: "space:7",
						canonicalId: "source:confluence:space:7",
						rawContent: "",
						title: "Personal notes",
						url: "https://wiki.example.com/spaces/viewspace.action?key=~user",
						locator:
							"https://wiki.example.com/spaces/viewspace.action?key=~user",
						sourceSpace: { id: "7", key: "~user", name: "Personal notes" },
					});
					fixture.source.resolveRoot = async () => ({
						kind: "space",
						item: structuredClone(fixture.root) as SourcePage & {
							sourceSpace: { id: string; key: string; name: string };
						},
					});
					fixture.source.getSpacePages = async () =>
						[...fixture.sources.values()].map((page) => structuredClone(page));
					fixture.sources.set("1", adjust(sourcePage("1", "First", "First")));
				}
				const options = {
					...syncOptions(root),
					source: {
						type: "remote" as const,
						profile: config.profiles.source!,
						value: space ? fixture.root.url : "1",
					},
					destination: {
						type: "remote" as const,
						profile: config.profiles.destination!,
						value: "100",
					},
				};
				const baseline = await new Migrator(
						config,
						{ info: () => {}, warn: () => {}, error: () => {} },
						fixture.factory,
					).run(options),
					workspace = await resolveWorkspace({ explicit: root }),
					prepared: PreparedOperation = {
						request: { kind: "sync-plan", runId: baseline.reportPaths.runId },
						bindings: {},
						timeoutMs: 30000,
						concurrency: 2,
						limits: {},
						mentions: { mode: "off" },
						hashtags: { mode: "off" },
					};
				const before = fixture.creates.map((page) => page.id);
				fixture.sources.set(
					"2",
					adjust(sourcePage("2", "Added", "Added", space ? undefined : "1")),
				);
				const analysis = await analyzeSync(
						prepared,
						config,
						workspace,
						{},
						fixture.factory,
					),
					store = new SyncPlanStore(root),
					plan = await store.get(analysis.planId!);
				expect(
					plan.items.filter((item) => item.classification === "add"),
				).toHaveLength(1);
				expect(plan.inventory.failures).toEqual([]);
				const applied = await applySync(
					{
						...prepared,
						request: {
							kind: "sync-apply",
							planId: plan.id,
							revision: plan.revision,
							confirmTrash: false,
						},
					},
					config,
					workspace,
					{},
					fixture.factory,
				);
				expect(applied.exitCode).toBe(0);
				expect(fixture.creates).toHaveLength(before.length + 1);
				expect(
					fixture.creates.slice(0, before.length).map((page) => page.id),
				).toEqual(before);
				expect(fixture.updates).toHaveLength(0);
				expect(applied.transfer?.summary.pages).toBe(2);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		},
	);
});
