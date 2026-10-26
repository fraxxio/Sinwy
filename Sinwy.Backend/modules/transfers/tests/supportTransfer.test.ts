import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient } from "@backend/infrastructure/polar";
import {
	activateOrganization,
	createUserWithSession,
	givePlan,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
import { getOrganizationState, moveOwnership } from "@organizationsModule";
import { asc, eq } from "drizzle-orm";
import { transferOwnershipBySupport } from "../service";

let orgId: string;
let ownerId: string;
let adminId: string;
let staffId: string;

beforeEach(async () => {
	await db.delete(organization);
	orgId = await insertOrganization("Transfer Co");
	ownerId = (await createUserWithSession()).userId;
	adminId = (await createUserWithSession()).userId;
	staffId = (await createUserWithSession()).userId;
	await joinOrganization(orgId, ownerId, "owner");
	await joinOrganization(orgId, adminId, "admin");
	await joinOrganization(orgId, staffId, "staff");
});

const spies: { mockRestore: () => void }[] = [];
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

const roles = async () =>
	Object.fromEntries(
		(
			await db
				.select({ userId: member.userId, role: member.role })
				.from(member)
				.where(eq(member.organizationId, orgId))
				.orderBy(asc(member.userId))
		).map((row) => [row.userId, row.role]),
	);

test("role swap: the old owner becomes admin, the target owner, one owner throughout", async () => {
	expect(await moveOwnership(orgId, ownerId, staffId)).toEqual({
		result: "swapped",
		slotHeld: false,
	});
	expect(await roles()).toEqual({
		[ownerId]: "admin",
		[adminId]: "admin",
		[staffId]: "owner",
	});
});

test("role swap refuses a non-member, the owner themselves and a stale owner, changing nothing", async () => {
	const before = await roles();
	const outsider = (await createUserWithSession()).userId;
	expect(await moveOwnership(orgId, ownerId, outsider)).toEqual({
		result: "not-a-member",
	});
	expect(await moveOwnership(orgId, ownerId, ownerId)).toEqual({
		result: "not-a-member",
	});
	expect(await moveOwnership(orgId, adminId, staffId)).toEqual({
		result: "owner-changed",
	});
	expect(await roles()).toEqual(before);
});

test("two concurrent swaps to different members leave exactly one owner", async () => {
	const results = await Promise.all([
		moveOwnership(orgId, ownerId, adminId),
		moveOwnership(orgId, ownerId, staffId),
	]);
	expect(results.map((r) => r.result).sort()).toEqual([
		"owner-changed",
		"swapped",
	]);
	const owners = Object.values(await roles()).filter((r) => r === "owner");
	expect(owners).toHaveLength(1);
});

const slotHeld = async () => {
	const [row] = await db
		.select({ slotHeldAt: organization.slotHeldAt })
		.from(organization)
		.where(eq(organization.id, orgId));
	return row?.slotHeldAt != null;
};

test("support transfer dry run reports both users and writes nothing", async () => {
	await activateOrganization(orgId);
	const before = await roles();

	const result = await transferOwnershipBySupport({
		organizationId: orgId,
		toUserId: staffId,
		apply: false,
	});

	expect(result).toMatchObject({
		ok: true,
		applied: false,
		from: { userId: ownerId },
		to: { userId: staffId },
	});
	expect(await roles()).toEqual(before);
	expect(await slotHeld()).toBe(true);
});

test("support transfer --apply to a member without a plan: roles swap, the org leaves the old owner's slot and goes inactive, Polar untouched", async () => {
	await activateOrganization(orgId);
	const polarCalls = [
		spyOn(polarClient.subscriptions, "revoke"),
		spyOn(polarClient.refunds, "create"),
	];
	spies.push(...polarCalls);

	const result = await transferOwnershipBySupport({
		organizationId: orgId,
		toUserId: staffId,
		apply: true,
	});

	expect(result).toMatchObject({ ok: true, applied: true, slotHeld: false });
	expect((await roles())[staffId]).toBe("owner");
	expect((await roles())[ownerId]).toBe("admin");
	expect(await slotHeld()).toBe(false);
	expect((await getOrganizationState(orgId))?.status).toBe("inactive");
	for (const call of polarCalls) expect(call).not.toHaveBeenCalled();
});

test("support transfer --apply to a member with a free slot: the org stays active on their plan", async () => {
	await activateOrganization(orgId);
	await givePlan(staffId, "professional");

	const result = await transferOwnershipBySupport({
		organizationId: orgId,
		toUserId: staffId,
		apply: true,
	});

	expect(result).toMatchObject({ ok: true, applied: true, slotHeld: true });
	expect(await getOrganizationState(orgId)).toMatchObject({
		status: "active",
		ownerPlan: "professional",
	});
});

test("support transfer refuses a non-member target and an org scheduled for deletion", async () => {
	const outsider = (await createUserWithSession()).userId;
	expect(
		await transferOwnershipBySupport({
			organizationId: orgId,
			toUserId: outsider,
			apply: true,
		}),
	).toMatchObject({ ok: false });

	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));
	expect(
		await transferOwnershipBySupport({
			organizationId: orgId,
			toUserId: staffId,
			apply: true,
		}),
	).toMatchObject({ ok: false });
	expect((await roles())[ownerId]).toBe("owner");
});
