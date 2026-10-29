import {
	applyTextPatches,
	escapeXml,
	xmlAttributeSpan,
	xmlNodes,
	type TextPatch,
} from "./xml-patches.js";
import type { DestinationAdapter, DestinationPage } from "./domain.js";

export async function patchNativeTrashLinks(
	body: string,
	context: DestinationPage,
	destination: DestinationAdapter,
	targets: ReadonlyMap<string, { sourceUrl: string; title: string }>,
): Promise<{ body: string; count: number; unresolved: number }> {
	if (!targets.size) return { body, count: 0, unresolved: 0 };
	const nodes = xmlNodes(body),
		patches: TextPatch[] = [];
	let unresolved = 0;
	for (const reference of nodes.filter(
		(n) => n.name === "ri:page" && !n.protected,
	)) {
		const title = reference.attributes["ri:content-title"] ?? "",
			id = reference.attributes["ri:content-id"];
		if (
			!targets.has(id ?? "") &&
			![...targets.values()].some((t) => t.title === title)
		)
			continue;
		if (!destination.resolveNativePageReference) {
			unresolved++;
			continue;
		}
		const resolved = await destination.resolveNativePageReference(
				{
					title,
					...(id ? { id } : {}),
					...(reference.attributes["ri:space-key"]
						? { space: reference.attributes["ri:space-key"] }
						: {}),
				},
				context,
			),
			target = resolved ? targets.get(resolved.id) : undefined;
		if (!target) {
			unresolved++;
			continue;
		}
		const link = nodes
			.filter(
				(n) =>
					n.name === "ac:link" &&
					n.start < reference.start &&
					n.end > reference.end,
			)
			.sort((a, b) => a.end - a.start - (b.end - b.start))[0];
		if (!link) {
			unresolved++;
			continue;
		}
		const label = nodes.find(
				(n) =>
					["ac:link-body", "ac:plain-text-link-body"].includes(n.name) &&
					n.start > link.start &&
					n.end < link.end,
			),
			url = new URL(target.sourceUrl);
		if (link.attributes["ac:anchor"]) url.hash = link.attributes["ac:anchor"];
		let text = escapeXml(title);
		if (label) {
			const raw = body.slice(label.start, label.end);
			if (raw.includes("ri:user")) {
				unresolved++;
				continue;
			}
			const begin = raw.indexOf(">") + 1,
				end = raw.lastIndexOf("</");
			text = raw.slice(begin, end);
			if (text.startsWith("<![CDATA[") && text.endsWith("]]>"))
				text = escapeXml(text.slice(9, -3));
		}
		patches.push({
			start: link.start,
			end: link.end,
			before: body.slice(link.start, link.end),
			after: `<a href="${escapeXml(url.href)}">${text}</a>`,
		});
	}
	return {
		body: applyTextPatches(body, patches),
		count: patches.length,
		unresolved,
	};
}

export interface SyncLinkTarget {
	id: string;
	sourceUrl: string;
	aliases: string[];
	destinationUrl?: string;
	destinationId?: string;
	destinationTitle?: string;
	destinationSpace?: string;
	excluded?: boolean;
}
export interface SyncLinkIndex {
	aliases: ReadonlyMap<string, SyncLinkTarget[]>;
	native: ReadonlyMap<string, SyncLinkTarget[]>;
}
export function createSyncLinkIndex(
	targets: readonly SyncLinkTarget[],
): SyncLinkIndex {
	const aliases = new Map<string, SyncLinkTarget[]>(),
		native = new Map<string, SyncLinkTarget[]>();
	for (const target of targets) {
		for (const alias of [target.sourceUrl, ...target.aliases]) {
			const normalized = key(alias, target.sourceUrl);
			if (!normalized) continue;
			const bucket = aliases.get(normalized.key) ?? [];
			if (!bucket.some((t) => t.id === target.id)) bucket.push(target);
			aliases.set(normalized.key, bucket);
		}
		for (const key of [
			target.destinationId ? `id:${target.destinationId}` : undefined,
			target.destinationTitle && target.destinationSpace
				? `title:${target.destinationSpace}:${target.destinationTitle}`
				: undefined,
		])
			if (key) {
				const bucket = native.get(key) ?? [];
				bucket.push(target);
				native.set(key, bucket);
			}
	}
	return { aliases, native };
}
export interface SyncLinkChange {
	targetId: string;
	before: string;
	after: string;
	start: number;
	end: number;
}

