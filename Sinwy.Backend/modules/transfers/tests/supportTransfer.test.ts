import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { type PolarModels, polarClient } from "@backend/infrastructure/polar";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
import { getSubscriptionState } from "@organizationsModule";
import { asc, eq } from "drizzle-orm";
import { moveOwnership } from "../repository";
import { transferOwnershipBySupport } from "../service";

type Subscription = PolarModels.Subscription;

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

const period = {
	current_period_start: "2026-10-01T00:00:00Z",
	current_period_end: "2026-10-31T00:00:00Z",
};

const stubPolar = () => {
	const live: Partial<Subscription> = {
		id: `sub_${orgId}`,
		status: "active",
		metadata: { referenceId: orgId },
		created_at: "2026-10-01T00:00:00Z",
		modified_at: "2026-10-01T00:00:00Z",
		...period,
	};
	const get = spyOn(polarClient.subscriptions, "get").mockResolvedValue(
		live as Subscription,
	);
	const revoke = spyOn(polarClient.subscriptions, "revoke").mockResolvedValue({
		...live,
		status: "canceled",
		modified_at: "2026-10-16T00:00:01Z",
	} as Subscription);
	const orders = spyOn(polarClient.orders, "list").mockResolvedValue({
		items: [
			{ id: "order_1", paid: true, net_amount: 3000, refundable_amount: 3000 },
		],
		pagination: { total_count: 1, max_page: 1 },
	} as never);
	const refund = spyOn(polarClient.refunds, "create").mockResolvedValue(
		{} as never,
	);
	spies.push(get, revoke, orders, refund);
	return { revoke, refund };
};

const now = new Date("2026-10-16T00:00:00Z");

test("support transfer dry run reports the planned refund and writes nothing", async () => {
	await activateOrganization(orgId);
	const { revoke, refund } = stubPolar();
	const before = await roles();

	const result = await transferOwnershipBySupport({
		organizationId: orgId,
		toUserId: staffId,
		apply: false,
		now,
	});

	expect(result).toMatchObject({
		ok: true,
		applied: false,
		from: { userId: ownerId },
		to: { userId: staffId },
		outcome: { billable: true, refund: { orderId: "order_1", amount: 1500 } },
	});
	expect(await roles()).toEqual(before);
	expect(revoke).not.toHaveBeenCalled();
	expect(refund).not.toHaveBeenCalled();
});

test("support transfer --apply swaps roles, revokes, refunds the unused half and leaves the org inactive", async () => {
	await activateOrganization(orgId);
	const { revoke, refund } = stubPolar();

	const result = await transferOwnershipBySupport({
		organizationId: orgId,
		toUserId: staffId,
		apply: true,
		now,
	});

	expect(result).toMatchObject({
		ok: true,
		applied: true,
		outcome: {
			revoked: true,
			refund: { result: "refunded", orderId: "order_1", amount: 1500 },
		},
	});
	expect((await roles())[staffId]).toBe("owner");
	expect((await roles())[ownerId]).toBe("admin");
	expect(revoke).toHaveBeenCalledWith(`sub_${orgId}`);
	expect(refund.mock.calls[0]?.[0]).toMatchObject({
		order_id: "order_1",
		amount: 1500,
	});
	expect(await getSubscriptionState(orgId)).toEqual({
		status: "inactive",
		plan: null,
		subscriptionId: null,
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
