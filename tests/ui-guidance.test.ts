import { describe, expect, it } from "vitest";
import {
	lifecycleGuidance,
	measuredPercentage,
	operationLabel,
	phaseGuidance,
} from "../web/components/operator-guidance.js";
const en = (_ru: string, english: string) => english;
describe("operator guidance uses confirmed evidence", () => {
	it("does not invent a percentage from unknown or invalid counts", () => {
		for (const value of [
			undefined,
			{},
			{ completed: 2 },
			{ total: 5 },
			{ completed: 0, total: 0 },
			{ completed: 3, total: 2 },
			{ completed: -1, total: 2 },
			{ completed: 2, total: Number.POSITIVE_INFINITY },
		])
			expect(measuredPercentage(value)).toBeUndefined();
		expect(measuredPercentage({ completed: 0, total: 4 })).toBe(0);
		expect(measuredPercentage({ completed: 1, total: 4 })).toBe(25);
	});
	it("separates job completion from migration success and stop requests from confirmation", () => {
		expect(lifecycleGuidance("finished", en)).toContain(
			"separate operation result",
		);
		expect(lifecycleGuidance("stopping", en)).toContain(
			"Wait for confirmation",
		);
		expect(lifecycleGuidance("interrupted", en)).toContain(
			"not automatically repeated",
		);
	});
	it("explains exact core phases and preserves unknown evidence without classifying its words", () => {
		expect(phaseGuidance("Source inventory", en)).toContain(
			"not destination writing",
		);
		expect(phaseGuidance("Content transfer", en)).toContain("verified");
		expect(phaseGuidance("a title contains conflict or failed", en)).toContain(
			"worker reports",
		);
		expect(operationLabel("scan", en)).toBe("Mention and hashtag analysis");
		expect(operationLabel("historical-kind", en)).toBe("historical-kind");
		expect(operationLabel("constructor", en)).toBe("constructor");
		expect(phaseGuidance("__proto__", en)).toContain("worker reports");
		expect(lifecycleGuidance("constructor", en)).toContain("stored task state");
	});
});