function key(
	value: string,
	base?: string,
): { key: string; fragment: string } | undefined {
	try {
		const url = new URL(value, base);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password
		)
			return;
		const fragment = url.hash;
		url.hash = "";
		url.searchParams.sort();
		url.pathname = url.pathname.replace(/\/+$/, "") || "/";
		return { key: url.href, fragment };
	} catch {
		return;
	}
}
/** Only URL attributes are patched. All labels, native user markers and surrounding bytes stay intact. */
export function patchSyncLinks(
	body: string,
	targets: readonly SyncLinkTarget[] | SyncLinkIndex,
	base: string,
	protectedUrls: ReadonlySet<string> = new Set(),
): { body: string; changes: SyncLinkChange[]; unresolved: string[] } {
	const aliases = Array.isArray(targets)
		? createSyncLinkIndex(targets).aliases
		: (targets as SyncLinkIndex).aliases;
	const changes: SyncLinkChange[] = [],
		unresolved: string[] = [],
		patches: TextPatch[] = [];
	for (const node of xmlNodes(body)) {
		const attribute =
			node.name === "a"
				? "href"
				: node.name === "ri:url"
					? "ri:value"
					: undefined;
		if (!attribute || node.protected) continue;
		const value = node.attributes[attribute];
		if (!value || protectedUrls.has(value) || value.startsWith("#")) continue;
		const normalized = key(value, base),
			candidates = normalized ? aliases.get(normalized.key) : undefined;
		if (!candidates?.length) continue;
		if (candidates.length !== 1) {
			unresolved.push(value);
			continue;
		}
		const target = candidates[0]!,
			url = target.excluded ? target.sourceUrl : target.destinationUrl;
		if (!url) {
			unresolved.push(value);
			continue;
		}
		const next = key(url, base);
		if (!next || next.key === normalized!.key) continue;
		const replacement = new URL(url);
		replacement.hash = normalized!.fragment;
		const span = xmlAttributeSpan(body, node, attribute);
		if (!span) {
			unresolved.push(value);
			continue;
		}
		const after = escapeXml(replacement.href);
		patches.push({
			start: span.start,
			end: span.end,
			before: body.slice(span.start, span.end),
			after,
		});
		changes.push({
			targetId: target.id,
			before: value,
			after: replacement.href,
			start: span.start,
			end: span.end,
		});
	}
	return {
		body: applyTextPatches(body, patches),
		changes,
		unresolved: [...new Set(unresolved)],
	};
}

