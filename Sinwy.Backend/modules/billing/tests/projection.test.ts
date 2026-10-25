import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
	type PolarModels,
	polarClient,
	productIdFor,
} from "@backend/infrastructure/polar";
import {
	createUserWithSession,
	insertOrganization,
	polarPages,
} from "@backend/test/helpers";
import db from "@db";
import { session } from "@db/schema/authSchema";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import {
	activateSubscription,
	getSubscriptionState,
	type SubscriptionState,
} from "@organizationsModule";
import { eq } from "drizzle-orm";
import {
	applySubscriptionEvent,
	projectSubscription,
	reconcileInactiveOrganization,
} from "../projection";

type Subscription = PolarModels.Subscription;

let orgId: string;

beforeEach(async () => {
	await db.delete(organization);
	orgId = await insertOrganization("Projection Co");
});

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
		metadata: { referenceId: orgId },
		created_at: at(0),
		modified_at: later(),
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
	await project({ product_id: productIdFor("enterprise") });
	expect((await getSubscriptionState(orgId))?.plan).toBe("enterprise");
});

test("canceled at period end keeps the org active until Polar ends it", async () => {
	await project();
	expect(await project({ cancel_at_period_end: true })).toBe("active");
	expect(
		await project({ status: "canceled", cancel_at_period_end: true }),
	).toBe("inactive");
});

test("statuses that grant no access → inactive, one Polar adds later included", async () => {
	for (const status of [
		"incomplete",
		"incomplete_expired",
		"unpaid",
	] as Subscription["status"][]) {
		await project();
		expect(await project({ status })).toBe("inactive");
	}
});

test("paused subscription → inactive without a plan, still bound so it can resume", async () => {
	await project();
	expect(await project({ status: "paused" })).toBe("inactive");
	expect(await getSubscriptionState(orgId)).toEqual({
		...inactive,
		subscriptionId: "sub_1",
	});
});

test("paused, then active again on the same subscription → reactivated on its plan", async () => {
	await project();
	await project({ status: "paused" });

	expect(await project()).toBe("active");
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_1",
	});
});

test("an older active state arriving after the pause is ignored", async () => {
	const activeAt = later();
	await project({ status: "paused" });

	expect(await project({ modified_at: activeAt })).toBeNull();
	expect((await getSubscriptionState(orgId))?.status).toBe("inactive");
});

test("canceled after paused → binding released", async () => {
	await project();
	await project({ status: "paused" });

	expect(await project({ status: "canceled" })).toBe("inactive");
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("a paused subscription the org isn't bound to changes nothing", async () => {
	await project({ id: "sub_first" });

	expect(await project({ id: "sub_other", status: "paused" })).toBeNull();
	expect((await getSubscriptionState(orgId))?.status).toBe("active");
});

test("pausing takes the org out of sessions", async () => {
	await db.delete(user);
	const inOrg = await createUserWithSession({ activeOrganizationId: orgId });
	await project();

	await project({ status: "paused" });

	const [row] = await db
		.select({ activeOrganizationId: session.activeOrganizationId })
		.from(session)
		.where(eq(session.userId, inOrg.userId));
	expect(row?.activeOrganizationId).toBeNull();
});

test("revoked subscription → inactive, plan and binding cleared", async () => {
	await project();
	expect(await project({ status: "canceled" })).toBe("inactive");
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("deactivation takes the org out of sessions, leaving other orgs' sessions alone", async () => {
	await db.delete(user);
	const otherOrgId = await insertOrganization("Other Co");
	const inOrg = await createUserWithSession({ activeOrganizationId: orgId });
	const elsewhere = await createUserWithSession({
		activeOrganizationId: otherOrgId,
	});
	const activeOrganizationOf = async (userId: string) => {
		const [row] = await db
			.select({ activeOrganizationId: session.activeOrganizationId })
			.from(session)
			.where(eq(session.userId, userId));
		return row?.activeOrganizationId;
	};

	await project();
	expect(await activeOrganizationOf(inOrg.userId)).toBe(orgId);

	await project({ status: "canceled" });
	expect(await activeOrganizationOf(inOrg.userId)).toBeNull();
	expect(await activeOrganizationOf(elsewhere.userId)).toBe(otherOrgId);
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
			product_id: productIdFor("enterprise"),
		}),
	).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: "sub_first",
	});
});

