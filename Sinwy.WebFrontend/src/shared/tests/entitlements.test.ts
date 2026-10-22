import { expect, it } from "bun:test";
import { toEntitlements } from "../lib/auth/entitlements";

it("parses status and plan from the organization", () => {
	expect(toEntitlements({ status: "active", plan: "professional" })).toEqual({
		status: "active",
		plan: "professional",
	});
});

it("treats a missing or unknown plan as no plan", () => {
	expect(toEntitlements({ status: "inactive" }).plan).toBeNull();
	expect(toEntitlements({ status: "active", plan: null }).plan).toBeNull();
	expect(toEntitlements({ status: "active", plan: "legacy" }).plan).toBeNull();
});

it("treats an unknown status as inactive, without its plan", () => {
	expect(toEntitlements({ status: "suspended", plan: "professional" })).toEqual(
		{ status: "inactive", plan: null },
	);
});
