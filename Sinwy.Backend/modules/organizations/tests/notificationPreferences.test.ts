import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import {
	memberNotificationPreference,
	organization,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type {
	ApiResponse,
	OrganizationNotificationPreferencesDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { listNotificationRecipients } from "../notificationPreferences";
import { registerOrganizationRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerOrganizationRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

type Session = { userId: string; cookie: string };

let orgId: string;
let owner: Session;
let admin: Session;
let staff: Session;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	[owner, admin, staff] = await Promise.all([
		createUserWithSession(),
		createUserWithSession(),
		createUserWithSession(),
	]);
	await joinOrganization(orgId, owner.userId, "owner");
	await joinOrganization(orgId, admin.userId, "admin");
	await joinOrganization(orgId, staff.userId, "staff");
	await activateOrganization(orgId);
});

const emailOf = ({ userId }: Session) => `${userId}@test.dev`;

const list = async (as: Session) => {
	const res = await fetch(
		new URL("/api/account/notification-preferences", base),
		{
			headers: { cookie: as.cookie },
		},
	);
	const body = (await res.json()) as ApiResponse<
		OrganizationNotificationPreferencesDto[]
	>;
	if (!body.isSuccess) throw new Error(body.message);
	return body.data;
};

const save = (as: Session, email: Record<string, boolean>, id = orgId) =>
	fetch(
		new URL(`/api/account/organizations/${id}/notification-preferences`, base),
		{
			method: "PUT",
			headers: { cookie: as.cookie, "content-type": "application/json" },
			body: JSON.stringify({ email }),
		},
	);

const storedRow = async ({ userId }: Session) => {
	const [row] = await db
		.select()
		.from(memberNotificationPreference)
		.where(
			eq(memberNotificationPreference.memberId, `member_${userId}_${orgId}`),
		);
	return row ?? null;
};

test("with no saved rows, booking events reach every member and payments reach no one", async () => {
	expect(
		(await listNotificationRecipients(orgId, "booking.new")).sort(),
	).toEqual([owner, admin, staff].map(emailOf).sort());
	expect(
		(
			await listNotificationRecipients(orgId, "booking.cancelled_by_customer")
		).sort(),
	).toEqual([owner, admin, staff].map(emailOf).sort());
	expect(await listNotificationRecipients(orgId, "payment.recorded")).toEqual(
		[],
	);
});

test("the list holds only the events the member's role receives, with defaults", async () => {
	expect(await list(owner)).toEqual([
		{
			organizationId: orgId,
			organizationName: "Salon",
			role: "owner",
			email: {
				"booking.new": true,
				"booking.cancelled_by_customer": true,
				"payment.recorded": false,
			},
		},
	]);
	expect((await list(staff))[0]?.email).toEqual({
		"booking.new": true,
		"booking.cancelled_by_customer": true,
	});
});

test("opting out stops that member's email only", async () => {
	const res = await save(admin, { "booking.new": false });
	expect(res.status).toBe(200);
	expect((await list(admin))[0]?.email).toEqual({
		"booking.new": false,
		"booking.cancelled_by_customer": true,
		"payment.recorded": false,
	});

	expect(
		(await listNotificationRecipients(orgId, "booking.new")).sort(),
	).toEqual([owner, staff].map(emailOf).sort());
	expect(
		await listNotificationRecipients(orgId, "booking.cancelled_by_customer"),
	).toContain(emailOf(admin));
	expect(await storedRow(owner)).toBeNull();
});

test("opting in to payments reaches owners and admins, except the actor", async () => {
	for (const as of [owner, admin])
		expect((await save(as, { "payment.recorded": true })).status).toBe(200);

	expect(
		(await listNotificationRecipients(orgId, "payment.recorded")).sort(),
	).toEqual([owner, admin].map(emailOf).sort());
	expect(
		await listNotificationRecipients(orgId, "payment.recorded", {
			exceptUserId: admin.userId,
		}),
	).toEqual([emailOf(owner)]);
});

test("staff can't opt in to payments, even with a forged request", async () => {
	const res = await save(staff, { "payment.recorded": true });
	expect(res.status).toBe(200);
	expect((await list(staff))[0]?.email).not.toHaveProperty("payment.recorded");
	expect(await storedRow(staff)).toBeNull();
	expect(await listNotificationRecipients(orgId, "payment.recorded")).toEqual(
		[],
	);
});

test("unknown events and malformed bodies are refused", async () => {
	expect((await save(owner, { "booking.everything": true })).status).toBe(400);
	expect(
		(
			await fetch(
				new URL(
					`/api/account/organizations/${orgId}/notification-preferences`,
					base,
				),
				{
					method: "PUT",
					headers: { cookie: owner.cookie, "content-type": "application/json" },
					body: JSON.stringify({ email: { "booking.new": "no" } }),
				},
			)
		).status,
	).toBe(400);
});

test("a user can't read or write another organization's preferences", async () => {
	const outsider = await createUserWithSession();
	expect(await list(outsider)).toEqual([]);
	expect((await save(outsider, { "booking.new": false })).status).toBe(404);

	const otherId = await insertOrganization("Other");
	expect((await save(owner, { "booking.new": false }, otherId)).status).toBe(
		404,
	);
	expect(await storedRow(owner)).toBeNull();
});

test("an organization scheduled for deletion has no preferences", async () => {
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));

	expect(await list(owner)).toEqual([]);
	expect((await save(owner, { "booking.new": false })).status).toBe(404);
});

test("removing the member removes their preferences", async () => {
	await save(admin, { "booking.new": false });
	expect(await storedRow(admin)).not.toBeNull();

	await db.delete(user).where(eq(user.id, admin.userId));
	expect(await storedRow(admin)).toBeNull();
});

test("signed out, both routes are 401", async () => {
	const res = await fetch(
		new URL("/api/account/notification-preferences", base),
	);
	expect(res.status).toBe(401);
	expect(
		(
			await fetch(
				new URL(
					`/api/account/organizations/${orgId}/notification-preferences`,
					base,
				),
				{ method: "PUT", body: "{}" },
			)
		).status,
	).toBe(401);
});
