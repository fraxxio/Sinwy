import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient, productIdFor } from "@backend/infrastructure/polar";
import { insertOrganization, polarPages } from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { eq } from "drizzle-orm";
import { backfillSubscriptionBindings } from "../backfillSubscriptionBindings";

let listSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
	await db.delete(organization);
	listSpy = spyOn(polarClient.subscriptions, "list").mockResolvedValue(
		polarPages(),
	);
});

afterEach(() => listSpy.mockRestore());

const modifiedAt = new Date("2026-09-01T10:00:00Z");

const subscription = (
	organizationId: string,
	overrides: Partial<Subscription> = {},
) =>
	({
		id: `sub_${organizationId}`,
		status: "active",
		productId: productIdFor("professional"),
		metadata: { referenceId: organizationId },
		createdAt: new Date("2026-08-01T10:00:00Z"),
		modifiedAt,
		...overrides,
	}) as Subscription;

/** Active the way it was before migration 0008: no plan, no subscription. */
const insertLegacyActiveOrganization = async (name: string) => {
	const id = await insertOrganization(name);
	await db
		.update(organization)
		.set({ status: "active", subscriptionStatusAt: new Date() })
		.where(eq(organization.id, id));
	return id;
};

const stored = async (id: string) => {
	const [row] = await db
		.select({
			status: organization.status,
			plan: organization.plan,
			subscriptionId: organization.subscriptionId,
			subscriptionStatusAt: organization.subscriptionStatusAt,
		})
		.from(organization)
		.where(eq(organization.id, id));
	return row;
};

test("apply: binds an active org to its entitled subscription on Polar's clock", async () => {
	const id = await insertLegacyActiveOrganization("Legacy Co");
	listSpy.mockResolvedValue(
		polarPages([
			subscription(id, { status: "canceled" }),
			subscription(id, { status: "past_due" }),
		]),
	);

	const [entry] = await backfillSubscriptionBindings({ apply: true });

	expect(entry).toMatchObject({ id, result: "bound", plan: "professional" });
	expect(await stored(id)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: `sub_${id}`,
		subscriptionStatusAt: modifiedAt,
	});
});

test("dry run: reports what it would bind and writes nothing", async () => {
	const id = await insertLegacyActiveOrganization("Legacy Co");
	listSpy.mockResolvedValue(polarPages([subscription(id)]));

	const [entry] = await backfillSubscriptionBindings({ apply: false });

	expect(entry).toMatchObject({ id, result: "would bind" });
	expect(await stored(id)).toMatchObject({ plan: null, subscriptionId: null });
});

test("nothing entitled in Polar → reported and left as it is", async () => {
	const id = await insertLegacyActiveOrganization("Comped Co");

	const [entry] = await backfillSubscriptionBindings({ apply: true });

	expect(entry).toMatchObject({
		id,
		result: "no entitled subscription in Polar",
	});
	expect(await stored(id)).toMatchObject({ status: "active", plan: null });
});

test("inactive and already bound orgs are not touched", async () => {
	await insertOrganization("Inactive Co");
	const bound = await insertLegacyActiveOrganization("Bound Co");
	await db
		.update(organization)
		.set({ plan: "starter", subscriptionId: "sub_existing" })
		.where(eq(organization.id, bound));

	expect(await backfillSubscriptionBindings({ apply: true })).toEqual([]);
	expect(listSpy).not.toHaveBeenCalled();
});
