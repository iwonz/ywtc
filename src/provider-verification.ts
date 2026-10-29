import type {
	DestinationAdapter,
	DestinationPage,
	SourcePage,
} from "./domain.js";
import {
	verifyDestinationContent,
	DestinationContentVerificationError,
	type ContentVerificationResult,
} from "./content-model.js";
import {
	applyTextPatches,
	xmlAttributeSpan,
	xmlNodes,
	type TextPatch,
	type XmlNode,
} from "./xml-patches.js";

/** Native reference rewrites are accepted only with authoritative provider identity evidence. */
export async function verifyProviderContent(
	expected: string,
	actual: string | undefined,
	destination: DestinationAdapter,
	page: SourcePage,
	context: DestinationPage,
): Promise<ContentVerificationResult> {
	const basic = verifyDestinationContent(
		expected,
		actual,
		destination.kind,
		page,
	);
	if (
		actual === undefined ||
		destination.kind !== "confluence" ||
		!destination.resolveNativePageReference
	)
		return basic;
	const left = xmlNodes(expected).filter((n) => n.name === "ri:page"),
		right = xmlNodes(actual).filter((n) => n.name === "ri:page");
	if (left.length !== right.length || left.length === 0) return basic;
	const removals = (body: string, node: XmlNode): TextPatch[] =>
		["ri:content-id", "ri:space-key"].flatMap((name) => {
			const span = xmlAttributeSpan(body, node, name);
			return span
				? [
						{
							start: span.attributeStart,
							end: span.attributeEnd,
							before: body.slice(span.attributeStart, span.attributeEnd),
							after: "",
						},
					]
				: [];
		});
	const expectedPatches: TextPatch[] = [],
		actualPatches: TextPatch[] = [];
	for (let i = 0; i < left.length; i++) {
		const a = left[i]!,
			b = right[i]!,
			title = a.attributes["ri:content-title"];
		if (!title || title !== b.attributes["ri:content-title"]) continue;
		if (
			a.attributes["ri:content-id"] === b.attributes["ri:content-id"] &&
			a.attributes["ri:space-key"] === b.attributes["ri:space-key"]
		)
			continue;
		const resolve = (node: XmlNode) =>
			destination.resolveNativePageReference!(
				{
					title,
					...(node.attributes["ri:content-id"]
						? { id: node.attributes["ri:content-id"] }
						: {}),
					...(node.attributes["ri:space-key"]
						? { space: node.attributes["ri:space-key"] }
						: {}),
				},
				context,
			);
		const [from, to] = await Promise.all([resolve(a), resolve(b)]);
		if (!from || !to || from.id !== to.id) continue;
		expectedPatches.push(...removals(expected, a));
		actualPatches.push(...removals(actual, b));
	}
	if (!expectedPatches.length && !actualPatches.length) return basic;
	const result = verifyDestinationContent(
		applyTextPatches(expected, expectedPatches),
		applyTextPatches(actual, actualPatches),
		destination.kind,
		page,
	);
	return result.status === "complete"
		? {
				...result,
				normalizations: [
					"Verified provider-native page ID/title and space equivalence",
				],
			}
		: result;
}
export async function assertProviderContent(
	expected: string,
	actual: string | undefined,
	destination: DestinationAdapter,
	page: SourcePage,
	context: DestinationPage,
): Promise<ContentVerificationResult> {
	const result = await verifyProviderContent(
		expected,
		actual,
		destination,
		page,
		context,
	);
	if (result.status === "failed")
		throw new DestinationContentVerificationError(result);
	return result;
}
