import { describe, it, expect } from "vitest";
import {
	patchSyncLinks,
	patchMarkdownSyncLinks,
	patchNativeTrashLinks,
	createSyncLinkIndex,
} from "../src/sync-references.js";
import type { DestinationAdapter, DestinationPage } from "../src/domain.js";
describe("synchronization structural links", () => {
	const target = {
		id: "page:2",
		sourceUrl: "https://wiki.example.com/team/new/",
		aliases: ["https://wiki.example.com/old/"],
		destinationUrl: "https://conf.example.com/pages/viewpage.action?pageId=42",
	};
	it("patches Markdown destinations with a bounded scanner and excludes code and directives", () => {
		const body =
			'[label](https://wiki.example.com/old/#a)\n`[code](https://wiki.example.com/old/)`\n```mermaid\n[a](https://wiki.example.com/old/)\n```\n{% include src="https://wiki.example.com/old/" %}';
		const result = patchMarkdownSyncLinks(
			body,
			createSyncLinkIndex([target]),
			"https://wiki.example.com",
		);
		expect(result.changes).toHaveLength(1);
		expect(result.body).toContain("pageId=42#a");
		expect(result.body).toContain("`[code](https://wiki.example.com/old/)`");
	});
	it("replaces proved native links before trash while retaining labels and anchors", async () => {
		const context = { id: "1", space: "DOC" } as DestinationPage,
			destination = {
				resolveNativePageReference: async () => ({
					id: "42",
					title: "Docs",
					space: "DOC",
				}),
			} as unknown as DestinationAdapter;
		const result = await patchNativeTrashLinks(
			'<ac:link ac:anchor="section"><ri:page ri:content-title="Docs"/><ac:link-body><strong>Label</strong></ac:link-body></ac:link>',
			context,
			destination,
			new Map([
				["42", { sourceUrl: "https://wiki.example.com/old/", title: "Docs" }],
			]),
		);
		expect(result.count).toBe(1);
		expect(result.body).toBe(
			'<a href="https://wiki.example.com/old/#section"><strong>Label</strong></a>',
		);
	});
	it("handles a ten-thousand-target index and a megabyte literal without repeated alias scans", () => {
		const targets = Array.from({ length: 10000 }, (_, id) => ({
				...target,
				id: String(id),
				sourceUrl: `https://wiki.example.com/${id}`,
				aliases: [],
				destinationUrl: `https://conf.example.com/${id}`,
			})),
			index = createSyncLinkIndex(targets),
			result = patchSyncLinks(
				`<p>${"x".repeat(1100000)}</p><a href="https://wiki.example.com/9999#x">label</a>`,
				index,
				"https://wiki.example.com",
			);
		expect(result.changes).toHaveLength(1);
		expect(result.body).toContain("https://conf.example.com/9999#x");
	});
	it("patches aliases and fragments without changing labels or mentions", () => {
		const body =
			'<p><a href="/old/#section">Label</a><ac:link><ri:user ri:username="a"/></ac:link><a href="https://people.example.com/a">@a</a></p>';
		const result = patchSyncLinks(
			body,
			[target],
			"https://wiki.example.com/team/",
		);
		expect(result.changes).toHaveLength(1);
		expect(result.body).toContain("pageId=42#section");
		expect(result.body).toContain(
			'>Label</a><ac:link><ri:user ri:username="a"/></ac:link>',
		);
	});
	it("preserves decision URLs, ambiguous references, text and code", () => {
		const body =
			'<a href="https://wiki.example.com/old/">@a</a><code>https://wiki.example.com/old/</code>';
		expect(
			patchSyncLinks(
				body,
				[target],
				"https://wiki.example.com",
				new Set(["https://wiki.example.com/old/"]),
			).body,
		).toBe(body);
		const ambiguous = patchSyncLinks(
			body,
			[target, { ...target, id: "page:3" }],
			"https://wiki.example.com",
		);
		expect(ambiguous.changes).toHaveLength(0);
		expect(ambiguous.unresolved).toHaveLength(1);
	});
	it("returns trashed targets to the source and rejects stale or unsafe aliases", () => {
		const result = patchSyncLinks(
			'<a href="https://conf.example.com/42#x">x</a>',
			[{ ...target, aliases: ["https://conf.example.com/42"], excluded: true }],
			"https://conf.example.com",
		);
		expect(result.body).toContain("https://wiki.example.com/team/new/#x");
		expect(
			patchSyncLinks(
				'<a href="javascript:alert(1)">x</a>',
				[target],
				"https://wiki.example.com",
			).changes,
		).toHaveLength(0);
	});
});
