import { expect, it } from "bun:test";
import { PLAN_FEATURES } from "@sinwy/shared";
import { type Entitlements, toEntitlements } from "../lib/auth/entitlements";

it("takes status, tier name and features from an active organization", () => {
	expect(
		toEntitlements({
			status: "active",
			plan: "professional",
			features: PLAN_FEATURES.professional,
		}),
	).toEqual({
		status: "active",
		plan: "professional",
		features: PLAN_FEATURES.professional,
	});
});

it("keeps the features for a member who isn't shown the tier name", () => {
	expect(
		toEntitlements({
			status: "active",
			plan: null,
			features: PLAN_FEATURES.professional,
		}).features,
	).toEqual(PLAN_FEATURES.professional);
});

it("entitles an inactive or unknown organization to nothing", () => {
	const nothing: Entitlements = {
		status: "inactive",
		plan: null,
		features: [],
	};
	expect(
		toEntitlements({
			status: "inactive",
			plan: "professional",
			features: PLAN_FEATURES.professional,
		}),
	).toEqual(nothing);
	expect(toEntitlements(undefined)).toEqual(nothing);
});
