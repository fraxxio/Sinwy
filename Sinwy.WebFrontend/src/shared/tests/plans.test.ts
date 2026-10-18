import { expect, it } from "bun:test";
import { FEATURES, PLAN_FEATURES, PLAN_SLUGS } from "@sinwy/shared";
import { minimumPlanFor } from "../lib/plans";

it("orders plan slugs cheapest to priciest", () => {
	expect(PLAN_SLUGS).toEqual(["starter", "professional", "enterprise"]);
});

it("gives every plan at least the features of the plan below it", () => {
	PLAN_SLUGS.reduce((below, slug) => {
		expect(PLAN_FEATURES[slug]).toEqual(
			expect.arrayContaining([...PLAN_FEATURES[below]]),
		);
		return slug;
	});
});

it("names the cheapest plan that includes each feature", () => {
	expect(
		Object.fromEntries(FEATURES.map((f) => [f, minimumPlanFor(f)])),
	).toEqual({
		"page-builder": "professional",
		"custom-domain": "professional",
		"analytics-advanced": "professional",
		"multi-location": "enterprise",
	});
});