/** Bounded Markdown destination scanner; never rewrites labels, code, escapes or directive parameters. */
export function markdownLinkSpans(
	body: string,
): Array<{ start: number; end: number; value: string }> {
	const spans: Array<{ start: number; end: number; value: string }> = [];
	const labels: boolean[] = [],
		lower = body.toLowerCase();
	let i = 0,
		lineStart = true,
		fence = "",
		inline = 0;
	while (i < body.length) {
		const c = body[i]!;
		if (c === "\n") {
			lineStart = true;
			labels.length = 0;
			i++;
			continue;
		}
		if (lineStart) {
			let j = i;
			while (body[j] === " " && j - i < 4) j++;
			if (j - i >= 4 && !fence) {
				const end = body.indexOf("\n", j);
				i = end < 0 ? body.length : end;
				continue;
			}
			if (body[j] === "`" || body[j] === "~") {
				const marker = body[j]!,
					start = j;
				while (body[j] === marker) j++;
				const run = body.slice(start, j);
				if (run.length >= 3) {
					if (!fence) fence = run;
					else if (run[0] === fence[0] && run.length >= fence.length)
						fence = "";
					i = body.indexOf("\n", j);
					if (i < 0) break;
					continue;
				}
			}
			lineStart = false;
		}
		if (fence) {
			i++;
			continue;
		}
		if (c === "\\") {
			i += 2;
			continue;
		}
		if (c === "`") {
			let j = i;
			while (body[j] === "`") j++;
			const count = j - i;
			if (!inline) inline = count;
			else if (inline === count) inline = 0;
			i = j;
			continue;
		}
		if (inline) {
			i++;
			continue;
		}
		if (body.startsWith("{%", i)) {
			const end = body.indexOf("%}", i + 2);
			i = end < 0 ? body.length : end + 2;
			continue;
		}
		if (c === "<" && body[i + 1] !== " ") {
			const end = body.indexOf(">", i + 1);
			if (end < 0) break;
			const tag = lower.slice(i + 1, end).split(/[\s>]/, 1)[0];
			if (tag === "code" || tag === "pre" || tag === "ac:plain-text-body") {
				const close = lower.indexOf(`</${tag}>`, end + 1);
				i = close < 0 ? body.length : close + tag.length + 3;
				continue;
			}
			i = end + 1;
			continue;
		}
		if (c === "[") {
			labels.push(body[i - 1] === "!");
			i++;
			continue;
		}
		const image = c === "]" ? labels.pop() : undefined;
		if (c === "]" && image !== undefined && !image && body[i + 1] === "(") {
			let start = i + 2,
				end = start;
			if (body[start] === "<") {
				start++;
				end = body.indexOf(">", start);
				if (end < 0) break;
			} else {
				let depth = 0;
				while (end < body.length) {
					if (body[end] === "\\") {
						end += 2;
						continue;
					}
					if (body[end] === "(") depth++;
					if (body[end] === ")") {
						if (!depth) break;
						depth--;
					}
					if (/\s/.test(body[end]!)) break;
					end++;
				}
			}
			if (end > start) {
				spans.push({ start, end, value: body.slice(start, end) });
				i = end + 1;
				continue;
			}
		}
		i++;
	}
	return spans;
}

export function patchMarkdownSyncLinks(
	body: string,
	targets: readonly SyncLinkTarget[] | SyncLinkIndex,
	base: string,
	protectedUrls: ReadonlySet<string> = new Set(),
): ReturnType<typeof patchSyncLinks> {
	const patches: TextPatch[] = [],
		changes: SyncLinkChange[] = [],
		unresolved: string[] = [];
	const aliases = Array.isArray(targets)
		? createSyncLinkIndex(targets).aliases
		: (targets as SyncLinkIndex).aliases;
	for (const span of markdownLinkSpans(body)) {
		if (protectedUrls.has(span.value) || span.value.startsWith("#")) continue;
		const normalized = key(span.value, base),
			candidates = normalized ? aliases.get(normalized.key) : undefined;
		if (!candidates?.length) continue;
		if (candidates.length !== 1) {
			unresolved.push(span.value);
			continue;
		}
		const target = candidates[0]!,
			url = target.excluded ? target.sourceUrl : target.destinationUrl;
		if (!url) {
			unresolved.push(span.value);
			continue;
		}
		if (key(url, base)?.key === normalized!.key) continue;
		const next = new URL(url);
		next.hash = normalized!.fragment;
		const after = next.href.replaceAll("(", "\\(").replaceAll(")", "\\)");
		patches.push({
			start: span.start,
			end: span.end,
			before: span.value,
			after,
		});
		changes.push({
			targetId: target.id,
			before: span.value,
			after: next.href,
			start: span.start,
			end: span.end,
		});
	}
	return {
		body: applyTextPatches(body, patches),
		changes,
		unresolved: [...new Set(unresolved)],
	};
}
