import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
	type PolarModels,
	polarClient,
	productIdFor,
} from "@backend/infrastructure/polar";
import {
	createUserWithSession,
	holdSlot,
	insertOrganization,
	joinOrganization,
	polarPages,
} from "@backend/test/helpers";
import db from "@db";
import { session } from "@db/schema/authSchema";
import { organization } from "@db/schema/organizationSchema";
import { user, userSubscription } from "@db/schema/userSchema";
import { getOrganizationState } from "@organizationsModule";
import { eq } from "drizzle-orm";
import {
	applySubscriptionEvent,
	projectSubscription,
	reconcileUserPlan,
} from "../projection";

type Subscription = PolarModels.Subscription;

let userId: string;
let orgId: string;
const spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	({ userId } = await createUserWithSession());
	orgId = await insertOrganization("Projection Co");
	await joinOrganization(orgId, userId, "owner");
	await holdSlot(orgId);
});

afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

const spy = <T extends object>(target: T, method: keyof T & string) => {
	const created = spyOn(target, method as never) as ReturnType<typeof spyOn>;
	spies.push(created);
	return created;
};

// Polar's modification time, strictly increasing, so each subscription
// state built in a test is newer than the last
let clock = Date.now();
const later = () => new Date(++clock).toISOString();
const at = (ms: number) => new Date(ms).toISOString();

const subscription = (overrides: Partial<Subscription> = {}) =>
	({
		id: "sub_1",
		status: "active",
		product_id: productIdFor("professional"),
		customer: { external_id: userId },
		metadata: {},
		created_at: at(0),
		modified_at: later(),
		...overrides,
	}) as Subscription;

const project = (overrides: Partial<Subscription> = {}) =>
	projectSubscription(subscription(overrides));

const planState = async () => {
	const [row] = await db
		.select({
			subscriptionId: userSubscription.subscriptionId,
			plan: userSubscription.plan,
			status: userSubscription.status,
		})
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId));
	return row ?? null;
};

const orgStatus = async () => (await getOrganizationState(orgId))?.status;

test("active subscription → the user is on its plan, bound to it, and their org with a slot is active", async () => {
	expect(orgStatus()).resolves.toBe("inactive");
	expect(await project()).toBe("entitled");
	expect(await planState()).toEqual({
		subscriptionId: "sub_1",
		plan: "professional",
		status: "active",
	});
	expect(await orgStatus()).toBe("active");
});

test("trialing and past_due still entitle", async () => {
	for (const status of ["trialing", "past_due"] as const) {
		expect(await project({ status })).toBe("entitled");
		expect((await planState())?.plan).toBe("professional");
	}
});

test("product change on the same subscription → new plan", async () => {
	await project();
	await project({ product_id: productIdFor("enterprise") });
	expect((await planState())?.plan).toBe("enterprise");
});

test("canceled at period end keeps the plan until Polar ends it", async () => {
	expect(await project({ cancel_at_period_end: true })).toBe("entitled");
	expect(await orgStatus()).toBe("active");
	expect(await project({ status: "canceled" })).toBe("not-entitled");
	expect(await orgStatus()).toBe("inactive");
});

test("statuses that grant no access → no plan, binding released, one Polar adds later included", async () => {
	for (const status of ["canceled", "incomplete", "unpaid", "frozen"]) {
		await project();
		expect(await project({ status: status as never })).toBe("not-entitled");
		expect(await planState()).toEqual({
			subscriptionId: null,
			plan: null,
			status,
		});
	}
});

test("paused subscription → no plan, still bound so it can resume; the org is suspended, its slot kept", async () => {
	await project();
	expect(await project({ status: "paused" })).toBe("not-entitled");
	expect(await planState()).toEqual({
		subscriptionId: "sub_1",
		plan: null,
		status: "paused",
	});
	const [org] = await db
		.select({ slotHeldAt: organization.slotHeldAt })
		.from(organization)
		.where(eq(organization.id, orgId));
	expect(org?.slotHeldAt).toBeInstanceOf(Date);
	expect(await orgStatus()).toBe("inactive");
});

test("paused, then active again on the same subscription → the same org is active again", async () => {
	await project();
	await project({ status: "paused" });
	expect(await project()).toBe("entitled");
	expect(await orgStatus()).toBe("active");
});

test("Polar's update then paused, then update then resumed, with the same data → each projects once", async () => {
	await project();
	const paused = subscription({ status: "paused" });
	expect(await projectSubscription(paused)).toBe("not-entitled");
	expect(await projectSubscription(paused)).toBeNull();
	expect(await orgStatus()).toBe("inactive");

	const resumed = subscription();
	expect(await projectSubscription(resumed)).toBe("entitled");
	expect(await projectSubscription(resumed)).toBeNull();
	expect(await orgStatus()).toBe("active");
});

test("an older active state arriving after the pause is ignored", async () => {
	const olderActive = subscription();
	await project({ status: "paused" });
	expect(await projectSubscription(olderActive)).toBeNull();
	expect((await planState())?.status).toBe("paused");
});

