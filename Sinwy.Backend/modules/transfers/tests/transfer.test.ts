import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { Membership } from "@authModule";
import { readOutboxEmails } from "@backend/infrastructure/email";
import {
	type PolarModels,
	polarClient,
	productIdFor,
} from "@backend/infrastructure/polar";
import { applySubscriptionEvent } from "@backend/modules/billing/projection";
import {
	changeOrganizationPlan,
	suspendOrganization,
} from "@backend/modules/billing/service";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import {
	member,
	organization,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import {
	getSubscriptionState,
	scheduleOwnedOrganizationsForDeletion,
} from "@organizationsModule";
import { and, eq } from "drizzle-orm";
import { expireTransfersJob } from "../expiry";
import {
	acceptIncomingTransfer,
	cancelTransfer,
	cancelTransfersToMember,
	declineIncomingTransfer,
	listIncomingTransfers,
	offerTransfer,
} from "../service";

type Subscription = PolarModels.Subscription;
type Checkout = PolarModels.Checkout;

let orgId: string;
let ownerId: string;
let staffId: string;
let membership: Membership;

const oldSubscriptionId = () => `sub_${orgId}`;
const spies: { mockRestore: () => void }[] = [];
const spy = <T extends { mockRestore: () => void }>(s: T) => {
	spies.push(s);
	return s;
};

const periodStart = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

const polarSubscription = (overrides: Partial<Subscription> = {}) =>
	({
		id: oldSubscriptionId(),
		status: "active",
		product_id: productIdFor("professional"),
		metadata: { referenceId: orgId },
		pause_at_period_end: false,
		cancel_at_period_end: false,
		current_period_start: periodStart.toISOString(),
		current_period_end: periodEnd.toISOString(),
		created_at: periodStart.toISOString(),
		modified_at: new Date().toISOString(),
		...overrides,
	}) as Subscription;

/** Polar as the tests see it: subscriptions by id, one paid order each. */
const stubPolar = (
	subscriptions: Record<string, Partial<Subscription>> = {},
) => {
	const known = (id: string) =>
		polarSubscription({ id, ...(subscriptions[id] ?? {}) });
	const get = spy(
		spyOn(polarClient.subscriptions, "get").mockImplementation((id) =>
			Promise.resolve(known(id)),
		),
	);
	const revoke = spy(
		spyOn(polarClient.subscriptions, "revoke").mockImplementation((id) =>
			Promise.resolve(
				known(id) && polarSubscription({ id, status: "canceled" }),
			),
		),
	);
	const orders = spy(
		spyOn(polarClient.orders, "list").mockImplementation((query) =>
			Promise.resolve({
				items: [
					{
						id: `order_${query?.subscription_id}`,
						paid: true,
						net_amount: 3000,
						refundable_amount: 3000,
					},
				],
				pagination: { total_count: 1, max_page: 1 },
			} as never),
		),
	);
	const refund = spy(
		spyOn(polarClient.refunds, "create").mockResolvedValue({} as never),
	);
	let checkouts = 0;
	const createCheckout = spy(
		spyOn(polarClient.checkouts, "create").mockImplementation(() => {
			checkouts++;
			return Promise.resolve({
				id: `checkout_${checkouts}`,
				url: `https://polar.test/checkout_${checkouts}`,
				status: "open",
			} as Checkout);
		}),
	);
	const getCheckout = spy(
		spyOn(polarClient.checkouts, "get").mockImplementation((id) =>
			Promise.resolve({
				id,
				url: `https://polar.test/${id}`,
				status: "open",
			} as Checkout),
		),
	);
	return { get, revoke, orders, refund, createCheckout, getCheckout };
};

beforeEach(async () => {
	await db.delete(organization);
	orgId = await insertOrganization("Handover Co");
	ownerId = (await createUserWithSession()).userId;
	staffId = (await createUserWithSession()).userId;
	await joinOrganization(orgId, ownerId, "owner");
	await joinOrganization(orgId, staffId, "staff");
	await activateOrganization(orgId, "professional");
	membership = {
		organizationId: orgId,
		roles: ["owner"],
		status: "active",
		plan: "professional",
	};
});

afterEach(() => {
	for (const s of spies.splice(0)) s.mockRestore();
});

const roleOf = async (userId: string) => {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
	return row?.role;
};

const transferRow = async (id: string) => {
	const [row] = await db
		.select()
		.from(organizationTransfer)
		.where(eq(organizationTransfer.id, id));
	return row;
};

const offered = async () => {
	const offer = await offerTransfer(membership, ownerId, staffId);
	if (!offer.ok) throw new Error(`offer failed: ${offer.error}`);
	return offer.data.id;
};

const accepted = async () => {
	const id = await offered();
	const result = await acceptIncomingTransfer(staffId, id);
	if (!result.ok) throw new Error(`accept failed: ${result.error}`);
	return id;
};

/** The subscription Polar creates once the recipient pays the transfer checkout. */
const newSubscription = (
	transferId: string,
	overrides: Partial<Subscription> = {},
) =>
	polarSubscription({
		id: `sub_new_${transferId}`,
		metadata: { referenceId: orgId, transferId },
		current_period_start: new Date().toISOString(),
		current_period_end: new Date(
			Date.now() + 30 * 24 * 60 * 60 * 1000,
		).toISOString(),
		...overrides,
	});

test("offer: refused to the owner themselves, to a non-member, and while one is open", async () => {
	stubPolar();
	const outsider = (await createUserWithSession()).userId;
	expect(await offerTransfer(membership, ownerId, ownerId)).toEqual({
		ok: false,
		error: "self",
	});
	expect(await offerTransfer(membership, ownerId, outsider)).toEqual({
		ok: false,
		error: "not-a-member",
	});
	await offered();
	expect(await offerTransfer(membership, ownerId, staffId)).toEqual({
		ok: false,
		error: "transfer-pending",
	});
});

test("offer: refused while a pause or cancel is pending, and for an inactive org", async () => {
	const pausing = stubPolar({
		[`sub_${orgId}`]: { pause_at_period_end: true },
	});
	expect(await offerTransfer(membership, ownerId, staffId)).toMatchObject({
		error: "pause-pending",
	});
	pausing.get.mockImplementation(() =>
		Promise.resolve(polarSubscription({ cancel_at_period_end: true })),
	);
	expect(await offerTransfer(membership, ownerId, staffId)).toMatchObject({
		error: "cancel-pending",
	});
	await db
		.update(organization)
		.set({ status: "inactive", plan: null, subscriptionId: null })
		.where(eq(organization.id, orgId));
	expect(await offerTransfer(membership, ownerId, staffId)).toMatchObject({
		error: "inactive",
	});
});

test("concurrent offers: exactly one goes through", async () => {
	stubPolar();
	const adminId = (await createUserWithSession()).userId;
	await joinOrganization(orgId, adminId, "admin");
	const results = await Promise.all([
		offerTransfer(membership, ownerId, staffId),
		offerTransfer(membership, ownerId, adminId),
	]);
	expect(results.filter((r) => r.ok)).toHaveLength(1);
	expect(results.find((r) => !r.ok)).toMatchObject({
		error: "transfer-pending",
	});
});

test("offer emails the recipient and shows up in their incoming list", async () => {
	stubPolar();
	const id = await offered();
	const [email] = (await readOutboxEmails())
		.map(({ email }) => email)
		.filter((e) => e.to === `${staffId}@test.dev`);
	expect(email?.subject).toBe("You've been offered ownership of Handover Co");
	expect(await listIncomingTransfers(staffId)).toMatchObject([
		{
			id,
			status: "pending",
			organization: { id: orgId, plan: "professional" },
		},
	]);
	expect(await listIncomingTransfers(ownerId)).toEqual([]);
});

test("accept opens a checkout on the org's plan for the recipient, carrying the transfer", async () => {
	const polar = stubPolar();
	const id = await offered();

	const result = await acceptIncomingTransfer(staffId, id);

	expect(result).toEqual({
		ok: true,
		data: { url: "https://polar.test/checkout_1" },
	});
	expect(polar.createCheckout.mock.calls[0]?.[0]).toMatchObject({
		products: [productIdFor("professional")],
		external_customer_id: staffId,
		metadata: { referenceId: orgId, transferId: id },
		allow_trial: false,
	});
	expect(await transferRow(id)).toMatchObject({
		status: "accepted",
		checkoutId: "checkout_1",
	});
});

test("accept: only the recipient, and not once expired", async () => {
	stubPolar();
	const id = await offered();
	expect(await acceptIncomingTransfer(ownerId, id)).toEqual({
		ok: false,
		error: "not-found",
	});
	expect(
		await acceptIncomingTransfer(
			staffId,
			id,
			new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
		),
	).toEqual({ ok: false, error: "expired" });
});

test("double accept returns the same checkout, sequentially and concurrently", async () => {
	const polar = stubPolar();
	const id = await offered();

	const [first, second] = await Promise.all([
		acceptIncomingTransfer(staffId, id),
		acceptIncomingTransfer(staffId, id),
	]);
	const again = await acceptIncomingTransfer(staffId, id);

	const stored = (await transferRow(id))?.checkoutId;
	const url = `https://polar.test/${stored}`;
	expect(first).toEqual({ ok: true, data: { url } });
	expect(second).toEqual({ ok: true, data: { url } });
	expect(again).toEqual({ ok: true, data: { url } });
	// the sequential retry reused the stored one instead of creating another
	expect(polar.createCheckout.mock.calls.length).toBeLessThanOrEqual(2);
});

test("decline and owner cancel close the offer", async () => {
	stubPolar();
	const id = await offered();
	expect(await declineIncomingTransfer(ownerId, id)).toBe(false);
	expect(await declineIncomingTransfer(staffId, id)).toBe(true);
	expect((await transferRow(id))?.status).toBe("declined");

	const next = await offered();
	expect(await cancelTransfer(membership)).toBe(true);
	expect((await transferRow(next))?.status).toBe("canceled");
	expect(await cancelTransfer(membership)).toBe(false);
});

test("payment completes the transfer: roles swap, org rebinds, old subscription revoked and refunded", async () => {
	const polar = stubPolar();
	const id = await accepted();
	const paid = newSubscription(id);

	await applySubscriptionEvent({ data: paid });

	expect(await roleOf(staffId)).toBe("owner");
	expect(await roleOf(ownerId)).toBe("admin");
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: paid.id,
	});
	expect(await transferRow(id)).toMatchObject({
		status: "completed",
		oldSubscriptionId: oldSubscriptionId(),
		newSubscriptionId: paid.id,
	});
	expect((await transferRow(id))?.settledAt).toBeInstanceOf(Date);
	expect(polar.revoke.mock.calls.map(([sub]) => sub)).toEqual([
		oldSubscriptionId(),
	]);
	const [refund] = polar.refund.mock.calls.map(([body]) => body);
	expect(refund?.order_id).toBe(`order_${oldSubscriptionId()}`);
	// half the period is left
	expect(refund?.amount).toBeGreaterThanOrEqual(1499);
	expect(refund?.amount).toBeLessThanOrEqual(1500);

	const subjects = (await readOutboxEmails())
		.map(({ email }) => email)
		.filter((e) =>
			[`${staffId}@test.dev`, `${ownerId}@test.dev`].includes(e.to),
		)
		.map((e) => e.subject);
	expect(subjects).toContain("You now own Handover Co");
	expect(subjects).toContain("Handover Co has a new owner");
});

