import { z } from "zod";

export interface TrashEvidence {
	id: string;
	status: string;
	version: string;
	leaf: boolean;
	allowed: boolean;
	reason?: string;
}
const schema = z
	.object({
		id: z.union([z.string(), z.number()]).transform(String),
		type: z.string(),
		status: z.string(),
		version: z.object({ number: z.number().int().positive() }),
		childTypes: z
			.object({ page: z.object({ value: z.boolean() }).passthrough() })
			.passthrough()
			.optional(),
		operations: z
			.array(
				z
					.object({ operation: z.string(), targetType: z.string().optional() })
					.passthrough(),
			)
			.optional(),
	})
	.passthrough();
/** An empty visible children list is insufficient: require the provider's explicit child-type evidence. */
export function parseTrashEvidence(
	value: unknown,
	expectedId: string,
): TrashEvidence {
	const parsed = schema.safeParse(value);
	if (!parsed.success)
		return {
			id: expectedId,
			status: "unknown",
			version: "",
			leaf: false,
			allowed: false,
			reason:
				"Provider did not expose authoritative status, version and child evidence",
		};
	const row = parsed.data;
	if (row.id !== expectedId) throw new Error("Trash immutable ID mismatch");
	const leaf = row.childTypes?.page.value === false,
		allowed =
			row.type === "page" &&
			row.status === "current" &&
			leaf &&
			row.operations?.some(
				(op) =>
					op.operation === "delete" &&
					(!op.targetType || op.targetType === "page"),
			) === true;
	return {
		id: row.id,
		status: row.status,
		version: String(row.version.number),
		leaf,
		allowed,
		...(!allowed
			? {
					reason:
						row.status !== "current"
							? "Only published current pages can be moved to trash"
							: !leaf
								? "No authoritative proof that the page has no children"
								: "Delete permission was not confirmed",
				}
			: {}),
	};
}
