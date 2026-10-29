import { load } from "cheerio";

export interface XmlNode {
	name: string;
	attributes: Record<string, string>;
	start: number;
	end: number;
	text: string;
	protected: boolean;
}
export interface TextPatch {
	start: number;
	end: number;
	before: string;
	after: string;
}
export function xmlNodes(body: string): XmlNode[] {
	const $ = load(
		body,
		{
			xml: {
				xmlMode: true,
				decodeEntities: true,
				withStartIndices: true,
				withEndIndices: true,
			},
		},
		false,
	);
	return $("*")
		.toArray()
		.flatMap((node) => {
			if (
				node.type !== "tag" &&
				node.type !== "script" &&
				node.type !== "style"
			)
				return [];
			return node.startIndex === null ||
				node.startIndex === undefined ||
				node.endIndex === null ||
				node.endIndex === undefined
				? []
				: [
						{
							name: node.name,
							attributes: { ...node.attribs },
							start: node.startIndex,
							end: node.endIndex + 1,
							text: node.name === "a" ? $(node).text() : "",
							protected:
								["a", "ri:url", "ri:page"].includes(node.name) &&
								$(node).parents("code,pre,script,style,ac\\:plain-text-body")
									.length > 0,
						},
					];
		});
}
export function xmlAttributeSpan(
	body: string,
	node: XmlNode,
	name: string,
):
	| { start: number; end: number; attributeStart: number; attributeEnd: number }
	| undefined {
	let i = node.start + 1;
	while (i < body.length && !/[\s/>]/.test(body[i]!)) i++;
	while (i < body.length) {
		while (i < body.length && /\s/.test(body[i]!)) i++;
		if (!body[i] || body[i] === ">" || body[i] === "/") return;
		const attributeStart = i;
		while (i < body.length && !/[\s=/>]/.test(body[i]!)) i++;
		const key = body.slice(attributeStart, i);
		while (i < body.length && /\s/.test(body[i]!)) i++;
		if (body[i] !== "=") continue;
		i++;
		while (i < body.length && /\s/.test(body[i]!)) i++;
		const quote = body[i];
		if (quote !== '"' && quote !== "'") return;
		const start = ++i;
		while (i < body.length && body[i] !== quote) i++;
		if (i >= body.length) return;
		const end = i++;
		if (key === name)
			return {
				start,
				end,
				attributeStart:
					attributeStart > node.start && /\s/.test(body[attributeStart - 1]!)
						? attributeStart - 1
						: attributeStart,
				attributeEnd: i,
			};
	}
	return;
}
export function applyTextPatches(
	body: string,
	patches: readonly TextPatch[],
): string {
	let out = body,
		boundary = body.length;
	for (const patch of [...patches].sort((a, b) => b.start - a.start)) {
		if (
			patch.start < 0 ||
			patch.end > boundary ||
			body.slice(patch.start, patch.end) !== patch.before
		)
			throw new Error("Preview patch no longer matches its body");
		out = out.slice(0, patch.start) + patch.after + out.slice(patch.end);
		boundary = patch.start;
	}
	return out;
}
export function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
