import { expect, test } from "bun:test";
import {
	FEATURES,
	featuresFor,
	hasFeature,
	limitsFor,
	PLAN_FEATURES,
	PLAN_LIMITS,
	PLAN_ORGANIZATION_LIMITS,
	PLAN_SLUGS,
	toPlanSlug,
} from "@sinwy/shared";

test("plan matrix is pinned", () => {
	expect(PLAN_FEATURES).toEqual({
		starter: [],
		professional: ["page-builder", "custom-domain", "analytics-advanced"],
		enterprise: [
			"page-builder",
			"custom-domain",
			"analytics-advanced",
			"multi-location",
		],
	});
});

test("organization caps are pinned: Starter 1, Professional 2, Enterprise 5", () => {
	expect(PLAN_ORGANIZATION_LIMITS).toEqual({
		starter: 1,
		professional: 2,
		enterprise: 5,
	});
});

test("limits are pinned: pages 1/5/25, analytics retention 30/365/730 days", () => {
	expect(PLAN_LIMITS).toEqual({
		starter: { pages: 1, analyticsRetentionDays: 30 },
		professional: { pages: 5, analyticsRetentionDays: 365 },
		enterprise: { pages: 25, analyticsRetentionDays: 730 },
	});
});

test("limits never decrease with the tier, and no plan allows none", () => {
	for (const limit of ["pages", "analyticsRetentionDays"] as const) {
		const values = PLAN_SLUGS.map((plan) => PLAN_LIMITS[plan][limit]);
		expect(values).toEqual([...values].sort((a, b) => a - b));
		expect(limitsFor(null)[limit]).toBe(0);
	}
});

test("starter ⊂ professional ⊂ enterprise", () => {
	const subset = (a: readonly string[], b: readonly string[]) =>
		a.every((feature) => b.includes(feature));
	expect(subset(PLAN_FEATURES.starter, PLAN_FEATURES.professional)).toBe(true);
	expect(subset(PLAN_FEATURES.professional, PLAN_FEATURES.enterprise)).toBe(
		true,
	);
});

test("every feature is sold in at least one plan", () => {
	const sold = new Set(PLAN_SLUGS.flatMap((plan) => PLAN_FEATURES[plan]));
	expect([...sold].sort()).toEqual([...FEATURES].sort());
});

test("no plan entitles nothing", () => {
	expect(featuresFor(null)).toEqual([]);
	for (const feature of FEATURES) expect(hasFeature(null, feature)).toBe(false);
});

test("hasFeature follows the matrix", () => {
	expect(hasFeature("starter", "page-builder")).toBe(false);
	expect(hasFeature("professional", "page-builder")).toBe(true);
	expect(hasFeature("professional", "multi-location")).toBe(false);
	expect(hasFeature("enterprise", "multi-location")).toBe(true);
});

test("toPlanSlug keeps known plans and degrades the rest to null", () => {
	expect(toPlanSlug("professional")).toBe("professional");
	expect(toPlanSlug("gold")).toBeNull();
	expect(toPlanSlug(null)).toBeNull();
});
