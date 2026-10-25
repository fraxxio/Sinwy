import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	spyOn,
	test,
} from "bun:test";
import { polarClient } from "@backend/infrastructure/polar";
import createApp from "@backend/lib/app";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
	polarPages,
} from "@backend/test/helpers";
import db from "@db";
import {
	invitation,
	member,
	organization,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerAuthRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let ownerId: string;
let ownerCookie: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Solo Co");
	({ userId: ownerId, cookie: ownerCookie } = await createUserWithSession());
	await joinOrganization(orgId, ownerId, "owner");
});

const post = (path: string, cookie: string, body: unknown) =>
	fetch(new URL(`/api/auth/organization/${path}`, base), {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify(body),
	});

const roleOf = async (userId: string) => {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(eq(member.userId, userId));
	return row?.role;
};

const memberIdOf = (userId: string) => `member_${userId}_${orgId}`;

test("owner can't invite anyone as owner", async () => {
	const res = await post("invite-member", ownerCookie, {
		email: "next@test.dev",
		role: "owner",
		organizationId: orgId,
	});

	expect(res.status).toBe(403);
	expect(await db.select().from(invitation)).toEqual([]);
});

test("owner can't promote a member to owner; other role changes still work", async () => {
	const { userId } = await createUserWithSession();
	await joinOrganization(orgId, userId, "staff");

	for (const role of ["owner", ["admin", "owner"]])
		expect(
			(
				await post("update-member-role", ownerCookie, {
					memberId: memberIdOf(userId),
					role,
					organizationId: orgId,
				})
			).status,
		).toBe(403);
	expect(await roleOf(userId)).toBe("staff");

	const res = await post("update-member-role", ownerCookie, {
		memberId: memberIdOf(userId),
		role: "admin",
		organizationId: orgId,
	});
	expect(res.status).toBe(200);
	expect(await roleOf(userId)).toBe("admin");
});

test("owner's own role can't change", async () => {
	const res = await post("update-member-role", ownerCookie, {
		memberId: memberIdOf(ownerId),
		role: ["owner", "admin"],
		organizationId: orgId,
	});

	expect(res.status).toBe(403);
	expect(await roleOf(ownerId)).toBe("owner");
});

test("a pending owner invitation can't be accepted", async () => {
	const invitee = await createUserWithSession();
	await db.insert(invitation).values({
		id: "invitation_owner",
		organizationId: orgId,
		email: `${invitee.userId}@test.dev`,
		role: "owner",
		status: "pending",
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: new Date(),
		inviterId: ownerId,
	});

	const res = await post("accept-invitation", invitee.cookie, {
		invitationId: "invitation_owner",
	});

	expect(res.status).toBe(403);
	expect(await roleOf(invitee.userId)).toBeUndefined();
});

test("an org scheduled for deletion takes no new invitations and lets none be accepted", async () => {
	const invitee = await createUserWithSession();
	await db.insert(invitation).values({
		id: "invitation_staff",
		organizationId: orgId,
		email: `${invitee.userId}@test.dev`,
		role: "staff",
		status: "pending",
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: new Date(),
		inviterId: ownerId,
	});
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));

	const invited = await post("invite-member", ownerCookie, {
		email: "next@test.dev",
		role: "staff",
		organizationId: orgId,
	});
	const accepted = await post("accept-invitation", invitee.cookie, {
		invitationId: "invitation_staff",
	});

	expect(invited.status).toBe(403);
	expect(accepted.status).toBe(403);
	expect(
		(await db.select({ id: invitation.id }).from(invitation)).map(
			(row) => row.id,
		),
	).toEqual(["invitation_staff"]);
	expect(await roleOf(invitee.userId)).toBeUndefined();
});

test("owner can't leave their organization", async () => {
	expect(
		(await post("leave", ownerCookie, { organizationId: orgId })).status,
	).toBe(400);
	expect(await roleOf(ownerId)).toBe("owner");
});

test("the database refuses a second owner", async () => {
	const { userId } = await createUserWithSession();
	await expect(
		joinOrganization(orgId, userId, "admin,owner"),
	).rejects.toThrow();
});

let listSpy: ReturnType<typeof spyOn> | undefined;
let revokeSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
	listSpy?.mockRestore();
	revokeSpy?.mockRestore();
});

const polarSubscription = (id: string) => {
	listSpy = spyOn(polarClient.subscriptions, "iterList").mockImplementation(
		polarPages([{ id, status: "active" }]),
	);
	revokeSpy = spyOn(polarClient.subscriptions, "revoke").mockResolvedValue(
		{} as never,
	);
};

const orgExists = async () =>
	(
		await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, orgId))
	).length > 0;

test("deleting the organization through Better Auth revokes its subscription first", async () => {
	polarSubscription("sub_solo");

	const res = await post("delete", ownerCookie, { organizationId: orgId });

	expect(res.status).toBe(200);
	expect(revokeSpy).toHaveBeenCalledWith("sub_solo");
	expect(await orgExists()).toBe(false);
});

test("a failed revoke keeps the organization", async () => {
	polarSubscription("sub_solo");
	revokeSpy?.mockRejectedValue(new Error("polar down"));

	const res = await post("delete", ownerCookie, { organizationId: orgId });

	expect(res.status).toBe(500);
	expect(await orgExists()).toBe(true);
});
