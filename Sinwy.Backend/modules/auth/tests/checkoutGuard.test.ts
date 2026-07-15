import { beforeEach, expect, test } from "bun:test";
import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { ensureCheckoutAllowed } from "../checkoutGuard";

const orgId = "org_guard_1";
const memberId = "user_guard_member";
const strangerId = "user_guard_stranger";

const seed = async (status: "active" | "inactive") => {
	await db.delete(organization);
	await db.delete(user);
	const now = new Date();
	await db.insert(user).values([
		{
			id: memberId,
			name: "Member",
			email: "member@guard.test",
			createdAt: now,
			updatedAt: now,
		},
		{
			id: strangerId,
			name: "Stranger",
			email: "stranger@guard.test",
			createdAt: now,
			updatedAt: now,
		},
	]);
	await db.insert(organization).values({
		id: orgId,
		name: "Guard Org",
		slug: "guard-org",
		status,
		createdAt: now,
	});
	await db.insert(member).values({
		id: "member_guard_1",
		organizationId: orgId,
		userId: memberId,
		createdAt: now,
	});
};

beforeEach(() => seed("inactive"));

test("member of an inactive org → checkout proceeds", async () => {
	await expect(ensureCheckoutAllowed(memberId, orgId)).resolves.toBeUndefined();
});

test("non-member → FORBIDDEN", async () => {
	expect(ensureCheckoutAllowed(strangerId, orgId)).rejects.toThrow(
		"Not a member of this organization",
	);
});

test("member of an already-active org → rejected", async () => {
	await seed("active");
	expect(ensureCheckoutAllowed(memberId, orgId)).rejects.toThrow(
		"Organization is already active",
	);
});
