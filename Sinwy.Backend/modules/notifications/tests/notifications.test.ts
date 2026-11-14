import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { notification } from "@db/schema/notificationSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type {
	ApiResponse,
	NotificationPageDto,
	NotificationUnreadCountDto,
	OrganizationNotificationContent,
	PersonalNotificationContent,
} from "@sinwy/shared";
import type { Server } from "bun";
import { and, eq } from "drizzle-orm";
import * as repository from "../repository";
import { registerNotificationRoutes } from "../routes";
import {
	notifyEmail,
	notifyOrganization,
	notifyUser,
	purgeOldNotifications,
} from "../service";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerNotificationRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

type Session = { userId: string; cookie: string };

let orgId: string;
let owner: Session;
let admin: Session;
let staff: Session;
let outsider: Session;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	[owner, admin, staff, outsider] = await Promise.all([
		createUserWithSession(),
		createUserWithSession(),
		createUserWithSession(),
		createUserWithSession(),
	]);
	await joinOrganization(orgId, owner.userId, "owner");
	await joinOrganization(orgId, admin.userId, "admin");
	await joinOrganization(orgId, staff.userId, "staff");
	await activateOrganization(orgId);
});

const time = {
	serviceName: "Haircut",
	startsAt: "2099-03-01T08:00:00.000Z",
	timezone: "Europe/Vilnius",
};

const newBooking: OrganizationNotificationContent = {
	type: "booking.new",
	payload: { ...time, customerName: "Bea" },
};

const paymentRecorded: OrganizationNotificationContent = {
	type: "payment.recorded",
	payload: {
		serviceName: "Haircut",
		amount: "€25.00",
		recordedByName: "Owner",
	},
};

const confirmed: PersonalNotificationContent = {
	type: "booking.confirmed",
	payload: { ...time, organizationName: "Salon" },
};

const call = async <T>(as: Session, path: string, method = "GET") => {
	const res = await fetch(new URL(path, base), {
		method,
		headers: { cookie: as.cookie },
	});
	return { status: res.status, body: (await res.json()) as ApiResponse<T> };
};

const inbox = async (as: Session, organizationId: string | null = orgId) => {
	const path = organizationId
		? `/api/organizations/${organizationId}/notifications`
		: "/api/account/notifications";
	const { body } = await call<NotificationPageDto>(as, path);
	if (!body.isSuccess) throw new Error(body.message);
	return body.data.notifications;
};

const unread = async (as: Session, organizationId: string | null = orgId) => {
	const path = organizationId
		? `/api/organizations/${organizationId}/notifications/unread-count`
		: "/api/account/notifications/unread-count";
	const { body } = await call<NotificationUnreadCountDto>(as, path);
	if (!body.isSuccess) throw new Error(body.message);
	return body.data.count;
};

const rowsOf = ({ userId }: Session) =>
	db.select().from(notification).where(eq(notification.userId, userId));

test("an organization event reaches every member whose role receives it, and only them", async () => {
	await notifyOrganization(orgId, newBooking, "/dashboard/salon/bookings/b1");
	for (const as of [owner, admin, staff]) {
		const [item] = await inbox(as);
		expect(item).toMatchObject({
			type: "booking.new",
			payload: newBooking.payload,
			link: "/dashboard/salon/bookings/b1",
			readAt: null,
		});
	}
	expect(await rowsOf(outsider)).toEqual([]);
});

test("staff get no payment notifications, and the member who recorded it gets none either", async () => {
	await notifyOrganization(orgId, paymentRecorded, null, {
		exceptUserId: owner.userId,
	});
	expect((await inbox(admin)).map((item) => item.type)).toEqual([
		"payment.recorded",
	]);
	expect(await rowsOf(owner)).toEqual([]);
	expect(await rowsOf(staff)).toEqual([]);
});

test("organization and personal inboxes never mix, and nobody sees another user's", async () => {
	await notifyOrganization(orgId, newBooking, null);
	await notifyUser(owner.userId, confirmed, "/account/bookings/b1");

	expect((await inbox(owner)).map((item) => item.type)).toEqual([
		"booking.new",
	]);
	expect((await inbox(owner, null)).map((item) => item.type)).toEqual([
		"booking.confirmed",
	]);
	expect(await unread(owner)).toBe(1);
	expect(await unread(owner, null)).toBe(1);

	expect(await inbox(admin, null)).toEqual([]);
	expect(await inbox(outsider, null)).toEqual([]);
	const { status } = await call(
		outsider,
		`/api/organizations/${orgId}/notifications`,
	);
	expect(status).toBe(404);
});

