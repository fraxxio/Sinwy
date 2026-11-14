import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { readOutboxEmails } from "@backend/infrastructure/email";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	givePlan,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { notification } from "@db/schema/notificationSchema";
import {
	invitation,
	member,
	organization,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import type { Server } from "bun";
import { and, eq, isNull } from "drizzle-orm";
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
	orgId = await insertOrganization("Seat Co");
	({ userId: ownerId, cookie: ownerCookie } = await createUserWithSession());
	await joinOrganization(orgId, ownerId, "owner");
	await activateOrganization(orgId);
});

const post = (path: string, cookie: string, body: unknown) =>
	fetch(new URL(`/api/auth/organization/${path}`, base), {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify(body),
	});

const get = (path: string, cookie: string) =>
	fetch(new URL(`/api/auth/organization/${path}`, base), {
		headers: { cookie },
	});

let addressSeq = 0;
const freshAddress = () =>
	`invitee_${Date.now()}_${++addressSeq}@test.dev`.toLowerCase();

const invite = (email: string, role: unknown = "staff", resend?: boolean) =>
	post("invite-member", ownerCookie, {
		email,
		role,
		organizationId: orgId,
		...(resend && { resend }),
	});

const pendingInvitationIds = async () =>
	(
		await db
			.select({ id: invitation.id })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, orgId),
					eq(invitation.status, "pending"),
				),
			)
	).map((row) => row.id);

const addStaff = async () => {
	const { userId, cookie } = await createUserWithSession();
	await joinOrganization(orgId, userId, "staff");
	return { userId, cookie };
};

const errorCode = async (res: Response) =>
	((await res.json()) as { code?: string }).code;

const emailsTo = async (address: string) =>
	(await readOutboxEmails()).filter((entry) => entry.email.to === address);

test("an invite sends one email to the invitee with the invite link", async () => {
	const address = freshAddress();

	const res = await invite(address, "admin");

	expect(res.status).toBe(200);
	const [id] = await pendingInvitationIds();
	const sent = await emailsTo(address);
	expect(sent).toHaveLength(1);
	expect(sent[0]?.email.html).toContain(`/invite/${id}"`);
	expect(sent[0]?.email.html).toContain("as admin");
});

test("an invite notifies an existing account in the app, until it's answered or withdrawn", async () => {
	const unreadInvitationId = async ({ userId }: { userId: string }) => {
		const rows = await db
			.select({ link: notification.link })
			.from(notification)
			.where(
				and(
					eq(notification.userId, userId),
					eq(notification.type, "invitation.received"),
					isNull(notification.readAt),
				),
			);
		return rows[0]?.link?.replace("/invite/", "") ?? null;
	};
	const answer = async (
		as: { userId: string; cookie: string },
		path: string,
	) => {
		expect((await invite(`${as.userId}@test.dev`)).status).toBe(200);
		const id = await unreadInvitationId(as);
		expect(id).not.toBeNull();
		const cookie = path === "cancel-invitation" ? ownerCookie : as.cookie;
		expect((await post(path, cookie, { invitationId: id })).status).toBe(200);
		expect(await unreadInvitationId(as)).toBeNull();
	};

	await answer(await createUserWithSession(), "reject-invitation");
	await answer(await createUserWithSession(), "cancel-invitation");
	await answer(await createUserWithSession(), "accept-invitation");
});

test("an invitation lasts 7 days", async () => {
	await invite(freshAddress());

	const [row] = await db
		.select({ expiresAt: invitation.expiresAt })
		.from(invitation);
	const days = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000;
	expect(days).toBeGreaterThan(6.99);
	expect(days).toBeLessThanOrEqual(7);
});

test("organization and inviter names arrive escaped", async () => {
	await db
		.update(organization)
		.set({ name: `<img src=x onerror="alert(1)">` })
		.where(eq(organization.id, orgId));
	await db
		.update(user)
		.set({ name: "<b>Mallory</b>" })
		.where(eq(user.id, ownerId));
	const address = freshAddress();

	await invite(address);

	const [sent] = await emailsTo(address);
	expect(sent?.email.html).not.toContain("<img");
	expect(sent?.email.html).not.toContain("<b>");
	expect(sent?.email.html).toContain("&lt;img src=x");
	expect(sent?.email.html).toContain("&lt;b&gt;Mallory&lt;/b&gt;");
});

test("a Starter org seats 3: owner plus two invites, the third is refused", async () => {
	expect((await invite(freshAddress())).status).toBe(200);
	expect((await invite(freshAddress())).status).toBe(200);

	const address = freshAddress();
	const res = await invite(address);

	expect(res.status).toBe(403);
	expect(await errorCode(res)).toBe(AUTH_ERROR_CODES.SEAT_LIMIT_REACHED);
	expect(await pendingInvitationIds()).toHaveLength(2);
	expect(await emailsTo(address)).toEqual([]);
});

test("members count toward the seats", async () => {
	await addStaff();
	await addStaff();

	expect((await invite(freshAddress())).status).toBe(403);
});

test("an expired pending invite frees its seat", async () => {
	await invite(freshAddress());
	await invite(freshAddress());
	const [expiredId] = await pendingInvitationIds();
	await db
		.update(invitation)
		.set({ expiresAt: new Date(Date.now() - 1000) })
		.where(eq(invitation.id, expiredId as string));

	expect((await invite(freshAddress())).status).toBe(200);
});

test("cancelling an invite frees its seat", async () => {
	await invite(freshAddress());
	await invite(freshAddress());
	const [canceledId] = await pendingInvitationIds();

	const canceled = await post("cancel-invitation", ownerCookie, {
		invitationId: canceledId,
	});

	expect(canceled.status).toBe(200);
	expect((await invite(freshAddress())).status).toBe(200);
});