test("redelivery after completion projects normally, without a second revoke or refund", async () => {
	const polar = stubPolar();
	const id = await accepted();
	await applySubscriptionEvent({ data: newSubscription(id) });
	await applySubscriptionEvent({
		data: newSubscription(id, {
			modified_at: new Date(Date.now() + 1000).toISOString(),
		}),
	});

	expect(polar.revoke).toHaveBeenCalledTimes(1);
	expect(polar.refund).toHaveBeenCalledTimes(1);
	expect((await getSubscriptionState(orgId))?.subscriptionId).toBe(
		`sub_new_${id}`,
	);
});

test("a failed revoke of the old subscription is retried by the next delivery", async () => {
	const polar = stubPolar();
	const id = await accepted();
	polar.revoke.mockRejectedValueOnce(new Error("Polar down"));

	await expect(
		applySubscriptionEvent({ data: newSubscription(id) }),
	).rejects.toThrow("Polar down");
	expect(await roleOf(staffId)).toBe("owner");
	expect((await transferRow(id))?.settledAt).toBeNull();

	await applySubscriptionEvent({
		data: newSubscription(id, {
			modified_at: new Date(Date.now() + 1000).toISOString(),
		}),
	});
	expect((await transferRow(id))?.settledAt).toBeInstanceOf(Date);
	expect(polar.refund).toHaveBeenCalledTimes(1);
});

