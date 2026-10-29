import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { parseTrashEvidence } from "../src/confluence-trash.js";
import { DataCenterConfluenceClient } from "../src/clients/confluence.js";
import { CloudConfluenceClient } from "../src/clients/confluence-cloud.js";
import { destinationProfile } from "./sync-fixture.js";
const evidence = {
	id: "42",
	type: "page",
	status: "current",
	version: { number: 7 },
	childTypes: { page: { value: false } },
	operations: [{ operation: "delete", targetType: "page" }],
};
afterEach(() => {
	expect(nock.isDone()).toBe(true);
	nock.cleanAll();
});
describe("reversible Confluence published-leaf trash", () => {
	it("requires explicit status, authoritative no-child evidence and permission", () => {
		expect(parseTrashEvidence(evidence, "42").allowed).toBe(true);
		for (const row of [
			{ ...evidence, status: "draft" },
			{ ...evidence, status: "trashed" },
			{ ...evidence, childTypes: {} },
			{ ...evidence, childTypes: { page: { value: true } } },
			{ ...evidence, operations: [] },
		])
			expect(parseTrashEvidence(row, "42").allowed).toBe(false);
		expect(() => parseTrashEvidence(evidence, "different")).toThrow(
			"ID mismatch",
		);
	});
	it.each(["data-center", "cloud"] as const)(
		"%s uses safe trash parameters and rechecks leaf/version before DELETE",
		async (deployment) => {
			const profile = {
				...destinationProfile,
				deployment,
				...(deployment === "cloud"
					? { authType: "api-token" as const, email: "fixture@example.com" }
					: {}),
			};
			const client =
				deployment === "cloud"
					? new CloudConfluenceClient(profile, 1000, destinationProfile.limits)
					: new DataCenterConfluenceClient(profile, 1000);
			const base = deployment === "cloud" ? "/wiki" : "";
			const scope = nock("https://conf.example.com")
				.get(`${base}/rest/api/content/42`)
				.query({
					status: "current",
					expand: "version,childTypes.page,operations",
				})
				.reply(200, evidence);
			scope
				.delete(
					deployment === "cloud"
						? "/wiki/api/v2/pages/42"
						: "/rest/api/content/42",
				)
				.query(
					deployment === "cloud"
						? { purge: "false", draft: "false" }
						: { status: "current" },
				)
				.reply(204);
			await client.trashPublishedLeaf("42", "7");
			nock("https://conf.example.com")
				.get(`${base}/rest/api/content/42`)
				.query({
					status: "current",
					expand: "version,childTypes.page,operations",
				})
				.reply(200, { ...evidence, version: { number: 8 } });
			await expect(client.trashPublishedLeaf("42", "7")).rejects.toThrow(
				"stale",
			);
		},
	);
});
