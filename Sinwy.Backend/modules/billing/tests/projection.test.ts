import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient, productIdFor } from "@backend/infrastructure/polar";
import { insertOrganization } from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import {
	getSubscriptionState,
	type SubscriptionState,
} from "@organizationsModule";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import {
	projectSubscription,
	reconcileInactiveOrganization,
	syncSubscription,
} from "../projection";

let orgId: string;

beforeEach(async () => {
	await db.delete(organization);
	orgId = await insertOrganization("Projection Co");
});

const subscription = (overrides: Partial<Subscription> = {}) =>
	({
		id: "sub_1",
		status: "active",
		productId: productIdFor("professional"),
		metadata: { referenceId: orgId },
		...overrides,
	}) as Subscription;

const inactive: SubscriptionState = {
	status: "inactive",
	plan: null,
	subscriptionId: null,
};

test("active subscription → org active on its plan, bound to it", async () => {
	expect(await projectSubscription(subscription())).toBe("active");
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_1",
	});
});

test("trialing and past_due still entitle", async () => {
	for (const status of ["trialing", "past_due"] as const) {
		await projectSubscription(subscription({ status }));
		expect((await getSubscriptionState(orgId))?.status).toBe("active");
	}
});

test("product change on the same subscription → new plan", async () => {
	await projectSubscription(subscription());
	await projectSubscription(
		subscription({ productId: productIdFor("enterprise") }),
	);
	expect((await getSubscriptionState(orgId))?.plan).toBe("enterprise");
});

test("canceled at period end keeps the org active until Polar ends it", async () => {
	await projectSubscription(subscription({ cancelAtPeriodEnd: true }));
	expect((await getSubscriptionState(orgId))?.status).toBe("active");
});

test("revoked subscription → inactive, plan and binding cleared", async () => {
	await projectSubscription(subscription());
	expect(await projectSubscription(subscription({ status: "canceled" }))).toBe(
		"inactive",
	);
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("stale revocation of an old subscription leaves the new one alone", async () => {
	await projectSubscription(subscription({ id: "sub_old" }));
	await projectSubscription(
		subscription({ id: "sub_old", status: "canceled" }),
	);
	await projectSubscription(subscription({ id: "sub_new" }));

	expect(
		await projectSubscription(
			subscription({ id: "sub_old", status: "canceled" }),
		),
	).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_new",
	});
});

test("second active subscription does not take over the bound one", async () => {
	await projectSubscription(subscription({ id: "sub_first" }));
	expect(
		await projectSubscription(
			subscription({
				id: "sub_second",
				productId: productIdFor("enterprise"),
			}),
		),
	).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_first",
	});
});

test("unknown product → active with no plan, never a throw", async () => {
	await projectSubscription(subscription({ productId: "prod_elsewhere" }));
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: null,
		subscriptionId: "sub_1",
	});
});

test("no referenceId or unknown org → no-op, no throw", async () => {
	expect(await projectSubscription(subscription({ metadata: {} }))).toBeNull();
	expect(
		await projectSubscription(
			subscription({ metadata: { referenceId: "org_does_not_exist" } }),
		),
	).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("same subscription twice → same end state", async () => {
	await projectSubscription(subscription());
	await projectSubscription(subscription());
	expect((await getSubscriptionState(orgId))?.subscriptionId).toBe("sub_1");
});

let getSpy: ReturnType<typeof spyOn> | undefined;
let listSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
	getSpy?.mockRestore();
	listSpy?.mockRestore();
});

test("syncSubscription projects Polar's current state, not the event's", async () => {
	await projectSubscription(subscription());
	// e.g. a retried `updated (active)` delivered after the revocation
	getSpy = spyOn(polarClient.subscriptions, "get").mockResolvedValue(
		subscription({ status: "canceled" }),
	);

	await syncSubscription("sub_1");

	expect(getSpy).toHaveBeenCalledWith({ id: "sub_1" });
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("syncSubscription throws when Polar can't be read, so the webhook is retried", async () => {
	getSpy = spyOn(polarClient.subscriptions, "get").mockRejectedValue(
		new Error("polar down"),
	);
	await expect(syncSubscription("sub_1")).rejects.toThrow("polar down");
});

const polarActive = (items: Subscription[]) =>
	spyOn(polarClient.subscriptions, "list").mockResolvedValue({
		result: { items, pagination: {} },
	} as never);

test("reconcile: inactive org with an active Polar subscription → activated with its plan", async () => {
	listSpy = polarActive([subscription()]);

	expect(await reconcileInactiveOrganization(orgId)).toBe(true);
	expect(listSpy).toHaveBeenCalledWith({
		metadata: { referenceId: orgId },
		active: true,
		limit: 1,
	});
	expect((await getSubscriptionState(orgId))?.plan).toBe("professional");
});

test("reconcile: nothing in Polar or Polar down → stays inactive", async () => {
	listSpy = polarActive([]);
	expect(await reconcileInactiveOrganization(orgId)).toBe(false);

	listSpy.mockRejectedValue(new Error("polar down"));
	expect(await reconcileInactiveOrganization(orgId)).toBe(false);
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});