test("resending at the cap extends the same invite and sends it again", async () => {
	const address = freshAddress();
	await invite(address);
	await invite(freshAddress());
	const [before] = await db
		.select({ id: invitation.id, expiresAt: invitation.expiresAt })
		.from(invitation)
		.where(eq(invitation.email, address));
	await db
		.update(invitation)
		.set({ expiresAt: new Date(Date.now() + 60_000) })
		.where(eq(invitation.id, before?.id as string));

	const res = await invite(address, "staff", true);

	expect(res.status).toBe(200);
	const after = await db
		.select({ id: invitation.id, expiresAt: invitation.expiresAt })
		.from(invitation)
		.where(eq(invitation.email, address));
	expect(after).toHaveLength(1);
	expect(after[0]?.id).toBe(before?.id as string);
	expect(after[0]?.expiresAt.getTime()).toBeGreaterThan(
		Date.now() + 86_400_000,
	);
	expect(await emailsTo(address)).toHaveLength(2);
	expect(await pendingInvitationIds()).toHaveLength(2);
});

test("over the cap after a downgrade, members keep access and new invites stop", async () => {
	await givePlan(ownerId, "professional");
	const staff = await Promise.all([addStaff(), addStaff(), addStaff()]);
	await givePlan(ownerId, "starter");

	for (const { cookie } of staff) {
		const res = await get(
			`get-full-organization?organizationId=${orgId}`,
			cookie,
		);
		expect(res.status).toBe(200);
	}
	const res = await invite(freshAddress());
	expect(res.status).toBe(403);
	expect(await errorCode(res)).toBe(AUTH_ERROR_CODES.SEAT_LIMIT_REACHED);
	expect(await db.$count(member, eq(member.organizationId, orgId))).toBe(4);
});

test("an inactive org takes no invites", async () => {
	await givePlan(ownerId, null);

	expect((await invite(freshAddress())).status).toBe(403);
	expect(await pendingInvitationIds()).toEqual([]);
});

test("invites are only for admin or staff", async () => {
	for (const role of ["member", "owner", "admin,staff", ["admin", "staff"]]) {
		const res = await invite(freshAddress(), role);
		expect([400, 403]).toContain(res.status);
	}
	expect(await pendingInvitationIds()).toEqual([]);

	expect((await invite(freshAddress(), "admin")).status).toBe(200);
});

test("role changes are only to admin or staff", async () => {
	const { userId } = await addStaff();
	const memberId = `member_${userId}_${orgId}`;

	for (const role of ["member", "owner", "admin,staff", ["admin", "staff"]]) {
		const res = await post("update-member-role", ownerCookie, {
			memberId,
			role,
			organizationId: orgId,
		});
		expect([400, 403]).toContain(res.status);
	}
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(eq(member.userId, userId));
	expect(row?.role).toBe("staff");

	const res = await post("update-member-role", ownerCookie, {
		memberId,
		role: "admin",
		organizationId: orgId,
	});
	expect(res.status).toBe(200);
});

test("accepting stops at the seat cap even when the invite got through", async () => {
	const invitee = await createUserWithSession();
	await db.insert(invitation).values({
		id: "invitation_over_cap",
		organizationId: orgId,
		email: `${invitee.userId}@test.dev`,
		role: "staff",
		status: "pending",
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: new Date(),
		inviterId: ownerId,
	});
	await addStaff();
	await addStaff();

	const res = await post("accept-invitation", invitee.cookie, {
		invitationId: "invitation_over_cap",
	});

	expect(res.status).toBe(403);
	expect(await errorCode(res)).toBe("ORGANIZATION_MEMBERSHIP_LIMIT_REACHED");
});

test("invites sent at the same moment can't pass the seat cap", async () => {
	const addresses = Array.from({ length: 6 }, freshAddress);

	const responses = await Promise.all(
		addresses.map((address) => invite(address)),
	);

	const refused = responses.filter((res) => res.status !== 200);
	expect(refused.length).toBeGreaterThanOrEqual(4);
	for (const res of refused)
		expect(await errorCode(res)).toBe(AUTH_ERROR_CODES.SEAT_LIMIT_REACHED);
	expect((await pendingInvitationIds()).length).toBeLessThanOrEqual(2);
});

type FullOrganization = {
	id: string;
	members: unknown[];
	invitations: unknown[];
};

test("staff can't read the invitations or the member list", async () => {
	await invite(freshAddress());
	const staff = await addStaff();

	for (const path of ["list-invitations", "list-members"]) {
		const res = await get(`${path}?organizationId=${orgId}`, staff.cookie);
		expect(res.status).toBe(403);
	}
	const full = await get(
		`get-full-organization?organizationId=${orgId}`,
		staff.cookie,
	);
	expect(full.status).toBe(200);
	const body = (await full.json()) as FullOrganization;
	expect(body.id).toBe(orgId);
	expect(body.members).toEqual([]);
	expect(body.invitations).toEqual([]);
});

test("an admin reads the invitations and the member list", async () => {
	await invite(freshAddress());
	const admin = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");

	for (const path of ["list-invitations", "list-members"]) {
		const res = await get(`${path}?organizationId=${orgId}`, admin.cookie);
		expect(res.status).toBe(200);
	}
	const full = await get(
		`get-full-organization?organizationId=${orgId}`,
		admin.cookie,
	);
	const body = (await full.json()) as FullOrganization;
	expect(body.members).toHaveLength(2);
	expect(body.invitations).toHaveLength(1);
});