for (const close of ["canceled", "expired", "declined"] as const)
	test(`payment for a ${close} transfer is revoked and refunded in full, the org untouched`, async () => {
		const polar = stubPolar();
		const id = await accepted();
		await db
			.update(organizationTransfer)
			.set({ status: close })
			.where(eq(organizationTransfer.id, id));
		const paid = newSubscription(id);

		await applySubscriptionEvent({ data: paid });

		expect(await roleOf(ownerId)).toBe("owner");
		expect((await getSubscriptionState(orgId))?.subscriptionId).toBe(
			oldSubscriptionId(),
		);
		expect(polar.revoke.mock.calls.map(([sub]) => sub)).toEqual([paid.id]);
		expect(polar.refund.mock.calls.map(([body]) => body)).toMatchObject([
			{ order_id: `order_${paid.id}`, amount: 3000 },
		]);
	});

test("a second paid checkout for a completed transfer is refunded in full", async () => {
	const polar = stubPolar();
	const id = await accepted();
	await applySubscriptionEvent({ data: newSubscription(id) });
	const second = newSubscription(id, { id: "sub_second" });

	await applySubscriptionEvent({ data: second });

	expect((await getSubscriptionState(orgId))?.subscriptionId).toBe(
		`sub_new_${id}`,
	);
	expect(polar.revoke.mock.calls.map(([sub]) => sub)).toContain("sub_second");
	expect(polar.refund.mock.calls.map(([body]) => body)).toContainEqual(
		expect.objectContaining({ order_id: "order_sub_second", amount: 3000 }),
	);
});