test("an org scheduled for deletion refuses every subscription; billable ones are revoked", async () => {
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));
	const revokeSpy = spyOn(
		polarClient.subscriptions,
		"revoke",
	).mockResolvedValue({} as never);
	try {
		expect(await project({ id: "sub_raced" })).toBeNull();
		expect(await project({ id: "sub_paused", status: "paused" })).toBeNull();
		expect(await project({ id: "sub_ended", status: "canceled" })).toBeNull();

		expect(revokeSpy.mock.calls).toEqual([["sub_raced"], ["sub_paused"]]);
		expect(await getSubscriptionState(orgId)).toEqual(inactive);
	} finally {
		revokeSpy.mockRestore();
	}
});

test("a failed revoke for an org scheduled for deletion throws, so the webhook is retried", async () => {
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));
	const revokeSpy = spyOn(
		polarClient.subscriptions,
		"revoke",
	).mockRejectedValue(new Error("polar down"));
	try {
		await expect(
			applySubscriptionEvent({ data: subscription({ id: "sub_raced" }) }),
		).rejects.toThrow("polar down");
	} finally {
		revokeSpy.mockRestore();
	}
});

test("a refused write says why, from the state it was refused against", async () => {
	await project({ id: "sub_first" });

	expect(
		await activateSubscription(
			orgId,
			"sub_second",
			"starter",
			new Date(later()),
		),
	).toEqual({ result: "bound-elsewhere", boundSubscriptionId: "sub_first" });
	expect(
		await activateSubscription(orgId, "sub_first", "starter", new Date(0)),
	).toEqual({ result: "outdated" });
	expect(
		await activateSubscription(
			"org_missing",
			"sub_first",
			"starter",
			new Date(later()),
		),
	).toEqual({ result: "unknown-organization" });
});

test("unknown product → active with no plan, never a throw", async () => {
	await project({ product_id: "prod_elsewhere" });
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

	expect(await project({ modified_at: activeAt })).toBeNull();
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("never-modified subscription is ordered by its creation time", async () => {
	await project({ status: "canceled", modified_at: at(2000) });

	expect(await project({ modified_at: null, created_at: at(1000) })).toBeNull();
	expect(await project({ modified_at: null, created_at: later() })).toBe(
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
	spyOn(polarClient.subscriptions, "iterList").mockImplementation(
		polarPages(items),
	);

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

test("reconcile: a paused subscription never activates the org", async () => {
	await project({ status: "paused" });
	listSpy = polarActive([subscription({ status: "paused" })]);

	expect(await reconcileInactiveOrganization(orgId)).toBe(false);
	expect(await getSubscriptionState(orgId)).toEqual({
		...inactive,
		subscriptionId: "sub_1",
	});
});

test("reconcile: nothing in Polar or Polar down → stays inactive", async () => {
	listSpy = polarActive([]);
	expect(await reconcileInactiveOrganization(orgId)).toBe(false);

	listSpy.mockImplementation(async function* () {
		const items: never[] = await Promise.reject(new Error("polar down"));
		yield* items;
	});
	expect(await reconcileInactiveOrganization(orgId)).toBe(false);
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("reconcile: a revocation applied while Polar is queried wins", async () => {
	const listed = subscription();
	listSpy = spyOn(polarClient.subscriptions, "iterList").mockImplementation(
		async function* () {
			await applySubscriptionEvent({
				data: subscription({ status: "canceled" }),
			});
			yield listed;
		},
	);

	expect(await reconcileInactiveOrganization(orgId)).toBe(false);
	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});

test("reconcile and webhooks share Polar's clock: a later revocation applies even when ours runs ahead", async () => {
	const polarNow = new Date("2020-01-01T00:00:00Z");
	listSpy = polarActive([
		subscription({ modified_at: polarNow.toISOString() }),
	]);
	expect(await reconcileInactiveOrganization(orgId)).toBe(true);

	await applySubscriptionEvent({
		data: subscription({
			status: "canceled",
			modified_at: at(polarNow.getTime() + 1000),
		}),
	});

	expect(await getSubscriptionState(orgId)).toEqual(inactive);
});
