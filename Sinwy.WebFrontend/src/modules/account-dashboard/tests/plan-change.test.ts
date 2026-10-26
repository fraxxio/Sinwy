import { describe, expect, it } from "bun:test";
import {
	describePlanChange,
	describeTiming,
	organizationsToKeep,
} from "../lib/plan-change";

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

describe("describeTiming", () => {
	it("applies an upgrade now and a downgrade at the period end", () => {
		expect(describeTiming("upgrade", "2026-11-22T10:00:00Z")).toStartWith(
			"Takes effect now.",
		);
		expect(
			describeTiming("downgrade", "2026-11-22T10:00:00Z", "en-US"),
		).toStartWith(
			"Takes effect on Nov 22, 2026, when this billing period ends.",
		);
		expect(describeTiming("downgrade", null)).toStartWith(
			"Takes effect at renewal",
		);
	});
});

describe("organizationsToKeep", () => {
	it("asks for picks only when more are active than the new plan allows", () => {
		expect(organizationsToKeep(2, "starter")).toBe(1);
		expect(organizationsToKeep(1, "starter")).toBeNull();
		expect(organizationsToKeep(5, "professional")).toBe(2);
		expect(organizationsToKeep(2, "enterprise")).toBeNull();
	});
});
