import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "./jobs/store.js";
import { boundedPath } from "./local-paths.js";
import { stableHash } from "./sync-contract.js";
import { markdownLinkSpans, type SyncLinkIndex } from "./sync-references.js";
import { xmlNodes } from "./xml-patches.js";

interface ReferenceEntry {
	identity: string;
	version?: string;
	hash: string;
	hrefs: string[];
	native?: Array<{ id?: string; title?: string; space?: string }>;
}
export interface SyncReferenceIntent {
	pageId: string;
	location: "page" | "comment";
	targetId: string;
	href: string;
	destinationUrl?: string;
	needsPatch: boolean;
	native?: boolean;
}

/** Rebuildable index. A version AND body hash bind reused entries; no cached body is trusted as current. */
export async function indexSyncReferences(input: {
	workspace: string;
	stateId: string;
	pageId: string;
	location: "page" | "comment";
	version?: string;
	body: string;
	provider: "confluence" | "yandex-wiki";
	base: string;
	space?: string;
	targets: SyncLinkIndex;
	protectedUrls: ReadonlySet<string>;
}): Promise<{ intents: SyncReferenceIntent[]; unresolved: number }> {
	if (!/^[a-f0-9]{24}$/.test(input.stateId))
		throw new Error("Invalid reference-index state identity");
	const identity = `${input.pageId}:${input.location}`,
		hash = stableHash(input.body),
		filename = await boundedPath(
			input.workspace,
			path.join(
				".states",
				"sync",
				"index",
				input.stateId,
				`${stableHash(identity)}.json`,
			),
			true,
		);
	let previous: ReferenceEntry | undefined;
	try {
		previous = JSON.parse(await readFile(filename, "utf8"));
	} catch {}
	let entry: ReferenceEntry;
	if (
		previous?.identity === identity &&
		previous.hash === hash &&
		previous.version === input.version &&
		Array.isArray(previous.hrefs) &&
		previous.hrefs.every((h) => typeof h === "string") &&
		(input.provider !== "confluence" || Array.isArray(previous.native))
	)
		entry = previous;
	else {
		const nodes =
				input.provider === "confluence"
					? xmlNodes(input.body).filter((node) => !node.protected)
					: [],
			hrefs =
				input.provider === "yandex-wiki"
					? markdownLinkSpans(input.body).map((s) => s.value)
					: nodes.flatMap((node) =>
							node.name === "a" && node.attributes.href
								? [node.attributes.href]
								: node.name === "ri:url" && node.attributes["ri:value"]
									? [node.attributes["ri:value"]]
									: [],
						);
		const native = nodes
			.filter((node) => node.name === "ri:page")
			.map((node) => ({
				...(node.attributes["ri:content-id"]
					? { id: node.attributes["ri:content-id"] }
					: {}),
				...(node.attributes["ri:content-title"]
					? { title: node.attributes["ri:content-title"] }
					: {}),
				...(node.attributes["ri:space-key"]
					? { space: node.attributes["ri:space-key"] }
					: {}),
			}));
		entry = {
			identity,
			hash,
			hrefs,
			native,
			...(input.version ? { version: input.version } : {}),
		};
		await atomicJson(filename, entry);
	}
	const intents: SyncReferenceIntent[] = [];
	let unresolved = 0;
	for (const href of entry.hrefs) {
		if (input.protectedUrls.has(href) || href.startsWith("#")) continue;
		let url: URL;
		try {
			url = new URL(href, input.base);
			url.hash = "";
			url.searchParams.sort();
			url.pathname = url.pathname.replace(/\/+$/, "") || "/";
		} catch {
			continue;
		}
		const candidates = input.targets.aliases.get(url.href);
		if (!candidates?.length) continue;
		if (candidates.length !== 1) {
			unresolved++;
			continue;
		}
		const target = candidates[0]!,
			destination = target.excluded ? target.sourceUrl : target.destinationUrl;
		let needsPatch = true;
		if (destination) {
			const current = new URL(destination);
			current.hash = "";
			current.searchParams.sort();
			current.pathname = current.pathname.replace(/\/+$/, "") || "/";
			needsPatch = current.href !== url.href;
		}
		intents.push({
			pageId: input.pageId,
			location: input.location,
			targetId: target.id,
			href,
			needsPatch,
			...(destination ? { destinationUrl: destination } : {}),
		});
	}
	for (const ref of entry.native ?? []) {
		const candidates = input.targets.native.get(
			ref.id
				? `id:${ref.id}`
				: `title:${ref.space ?? input.space}:${ref.title}`,
		);
		if (!candidates?.length) continue;
		if (candidates.length !== 1) {
			unresolved++;
			continue;
		}
		const target = candidates[0]!;
		intents.push({
			pageId: input.pageId,
			location: input.location,
			targetId: target.id,
			href: ref.id ? `Confluence ID ${ref.id}` : (ref.title ?? ""),
			needsPatch: Boolean(target.excluded),
			native: true,
			...(target.destinationUrl
				? {
						destinationUrl: target.excluded
							? target.sourceUrl
							: target.destinationUrl,
					}
				: {}),
		});
	}
	return { intents, unresolved };
}