test("canceled after paused → binding released", async () => {
	await project({ status: "paused" });
	await project({ status: "canceled" });
	expect((await planState())?.subscriptionId).toBeNull();
});

test("a paused subscription the user isn't bound to is revoked as a second plan; the bound one stays", async () => {
	await project({ id: "sub_first" });
	spy(polarClient.subscriptions, "get").mockResolvedValue(
		subscription({ id: "sub_first" }) as never,
	);
	const revokeSpy = spy(polarClient.subscriptions, "revoke").mockResolvedValue(
		{} as never,
	);
	spy(polarClient.orders, "list").mockResolvedValue({ items: [] } as never);

	expect(await project({ id: "sub_other", status: "paused" })).toBeNull();
	expect(revokeSpy.mock.calls).toEqual([["sub_other"]]);
	expect(await planState()).toMatchObject({ subscriptionId: "sub_first" });
	expect(await orgStatus()).toBe("active");
});

test("losing the plan takes the user's orgs out of sessions, leaving other orgs' sessions alone", async () => {
	const otherOrgId = await insertOrganization("Other Co");
	const inOrg = await createUserWithSession({ activeOrganizationId: orgId });
	const elsewhere = await createUserWithSession({
		activeOrganizationId: otherOrgId,
	});
	const activeOrganizationOf = async (id: string) => {
		const [row] = await db
			.select({ activeOrganizationId: session.activeOrganizationId })
			.from(session)
			.where(eq(session.userId, id));
		return row?.activeOrganizationId;
	};

	await project();
	expect(await activeOrganizationOf(inOrg.userId)).toBe(orgId);

	await project({ status: "paused" });
	expect(await activeOrganizationOf(inOrg.userId)).toBeNull();
	expect(await activeOrganizationOf(elsewhere.userId)).toBe(otherOrgId);
});

test("a lower cap takes the released org out of sessions, leaving the kept one's alone", async () => {
	const laterOrgId = await insertOrganization("Later Co");
	await joinOrganization(laterOrgId, userId, "owner");
	await holdSlot(orgId, new Date("2026-01-01T00:00:00Z"));
	await holdSlot(laterOrgId, new Date("2026-02-01T00:00:00Z"));
	const inKept = await createUserWithSession({ activeOrganizationId: orgId });
	const inReleased = await createUserWithSession({
		activeOrganizationId: laterOrgId,
	});
	const activeOrganizationOf = async (id: string) => {
		const [row] = await db
			.select({ activeOrganizationId: session.activeOrganizationId })
			.from(session)
			.where(eq(session.userId, id));
		return row?.activeOrganizationId;
	};

	await project();
	await project({ product_id: productIdFor("starter") });

	expect((await getOrganizationState(laterOrgId))?.status).toBe("inactive");
	expect(await activeOrganizationOf(inReleased.userId)).toBeNull();
	expect(await activeOrganizationOf(inKept.userId)).toBe(orgId);
});

test("stale revocation of an old subscription leaves the new one alone", async () => {
	await project({ id: "sub_old" });
	await project({ id: "sub_old", status: "canceled" });
	await project({ id: "sub_new" });

	expect(await project({ id: "sub_old", status: "canceled" })).toBeNull();
	expect(await planState()).toEqual({
		subscriptionId: "sub_new",
		plan: "professional",
		status: "active",
	});
});

test("a second plan for a user who has one is revoked and refunded in full; the first stays", async () => {
	await project({ id: "sub_first" });
	spy(polarClient.subscriptions, "get").mockResolvedValue(
		subscription({ id: "sub_first" }) as never,
	);
	const revokeSpy = spy(polarClient.subscriptions, "revoke").mockResolvedValue(
		{} as never,
	);
	spy(polarClient.orders, "list").mockResolvedValue({
		items: [{ id: "order_2", paid: true, refundable_amount: 2900 }],
	} as never);
	const refundSpy = spy(polarClient.refunds, "create").mockResolvedValue(
		{} as never,
	);

	expect(
		await project({ id: "sub_second", product_id: productIdFor("enterprise") }),
	).toBeNull();

	expect(revokeSpy.mock.calls).toEqual([["sub_second"]]);
	expect(refundSpy).toHaveBeenCalledWith(
		expect.objectContaining({ order_id: "order_2", amount: 2900 }),
	);
	expect(await planState()).toEqual({
		subscriptionId: "sub_first",
		plan: "professional",
		status: "active",
	});
});

test("a second plan whose predecessor ended without its webhook takes over, nothing revoked", async () => {
	await project({ id: "sub_first" });
	spy(polarClient.subscriptions, "get").mockResolvedValue(
		subscription({ id: "sub_first", status: "canceled" }) as never,
	);
	const revokeSpy = spy(polarClient.subscriptions, "revoke");

	expect(
		await project({ id: "sub_second", product_id: productIdFor("enterprise") }),
	).toBe("entitled");

	expect(revokeSpy).not.toHaveBeenCalled();
	expect(await planState()).toMatchObject({
		subscriptionId: "sub_second",
		plan: "enterprise",
	});
});

