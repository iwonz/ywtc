import { describe, expect, it, vi } from "vitest";
import type {
	DestinationAdapter,
	DestinationPage,
	SourcePage,
} from "../src/domain.js";
import { verifyProviderContent } from "../src/provider-verification.js";
import { ConfluenceAdapter } from "../src/adapters/confluence.js";
import type { ConfluenceApi, ConfluencePage } from "../src/types.js";
import { destinationProfile } from "./sync-fixture.js";

const source: SourcePage = {
	provider: "yandex-wiki",
	profile: "wiki",
	id: "1",
	canonicalId: "wiki:1",
	title: "Guide",
	url: "https://wiki.example.com/guide",
	locator: "guide",
	rawContent: "",
	rawFormat: "yfm",
	references: [],
};
const context: DestinationPage = {
	provider: "confluence",
	profile: "conf",
	id: "2",
	canonicalId: "conf:2",
	title: "Guide",
	url: "https://conf.example.com/pages/2",
	locator: "2",
	space: "DOC",
};
const body = (attributes: string, label = "Documentation") =>
	`<p><ac:link><ri:page ${attributes}/><ac:link-body>${label}</ac:link-body></ac:link></p>`;
const expected = body('ri:content-id="42" ri:content-title="Docs"');
const actual = body('ri:content-title="Docs"');
describe("proved provider-native reference verification", () => {
	it("accepts ID/title normalization only after proving the exact same target", async () => {
		const resolve = vi.fn(
			async (ref: { id?: string; title: string; space?: string }) => ({
				id: ref.space === "OTHER" ? "99" : "42",
				title: ref.title,
				space: ref.space ?? "DOC",
			}),
		);
		const destination = {
			kind: "confluence",
			resolveNativePageReference: resolve,
		} as unknown as DestinationAdapter;
		const result = await verifyProviderContent(
			expected,
			actual,
			destination,
			source,
			context,
		);
		expect(result.status).toBe("complete");
		expect(result.normalizations?.length).toBe(1);
		expect(resolve).toHaveBeenCalledTimes(2);
		expect(
			(
				await verifyProviderContent(
					expected,
					body('ri:content-title="Docs" ri:space-key="OTHER"'),
					destination,
					source,
					context,
				)
			).status,
		).toBe("failed");
	});
	it("does not hide missing links, changed labels or unresolved identities", async () => {
		const destination = {
			kind: "confluence",
			resolveNativePageReference: async () => undefined,
		} as unknown as DestinationAdapter;
		expect(
			(
				await verifyProviderContent(
					expected,
					actual,
					destination,
					source,
					context,
				)
			).status,
		).toBe("failed");
		expect(
			(
				await verifyProviderContent(
					expected,
					"<p>Documentation</p>",
					destination,
					source,
					context,
				)
			).status,
		).toBe("failed");
		const proved = {
			kind: "confluence",
			resolveNativePageReference: async () => ({
				id: "42",
				title: "Docs",
				space: "DOC",
			}),
		} as unknown as DestinationAdapter;
		expect(
			(
				await verifyProviderContent(
					expected,
					body('ri:content-title="Docs"', "Changed"),
					proved,
					source,
					context,
				)
			).status,
		).toBe("failed");
	});
	it("performs no lookup for already equivalent content or other providers", async () => {
		const resolve = vi.fn();
		const destination = {
			kind: "confluence",
			resolveNativePageReference: resolve,
		} as unknown as DestinationAdapter;
		expect(
			(
				await verifyProviderContent(
					actual,
					actual,
					destination,
					source,
					context,
				)
			).status,
		).toBe("complete");
		expect(resolve).not.toHaveBeenCalled();
		expect(
			(
				await verifyProviderContent(
					"Hello",
					"Hello",
					{ kind: "yandex-wiki" } as DestinationAdapter,
					source,
					context,
				)
			).status,
		).toBe("complete");
	});
	it("requires correct per-link spaces even when titles and text match", async () => {
		const destination = { kind: "confluence" } as DestinationAdapter;
		expect(
			(
				await verifyProviderContent(
					body('ri:content-title="Docs" ri:space-key="A"'),
					body('ri:content-title="Docs" ri:space-key="B"'),
					destination,
					source,
					context,
				)
			).status,
		).toBe("failed");
	});
	it.each(["data-center", "cloud"] as const)(
		"proves %s aliases using exact title/space and immutable ID lookup",
		async (deployment) => {
			const space = deployment === "cloud" ? "123" : "DOC",
				target = {
					id: "42",
					title: "Docs",
					space: { key: "DOC", id: "123" },
				} as ConfluencePage;
			const client = {
				findPageByTitle: vi.fn(async (key: string, title: string) =>
					key === space && title === "Docs" ? target : undefined,
				),
				getPage: vi.fn(async (id: string) => ({ ...target, id })),
			} as unknown as ConfluenceApi;
			const adapter = new ConfluenceAdapter(
					{ ...destinationProfile, deployment },
					client,
				),
				current = { ...context, space };
			expect(
				await adapter.resolveNativePageReference(
					{ id: "42", title: "Docs" },
					current,
				),
			).toMatchObject({ id: "42", title: "Docs" });
			expect(
				await adapter.resolveNativePageReference(
					{ id: "99", title: "Docs" },
					current,
				),
			).toBeUndefined();
			expect(
				await adapter.resolveNativePageReference(
					{ id: "42", title: "Docs", space: "OTHER" },
					current,
				),
			).toBeUndefined();
		},
	);
});
