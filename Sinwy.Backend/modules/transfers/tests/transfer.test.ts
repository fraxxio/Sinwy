import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { Membership } from "@authModule";
import { readOutboxEmails } from "@backend/infrastructure/email";
import {
	type PolarModels,
	polarClient,
	productIdFor,
} from "@backend/infrastructure/polar";
import {
	activateOrganization,
	createUserWithSession,
	givePlan,
	holdSlot,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import { applySubscriptionEvent } from "@billingModule";
import db from "@db";
import {
	member,
	organization,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import { userSubscription } from "@db/schema/userSchema";
import {
	countHeldSlots,
	getOrganizationState,
	scheduleOwnedOrganizationsForDeletion,
} from "@organizationsModule";
import type { PlanSlug } from "@sinwy/shared";
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

let orgId: string;
let ownerId: string;
let staffId: string;
let membership: Membership;
const spies: { mockRestore: () => void }[] = [];

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
	// no money moves on a transfer; any Polar call fails the test
	for (const method of ["get", "revoke", "update"] as const)
		spies.push(
			spyOn(polarClient.subscriptions, method).mockRejectedValue(
				new Error("unexpected Polar call"),
			),
		);
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

const ownersOf = async (organizationId: string) =>
	(
		await db
			.select({ userId: member.userId })
			.from(member)
			.where(
				and(
					eq(member.organizationId, organizationId),
					eq(member.role, "owner"),
				),
			)
	).map((row) => row.userId);

test("offer: refused to the owner themselves, to a non-member, and while one is open", async () => {
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

test("offer: refused for a suspended org and an inactive one, without asking Polar", async () => {
	await givePlan(ownerId, null, { status: "paused" });
	expect(await offerTransfer(membership, ownerId, staffId)).toMatchObject({
		error: "suspended",
	});
	await givePlan(ownerId, "professional");
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));
	expect(await offerTransfer(membership, ownerId, staffId)).toMatchObject({
		error: "inactive",
	});
});

test("concurrent offers: exactly one goes through", async () => {
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

test("offer emails the recipient and shows up in their incoming list, without the org's tier", async () => {
	const id = await offered();
	const [email] = (await readOutboxEmails())
		.map(({ email }) => email)
		.filter((e) => e.to === `${staffId}@test.dev`);
	expect(email?.subject).toBe("You've been offered ownership of Handover Co");
	const incoming = await listIncomingTransfers(staffId);
	expect(incoming).toMatchObject([
		{
			id,
			status: "pending",
			organization: { id: orgId, name: "Handover Co" },
		},
	]);
	expect(incoming[0]?.organization).not.toHaveProperty("plan");
	expect(await listIncomingTransfers(ownerId)).toEqual([]);
});

const planBoughtFor = (
	transferId: string,
	plan: PlanSlug,
	overrides: Partial<PolarModels.Subscription> = {},
) =>
	applySubscriptionEvent({
		data: {
			id: `sub_bought_${transferId}`,
			status: "active",
			product_id: productIdFor(plan),
			customer: { external_id: staffId },
			metadata: { transferId },
			created_at: new Date().toISOString(),
			modified_at: new Date().toISOString(),
			...overrides,
		} as PolarModels.Subscription,
	});

const storedPlanOf = async (userId: string) => {
	const [row] = await db
		.select({ plan: userSubscription.plan })
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId));
	return row?.plan ?? null;
};

const emailTo = async (userId: string) =>
	(await readOutboxEmails())
		.map(({ email }) => email)
		.filter((email) => email.to === `${userId}@test.dev`);

test("accept without a plan → accepted, waiting on the checkout; nothing moves yet", async () => {
	const id = await offered();

	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: true,
		data: { status: "accepted" },
	});
	expect(await roleOf(ownerId)).toBe("owner");
	expect((await transferRow(id))?.status).toBe("accepted");
	expect((await getOrganizationState(orgId))?.status).toBe("active");
	expect(await listIncomingTransfers(staffId)).toMatchObject([
		{ id, status: "accepted" },
	]);
	// accepting again before paying changes nothing
	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: true,
		data: { status: "accepted" },
	});
});