test("marking read touches only the caller's own notification", async () => {
	await notifyUser(owner.userId, confirmed, null);
	const [item] = await inbox(owner, null);
	if (!item) throw new Error("no notification");

	await call(outsider, `/api/notifications/${item.id}/read`, "POST");
	expect(await unread(owner, null)).toBe(1);

	const { status } = await call(
		owner,
		`/api/notifications/${item.id}/read`,
		"POST",
	);
	expect(status).toBe(200);
	expect(await unread(owner, null)).toBe(0);
	expect((await inbox(owner, null))[0]?.readAt).not.toBeNull();
});

test("mark all read clears one inbox and leaves the other", async () => {
	await notifyOrganization(orgId, newBooking, null);
	await notifyOrganization(orgId, newBooking, null);
	await notifyUser(owner.userId, confirmed, null);

	await call(
		owner,
		`/api/organizations/${orgId}/notifications/read-all`,
		"POST",
	);
	expect(await unread(owner)).toBe(0);
	expect(await unread(owner, null)).toBe(1);
	expect(await unread(admin)).toBe(2);

	await call(owner, "/api/account/notifications/read-all", "POST");
	expect(await unread(owner, null)).toBe(0);
});

test("leaving or being removed takes the member's organization notifications along", async () => {
	await notifyOrganization(orgId, newBooking, null);
	await notifyUser(staff.userId, confirmed, null);

	await db
		.delete(member)
		.where(
			and(eq(member.userId, staff.userId), eq(member.organizationId, orgId)),
		);
	expect((await rowsOf(staff)).map((row) => row.type)).toEqual([
		"booking.confirmed",
	]);
	expect(await rowsOf(owner)).toHaveLength(1);
});

test("deleting an organization removes its notifications, not its members' personal ones", async () => {
	await notifyOrganization(orgId, newBooking, null);
	await notifyUser(owner.userId, confirmed, null);

	await db.delete(organization).where(eq(organization.id, orgId));
	expect((await rowsOf(owner)).map((row) => row.type)).toEqual([
		"booking.confirmed",
	]);
	expect(await rowsOf(admin)).toEqual([]);
});

test("an organization scheduled for deletion shows no notifications", async () => {
	await notifyOrganization(orgId, newBooking, null);
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));
	const { status } = await call(
		owner,
		`/api/organizations/${orgId}/notifications/unread-count`,
	);
	expect(status).toBe(404);
});

test("an invitation notifies an existing account only", async () => {
	const invitation: PersonalNotificationContent = {
		type: "invitation.received",
		payload: { organizationName: "Salon", inviterName: "Owner", role: "staff" },
	};
	await notifyEmail(`${outsider.userId}@TEST.dev`, invitation, "/invite/i1");
	await notifyEmail("nobody@example.com", invitation, "/invite/i2");

	expect(await inbox(outsider, null)).toMatchObject([
		{ type: "invitation.received", link: "/invite/i1" },
	]);
	expect(await db.select().from(notification)).toHaveLength(1);
});

test("the list pages newest first", async () => {
	for (let i = 0; i < 31; i++)
		await notifyUser(owner.userId, confirmed, `/${i}`);
	const first = await call<NotificationPageDto>(
		owner,
		"/api/account/notifications",
	);
	if (!first.body.isSuccess) throw new Error(first.body.message);
	const { notifications, nextCursor } = first.body.data;
	expect(notifications).toHaveLength(30);
	expect(notifications[0]?.link).toBe("/30");
	expect(nextCursor).toBe(notifications[29]?.id ?? "");

	const second = await call<NotificationPageDto>(
		owner,
		`/api/account/notifications?before=${nextCursor}`,
	);
	if (!second.body.isSuccess) throw new Error(second.body.message);
	expect(second.body.data.notifications.map((item) => item.link)).toEqual([
		"/0",
	]);
	expect(second.body.data.nextCursor).toBeNull();

	const bad = await call(owner, "/api/account/notifications?before=nope");
	expect(bad.status).toBe(400);
});

test("a failed write is logged and never reaches the caller", async () => {
	const insert = spyOn(repository, "insertNotifications").mockRejectedValue(
		new Error("down"),
	);
	try {
		await notifyOrganization(orgId, newBooking, null);
		await notifyUser(owner.userId, confirmed, null);
		expect(insert).toHaveBeenCalledTimes(2);
	} finally {
		insert.mockRestore();
	}
});

test("notifications older than 90 days are deleted", async () => {
	await notifyUser(owner.userId, confirmed, "/old");
	await notifyUser(owner.userId, confirmed, "/new");
	const DAY = 24 * 60 * 60 * 1000;
	await db
		.update(notification)
		.set({ createdAt: new Date(Date.now() - 91 * DAY) })
		.where(eq(notification.link, "/old"));

	expect(await purgeOldNotifications()).toBe(1);
	expect((await rowsOf(owner)).map((row) => row.link)).toEqual(["/new"]);
});
