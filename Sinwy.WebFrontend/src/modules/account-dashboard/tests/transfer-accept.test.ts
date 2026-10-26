import { expect, test } from "bun:test";
import { PLAN_ORGANIZATION_LIMITS, type PlanSlug } from "@sinwy/shared";
import { acceptPathFor } from "#/modules/account-dashboard/lib/transfer-accept";

const held = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		id: `org_${i}`,
		name: `Org ${i}`,
	}));

const on = (plan: PlanSlug | null, active: number, suspended = false) => ({
	plan,
	suspended,
	organizationLimit: plan ? PLAN_ORGANIZATION_LIMITS[plan] : 0,
	activeOrganizations: held(active),
});

test("no plan → buy one; a suspended plan → resume it first", () => {
	expect(acceptPathFor(on(null, 0))).toEqual({ kind: "buy" });
	expect(acceptPathFor(on(null, 1, true))).toEqual({ kind: "suspended" });
});

test("a free slot → use it", () => {
	expect(acceptPathFor(on("professional", 1))).toEqual({
		kind: "slot",
		plan: "professional",
	});
});

test("a full plan → the cheapest tier with room, or none past the top", () => {
	expect(acceptPathFor(on("starter", 1))).toEqual({
		kind: "upgrade",
		from: "starter",
		to: "professional",
	});
	// held over the cap after a lowered limit: Professional's 2 wouldn't fit 2
	expect(acceptPathFor({ ...on("starter", 2), organizationLimit: 1 })).toEqual({
		kind: "upgrade",
		from: "starter",
		to: "enterprise",
	});
	expect(acceptPathFor(on("enterprise", 5))).toEqual({
		kind: "full",
		plan: "enterprise",
	});
});