test("the plan bought at acceptance completes the transfer when it lands; the old owner keeps their plan and gets the slot back", async () => {
	const id = await offered();
	await acceptIncomingTransfer(staffId, id);

	await planBoughtFor(id, "starter");

	expect((await transferRow(id))?.status).toBe("completed");
	expect(await ownersOf(orgId)).toEqual([staffId]);
	expect(await roleOf(ownerId)).toBe("admin");
	expect(await getOrganizationState(orgId)).toMatchObject({
		status: "active",
		ownerPlan: "starter",
		ownerUserId: staffId,
	});
	expect(await countHeldSlots(staffId)).toBe(1);
	expect(await countHeldSlots(ownerId)).toBe(0);
	expect(await storedPlanOf(ownerId)).toBe("professional");
	const [oldOwnerEmail] = await emailTo(ownerId);
	expect(oldOwnerEmail?.subject).toBe("Handover Co has a new owner");
	expect(oldOwnerEmail?.html).toContain("free again");
	expect(await emailTo(staffId)).toContainEqual(
		expect.objectContaining({ subject: "You now own Handover Co" }),
	);

	// redeliveries find it done
	await planBoughtFor(id, "starter");
	expect(await countHeldSlots(staffId)).toBe(1);
});

test("a plan that lands after the transfer closed is kept, and nothing moves (Default 11)", async () => {
	const id = await offered();
	await acceptIncomingTransfer(staffId, id);
	await cancelTransfer(membership);

	await planBoughtFor(id, "starter");

	expect(await storedPlanOf(staffId)).toBe("starter");
	expect(await ownersOf(orgId)).toEqual([ownerId]);
	expect((await transferRow(id))?.status).toBe("canceled");
});

test("a plan naming a transfer that isn't the user's, or isn't waiting on a checkout, completes nothing", async () => {
	const accepted = await offered();
	await acceptIncomingTransfer(staffId, accepted);
	const outsider = (await createUserWithSession()).userId;
	await planBoughtFor(accepted, "starter", {
		id: "sub_outsider",
		customer: { external_id: outsider } as PolarModels.Subscription["customer"],
	});
	expect((await transferRow(accepted))?.status).toBe("accepted");

	await cancelTransfer(membership);
	const pending = await offered();
	await planBoughtFor(pending, "starter");
	expect((await transferRow(pending))?.status).toBe("pending");
	expect(await ownersOf(orgId)).toEqual([ownerId]);
});

test("accept with a full plan → needs-slot, the offer stays open; after an upgrade it completes", async () => {
	await givePlan(staffId, "starter");
	const theirs = await insertOrganization("Their Co");
	await joinOrganization(theirs, staffId, "owner");
	await holdSlot(theirs);
	const id = await offered();

	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: false,
		error: "needs-slot",
	});
	expect((await transferRow(id))?.status).toBe("pending");

	await givePlan(staffId, "professional");
	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: true,
		data: { status: "completed" },
	});
	expect(await countHeldSlots(staffId)).toBe(2);
});

test("accept with a suspended plan → suspended, the offer stays open; after resuming it completes", async () => {
	await givePlan(staffId, null, { status: "paused" });
	const id = await offered();

	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: false,
		error: "suspended",
	});
	expect((await transferRow(id))?.status).toBe("pending");
	expect(await ownersOf(orgId)).toEqual([ownerId]);

	await givePlan(staffId, "starter");
	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: true,
		data: { status: "completed" },
	});
});

test("a recipient who fills their slot between accept and the plan landing ends up upgrading, not over the cap", async () => {
	const theirs = await insertOrganization("Their Co");
	await joinOrganization(theirs, staffId, "owner");
	const id = await offered();
	await acceptIncomingTransfer(staffId, id);
	// the plan reached the app first without completing the transfer (e.g. the
	// billing page's reconcile), and they activated their own organization
	const subscriptionId = `sub_bought_${id}`;
	await givePlan(staffId, "starter", { subscriptionId });
	await holdSlot(theirs);

	await planBoughtFor(id, "starter");

	expect((await transferRow(id))?.status).toBe("accepted");
	expect(await countHeldSlots(staffId)).toBe(1);
	expect(await ownersOf(orgId)).toEqual([ownerId]);
	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: false,
		error: "needs-slot",
	});

	await givePlan(staffId, "professional", { subscriptionId });
	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: true,
		data: { status: "completed" },
	});
	expect(await countHeldSlots(staffId)).toBe(2);
	expect(await countHeldSlots(ownerId)).toBe(0);
});