test("a recipient who left before paying: the transfer is canceled and the payment refunded", async () => {
	const polar = stubPolar();
	const id = await accepted();
	await db
		.delete(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, staffId)));

	await applySubscriptionEvent({ data: newSubscription(id) });

	expect((await transferRow(id))?.status).toBe("canceled");
	expect(await roleOf(ownerId)).toBe("owner");
	expect(polar.refund.mock.calls.map(([body]) => body)).toMatchObject([
		{ order_id: `order_sub_new_${id}`, amount: 3000 },
	]);
});

test("a recipient's non-entitled subscription state leaves an accepted transfer waiting", async () => {
	const polar = stubPolar();
	const id = await accepted();
	await applySubscriptionEvent({
		data: newSubscription(id, {
			status: "incomplete" as Subscription["status"],
		}),
	});
	expect((await transferRow(id))?.status).toBe("accepted");
	expect(polar.revoke).not.toHaveBeenCalled();
});

test("plan change and suspend are refused while a transfer is open", async () => {
	stubPolar();
	await offered();
	expect(await changeOrganizationPlan(membership, "starter")).toEqual({
		ok: false,
		error: "transfer-pending",
	});
	expect(await suspendOrganization(membership)).toEqual({
		ok: false,
		error: "transfer-pending",
	});
});

test("leaving or removal cancels transfers to that member; staying members keep theirs", async () => {
	stubPolar();
	const id = await offered();
	await cancelTransfersToMember(orgId, staffId);
	expect((await transferRow(id))?.status).toBe("pending");

	await db
		.delete(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, staffId)));
	await cancelTransfersToMember(orgId, staffId);
	expect((await transferRow(id))?.status).toBe("canceled");
});

test("the owner's account deletion cancels the open transfer", async () => {
	stubPolar();
	spy(
		spyOn(polarClient.subscriptions, "iterList").mockImplementation(
			async function* () {} as never,
		),
	);
	const id = await accepted();
	await scheduleOwnedOrganizationsForDeletion(ownerId);
	expect((await transferRow(id))?.status).toBe("canceled");
});

test("the expiry job expires lapsed offers only", async () => {
	stubPolar();
	const id = await offered();
	expect(await expireTransfersJob.run()).toBe(0);
	await db
		.update(organizationTransfer)
		.set({ expiresAt: new Date(Date.now() - 1000) })
		.where(eq(organizationTransfer.id, id));
	expect(await expireTransfersJob.run()).toBe(1);
	expect((await transferRow(id))?.status).toBe("expired");
	expect(await listIncomingTransfers(staffId)).toEqual([]);
});
