import { beforeEach, expect, test } from "bun:test";
import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { ensureCheckoutAllowed } from "../checkoutGuard";

const orgId = "org_guard_1";
const ownerId = "user_guard_owner";
const adminId = "user_guard_admin";
const staffId = "user_guard_staff";
const strangerId = "user_guard_stranger";

const seed = async (status: "active" | "inactive") => {
	await db.delete(organization);
	await db.delete(user);
	const now = new Date();
	await db.insert(user).values(
		[ownerId, adminId, staffId, strangerId].map((id) => ({
			id,
			name: id,
			email: `${id}@guard.test`,
			createdAt: now,
			updatedAt: now,
		})),
	);
	await db.insert(organization).values({
		id: orgId,
		name: "Guard Org",
		slug: "guard-org",
		status,
		createdAt: now,
	});
	await db.insert(member).values(
		(
			[
				[ownerId, "owner"],
				[adminId, "admin"],
				[staffId, "staff"],
			] as const
		).map(([userId, role]) => ({
			id: `member_${userId}`,
			organizationId: orgId,
			userId,
			role,
			createdAt: now,
		})),
	);
};

beforeEach(() => seed("inactive"));

test("owner of an inactive org → checkout proceeds", async () => {
	await expect(ensureCheckoutAllowed(ownerId, orgId)).resolves.toBeUndefined();
});

test("non-member → FORBIDDEN", async () => {
	await expect(ensureCheckoutAllowed(strangerId, orgId)).rejects.toThrow(
		"Not a member of this organization",
	);
});

test("admin and staff of an inactive org → FORBIDDEN", async () => {
	for (const userId of [adminId, staffId])
		await expect(ensureCheckoutAllowed(userId, orgId)).rejects.toThrow(
			"You don't have permission to buy a plan for this organization",
		);
});

test("owner of an already-active org → rejected", async () => {
	await seed("active");
	await expect(ensureCheckoutAllowed(ownerId, orgId)).rejects.toThrow(
		"Organization is already active",
	);
});
