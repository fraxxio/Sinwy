import { describe, expect, it } from "bun:test";
import { describePlanChange } from "../lib/plan-change";

describe("describePlanChange", () => {
	it("lists what an upgrade adds and takes nothing away", () => {
		expect(describePlanChange("starter", "professional")).toEqual({
			direction: "upgrade",
			gained: ["page-builder", "custom-domain", "analytics-advanced"],
			lost: [],
		});
	});

	it("lists what a downgrade takes away", () => {
		expect(describePlanChange("enterprise", "professional")).toEqual({
			direction: "downgrade",
			gained: [],
			lost: ["multi-location"],
		});
	});

	it("orders by plan rank, skipping the plan in between", () => {
		expect(describePlanChange("enterprise", "starter")).toMatchObject({
			direction: "downgrade",
			lost: [
				"page-builder",
				"custom-domain",
				"analytics-advanced",
				"multi-location",
			],
		});
		expect(describePlanChange("starter", "enterprise").direction).toBe(
			"upgrade",
		);
	});
});
