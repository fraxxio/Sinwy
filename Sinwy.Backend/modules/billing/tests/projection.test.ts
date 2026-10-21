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
	applySubscriptionEvent,
	projectSubscription,
	reconcileInactiveOrganization,
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

// strictly increasing, so each projection in a test is newer than the last
let clock = Date.now();
const later = () => new Date(++clock);

const project = (overrides: Partial<Subscription> = {}, observedAt = later()) =>
	projectSubscription(subscription(overrides), observedAt);

const inactive: SubscriptionState = {
	status: "inactive",
	plan: null,
	subscriptionId: null,
};

test("active subscription → org active on its plan, bound to it", async () => {
	expect(await project()).toBe("active");
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_1",
	});
});

test("trialing and past_due still entitle", async () => {
	for (const status of ["trialing", "past_due"] as const) {
		await project({ status });
		expect((await getSubscriptionState(orgId))?.status).toBe("active");
	}
});

test("product change on the same subscription → new plan", async () => {
	await project();
	await project({ productId: productIdFor("enterprise") });
	expect((await getSubscriptionState(orgId))?.plan).toBe("enterprise");
});

test("canceled at period end keeps the org active until Polar ends it", async () => {
	await project({ cancelAtPeriodEnd: true });
	expect((await getSubscriptionState(orgId))?.status).toBe("active");
});

test("revoked subscription → inactive, plan and binding cleared", async () => {
	await project();
	expect(await project({ status: "canceled" })).toBe("inactive");
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("stale revocation of an old subscription leaves the new one alone", async () => {
	await project({ id: "sub_old" });
	await project({ id: "sub_old", status: "canceled" });
	await project({ id: "sub_new" });

	expect(await project({ id: "sub_old", status: "canceled" })).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_new",
	});
});

test("second active subscription does not take over the bound one", async () => {
	await project({ id: "sub_first" });
	expect(
		await project({
			id: "sub_second",
			productId: productIdFor("enterprise"),
		}),
	).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_first",
	});
});

test("unknown product → active with no plan, never a throw", async () => {
	await project({ productId: "prod_elsewhere" });
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: null,
		subscriptionId: "sub_1",
	});
});

test("no referenceId or unknown org → no-op, no throw", async () => {
	expect(await project({ metadata: {} })).toBeNull();
	expect(
		await project({ metadata: { referenceId: "org_does_not_exist" } }),
	).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("same subscription twice → same end state", async () => {
	await project();
	await project();
	expect((await getSubscriptionState(orgId))?.subscriptionId).toBe("sub_1");
});

test("state older than the applied one is ignored", async () => {
	const activeAt = later();
	await project({ status: "canceled" });

	expect(await project({}, activeAt)).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("applySubscriptionEvent: a late retry of an older event loses to the newer state", async () => {
	const activeAt = later();
	await applySubscriptionEvent({
		data: subscription({ status: "canceled" }),
		timestamp: later(),
	});
	await applySubscriptionEvent({ data: subscription(), timestamp: activeAt });

	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("applySubscriptionEvent: redelivery of the same event → same state", async () => {
	const event = { data: subscription(), timestamp: later() };
	await applySubscriptionEvent(event);
	await applySubscriptionEvent(event);

	expect((await getSubscriptionState(orgId))?.status).toBe("active");
});

let listSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
	listSpy?.mockRestore();
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

test("reconcile: a revocation applied while Polar is queried wins", async () => {
	listSpy = spyOn(polarClient.subscriptions, "list").mockImplementation(
		async () => {
			await applySubscriptionEvent({
				data: subscription({ status: "canceled" }),
				timestamp: new Date(Date.now() + 1000),
			});
			return { result: { items: [subscription()], pagination: {} } } as never;
		},
	);

	expect(await reconcileInactiveOrganization(orgId)).toBe(false);
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});