test("a failed revoke of a second plan throws, so the webhook is retried", async () => {
	await project({ id: "sub_first" });
	spy(polarClient.subscriptions, "get").mockResolvedValue(
		subscription({ id: "sub_first" }) as never,
	);
	spy(polarClient.subscriptions, "revoke").mockRejectedValue(
		new Error("polar down"),
	);

	await expect(
		applySubscriptionEvent({ data: subscription({ id: "sub_second" }) }),
	).rejects.toThrow("polar down");
});

test("the first bound plan uses up the one trial; it stays used after the plan ends", async () => {
	const trialUsedAt = async () =>
		(
			await db
				.select({ at: userSubscription.trialUsedAt })
				.from(userSubscription)
				.where(eq(userSubscription.userId, userId))
		)[0]?.at;

	await project({ status: "trialing" });
	const first = await trialUsedAt();
	expect(first).toBeInstanceOf(Date);
	await project({ status: "canceled" });
	await project({ id: "sub_2" });
	expect(await trialUsedAt()).toEqual(first);
});

test("unknown product → no plan, never a throw", async () => {
	expect(await project({ product_id: "prod_unknown" })).toBe("entitled");
	expect(await planState()).toMatchObject({ plan: null, status: "active" });
	expect(await orgStatus()).toBe("inactive");
});

test("no external id or unknown user → no-op, no throw", async () => {
	expect(
		await project({ customer: { external_id: null } as never }),
	).toBeNull();
	expect(
		await project({ customer: { external_id: "user_gone" } as never }),
	).toBeNull();
	expect(await planState()).toBeNull();
});

test("same subscription twice → same end state", async () => {
	const same = subscription();
	await projectSubscription(same);
	expect(await projectSubscription(same)).toBeNull();
	expect((await planState())?.subscriptionId).toBe("sub_1");
});

test("state older than the applied one is ignored", async () => {
	const older = subscription({ status: "canceled" });
	await project();
	expect(await projectSubscription(older)).toBeNull();
	expect((await planState())?.plan).toBe("professional");
});

test("never-modified subscription is ordered by its creation time", async () => {
	await project({ status: "canceled", modified_at: at(1000) });
	expect(
		await project({ created_at: at(2000), modified_at: null as never }),
	).toBe("entitled");
});

test("a revocation delivered before an older activation keeps the plan released", async () => {
	const olderActive = subscription();
	await project({ status: "canceled" });
	expect(await projectSubscription(olderActive)).toBeNull();
	expect(await planState()).toMatchObject({ plan: null, subscriptionId: null });
});

test("applySubscriptionEvent: a late retry of an older event loses to the newer state", async () => {
	const olderActive = subscription();
	await applySubscriptionEvent({ data: subscription({ status: "canceled" }) });
	await applySubscriptionEvent({ data: olderActive });
	expect((await planState())?.plan).toBeNull();
});

const polarSubscriptions = (...items: Partial<Subscription>[]) =>
	spy(polarClient.subscriptions, "iterList").mockImplementation(
		polarPages(items.map((item) => subscription(item))),
	);

test("reconcile: a user without a plan takes their entitled Polar subscription, listed by customer", async () => {
	const listSpy = polarSubscriptions({ product_id: productIdFor("starter") });

	expect(await reconcileUserPlan(userId)).toBe(true);
	expect(listSpy).toHaveBeenCalledWith({
		external_customer_id: userId,
		limit: 100,
	});
	expect((await planState())?.plan).toBe("starter");
	expect(await orgStatus()).toBe("active");
});

test("reconcile: a past_due subscription counts, ended ones are skipped", async () => {
	polarSubscriptions(
		{ id: "sub_old", status: "canceled" },
		{ id: "sub_due", status: "past_due" },
	);
	expect(await reconcileUserPlan(userId)).toBe(true);
	expect((await planState())?.subscriptionId).toBe("sub_due");
});

test("reconcile: a paused subscription never grants a plan", async () => {
	polarSubscriptions({ status: "paused" });
	expect(await reconcileUserPlan(userId)).toBe(false);
	expect(await planState()).toBeNull();
});

test("reconcile: nothing in Polar or Polar down → no plan", async () => {
	polarSubscriptions();
	expect(await reconcileUserPlan(userId)).toBe(false);
	spies.splice(0).forEach((created) => {
		created.mockRestore();
	});
	spy(polarClient.subscriptions, "iterList").mockImplementation(() => {
		throw new Error("polar down");
	});
	expect(await reconcileUserPlan(userId)).toBe(false);
});

test("reconcile: a user who already has a plan never asks Polar", async () => {
	await project();
	const listSpy = polarSubscriptions();
	expect(await reconcileUserPlan(userId)).toBe(true);
	expect(listSpy).not.toHaveBeenCalled();
});