test("accept with a free slot completes at once: roles swap, the slot moves, the old owner keeps their plan and gets the slot back", async () => {
	await givePlan(staffId, "starter");
	const id = await offered();

	expect(await acceptIncomingTransfer(staffId, id)).toEqual({
		ok: true,
		data: { status: "completed" },
	});

	expect(await roleOf(staffId)).toBe("owner");
	expect(await roleOf(ownerId)).toBe("admin");
	expect(await ownersOf(orgId)).toEqual([staffId]);
	expect((await transferRow(id))?.status).toBe("completed");
	expect(await getOrganizationState(orgId)).toMatchObject({
		status: "active",
		ownerPlan: "starter",
		ownerUserId: staffId,
	});
	expect(await countHeldSlots(ownerId)).toBe(0);
	expect(await countHeldSlots(staffId)).toBe(1);
	const emails = (await readOutboxEmails()).map(({ email }) => email.to);
	expect(emails).toContain(`${ownerId}@test.dev`);
});

test("two recipients' acceptances racing for the last slot: exactly one org moves", async () => {
	await givePlan(staffId, "starter");
	const otherOrg = await insertOrganization("Other Co");
	const otherOwner = (await createUserWithSession()).userId;
	await joinOrganization(otherOrg, otherOwner, "owner");
	await joinOrganization(otherOrg, staffId, "staff");
	await activateOrganization(otherOrg, "professional");
	const first = await offered();
	const second = await offerTransfer(
		{ ...membership, organizationId: otherOrg },
		otherOwner,
		staffId,
	);
	if (!second.ok) throw new Error(second.error);

	const results = await Promise.all([
		acceptIncomingTransfer(staffId, first),
		acceptIncomingTransfer(staffId, second.data.id),
	]);

	expect(results.filter((r) => r.ok)).toHaveLength(1);
	expect(results.find((r) => !r.ok)).toMatchObject({ error: "needs-slot" });
	expect(await countHeldSlots(staffId)).toBe(1);
});

test("a lower cap landing on the recipient during their acceptance: the cap holds either way", async () => {
	await givePlan(staffId, "professional");
	const theirs = await insertOrganization("Their Co");
	await joinOrganization(theirs, staffId, "owner");
	await holdSlot(theirs);
	const id = await offered();

	const [accepted] = await Promise.all([
		acceptIncomingTransfer(staffId, id),
		applySubscriptionEvent({
			data: {
				id: `sub_${staffId}`,
				status: "active",
				product_id: productIdFor("starter"),
				customer: { external_id: staffId },
				metadata: {},
				created_at: new Date().toISOString(),
				modified_at: new Date().toISOString(),
			} as PolarModels.Subscription,
		}),
	]);

	expect(await countHeldSlots(staffId)).toBe(1);
	expect(await countHeldSlots(ownerId)).toBe(accepted.ok ? 0 : 1);
});

test("accept: only the recipient, and not once expired", async () => {
	await givePlan(staffId, "starter");
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

test("double accept: the second finds the transfer done", async () => {
	await givePlan(staffId, "professional");
	const id = await offered();

	const results = await Promise.all([
		acceptIncomingTransfer(staffId, id),
		acceptIncomingTransfer(staffId, id),
	]);

	expect(results.filter((r) => r.ok)).toHaveLength(1);
	expect(await ownersOf(orgId)).toEqual([staffId]);
});

test("a recipient who left before accepting → not found", async () => {
	await givePlan(staffId, "starter");
	const id = await offered();
	await db
		.delete(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, staffId)));

	expect(await acceptIncomingTransfer(staffId, id)).toMatchObject({
		ok: false,
	});
	expect(await roleOf(ownerId)).toBe("owner");
});

test("decline and owner cancel close the offer", async () => {
	const id = await offered();
	expect(await declineIncomingTransfer(ownerId, id)).toBe(false);
	expect(await declineIncomingTransfer(staffId, id)).toBe(true);
	expect((await transferRow(id))?.status).toBe("declined");

	const next = await offered();
	expect(await cancelTransfer(membership)).toBe(true);
	expect((await transferRow(next))?.status).toBe("canceled");
	expect(await cancelTransfer(membership)).toBe(false);
});

test("leaving or removal cancels transfers to that member; staying members keep theirs", async () => {
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
	const id = await offered();
	await scheduleOwnedOrganizationsForDeletion(ownerId);
	expect((await transferRow(id))?.status).toBe("canceled");
});

test("the expiry job expires lapsed offers only", async () => {
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
