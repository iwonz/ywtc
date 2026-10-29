import path from "node:path";
import { markdownLinkSpans } from "./sync-references.js";
import {
	applyTextPatches,
	escapeXml,
	xmlAttributeSpan,
	xmlNodes,
	type TextPatch,
} from "./xml-patches.js";

export function patchExportLinks(
	body: string,
	format: "html" | "markdown",
	currentPath: string,
	sourceUrl: string,
	targets: readonly { sourceUrl: string; path: string }[],
	protectedUrls: ReadonlySet<string>,
): { body: string; count: number } {
	const aliases = new Map<string, string[]>();
	for (const target of targets) {
		const url = new URL(target.sourceUrl);
		url.hash = "";
		url.pathname = url.pathname.replace(/\/+$/, "") || "/";
		const bucket = aliases.get(url.href) ?? [];
		if (!bucket.includes(target.path)) bucket.push(target.path);
		aliases.set(url.href, bucket);
	}
	const spans =
			format === "markdown"
				? markdownLinkSpans(body)
				: xmlNodes(body)
						.filter((n) => n.name === "a" && !n.protected && n.attributes.href)
						.flatMap((node) => {
							const span = xmlAttributeSpan(body, node, "href");
							return span ? [{ ...span, value: node.attributes.href! }] : [];
						}),
		patches: TextPatch[] = [];
	for (const span of spans) {
		if (protectedUrls.has(span.value) || span.value.startsWith("#")) continue;
		let url: URL;
		try {
			url = new URL(span.value, sourceUrl);
		} catch {
			continue;
		}
		const fragment = url.hash;
		url.hash = "";
		url.pathname = url.pathname.replace(/\/+$/, "") || "/";
		const candidates = aliases.get(url.href);
		if (candidates?.length !== 1) continue;
		const destination =
			path.posix.relative(path.posix.dirname(currentPath), candidates[0]!) ||
			path.posix.basename(currentPath);
		const after =
			destination.split("/").map(encodeURIComponent).join("/") + fragment;
		patches.push({
			start: span.start,
			end: span.end,
			before: body.slice(span.start, span.end),
			after: format === "html" ? escapeXml(after) : after,
		});
	}
	return { body: applyTextPatches(body, patches), count: patches.length };
}
