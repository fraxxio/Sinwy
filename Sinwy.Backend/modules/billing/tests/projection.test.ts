import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient, productIdFor } from "@backend/infrastructure/polar";
import { insertOrganization, polarPages } from "@backend/test/helpers";
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

// Polar's modification time, strictly increasing, so each subscription
// state built in a test is newer than the last
let clock = Date.now();
const later = () => new Date(++clock);

const subscription = (overrides: Partial<Subscription> = {}) =>
	({
		id: "sub_1",
		status: "active",
		productId: productIdFor("professional"),
		metadata: { referenceId: orgId },
		createdAt: new Date(0),
		modifiedAt: later(),
		...overrides,
	}) as Subscription;

const project = (overrides: Partial<Subscription> = {}) =>
	projectSubscription(subscription(overrides));

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

	expect(await project({ modifiedAt: activeAt })).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("never-modified subscription is ordered by its creation time", async () => {
	await project({ status: "canceled", modifiedAt: new Date(2000) });

	expect(
		await project({ modifiedAt: null, createdAt: new Date(1000) }),
	).toBeNull();
	expect(await project({ modifiedAt: null, createdAt: later() })).toBe(
		"active",
	);
});

test("applySubscriptionEvent: a late retry of an older event loses to the newer state", async () => {
	const active = subscription();
	await applySubscriptionEvent({ data: subscription({ status: "canceled" }) });
	await applySubscriptionEvent({ data: active });

	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("applySubscriptionEvent: redelivery of the same event → same state", async () => {
	const event = { data: subscription() };
	await applySubscriptionEvent(event);
	await applySubscriptionEvent(event);

	expect((await getSubscriptionState(orgId))?.status).toBe("active");
});

let listSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
	listSpy?.mockRestore();
});

const polarActive = (items: Subscription[]) =>
	spyOn(polarClient.subscriptions, "list").mockResolvedValue(polarPages(items));

test("reconcile: inactive org with an active Polar subscription → activated with its plan", async () => {
	listSpy = polarActive([subscription()]);

	expect(await reconcileInactiveOrganization(orgId)).toBe(true);
	expect(listSpy).toHaveBeenCalledWith({
		metadata: { referenceId: orgId },
		limit: 100,
	});
	expect((await getSubscriptionState(orgId))?.plan).toBe("professional");
});

test("reconcile: a past_due subscription counts, ended ones are skipped", async () => {
	listSpy = polarActive([
		subscription({ id: "sub_ended", status: "canceled" }),
		subscription({ status: "past_due" }),
	]);

	expect(await reconcileInactiveOrganization(orgId)).toBe(true);
	expect((await getSubscriptionState(orgId))?.subscriptionId).toBe(
		subscription().id,
	);
});

test("reconcile: nothing in Polar or Polar down → stays inactive", async () => {
	listSpy = polarActive([]);
	expect(await reconcileInactiveOrganization(orgId)).toBe(false);

	listSpy.mockRejectedValue(new Error("polar down"));
	expect(await reconcileInactiveOrganization(orgId)).toBe(false);
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("reconcile: a revocation applied while Polar is queried wins", async () => {
	const listed = subscription();
	listSpy = spyOn(polarClient.subscriptions, "list").mockImplementation(
		async () => {
			await applySubscriptionEvent({
				data: subscription({ status: "canceled" }),
			});
			return polarPages([listed]);
		},
	);

	expect(await reconcileInactiveOrganization(orgId)).toBe(false);
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("reconcile and webhooks share Polar's clock: a later revocation applies even when ours runs ahead", async () => {
	const polarNow = new Date("2020-01-01T00:00:00Z");
	listSpy = polarActive([subscription({ modifiedAt: polarNow })]);
	expect(await reconcileInactiveOrganization(orgId)).toBe(true);

	await applySubscriptionEvent({
		data: subscription({
			status: "canceled",
			modifiedAt: new Date(polarNow.getTime() + 1000),
		}),
	});

	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});
