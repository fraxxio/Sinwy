import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	spyOn,
	test,
} from "bun:test";
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
	invitation,
	organization,
	organizationActivity,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { registerPageRoutes } from "@pagesModule";
import { registerServiceRoutes } from "@servicesModule";
import {
	ACTIVITY_PAGE_SIZE,
	type ActivityEvent,
	type ApiResponse,
	type OrganizationActivityPageDto,
} from "@sinwy/shared";
import { registerTransferRoutes } from "@transfersModule";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { purgeOldActivity, recordActivity } from "../activity";
import * as repository from "../repository";
import { registerOrganizationRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerOrganizationRoutes(app);
	registerPageRoutes(app);
	registerServiceRoutes(app);
	registerTransferRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

const named = async (name: string) => {
	const created = await createUserWithSession();
	await db.update(user).set({ name }).where(eq(user.id, created.userId));
	return created;
};

let orgId: string;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	owner = await named("Olive Owner");
	staff = await named("Sam Staff");
	await joinOrganization(orgId, owner.userId, "owner");
	await joinOrganization(orgId, staff.userId, "staff");
	await activateOrganization(orgId);
});

afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});
const spies: { mockRestore: () => void }[] = [];

const call = (method: string, path: string, cookie: string, body?: unknown) =>
	fetch(new URL(path, base), {
		method,
		headers: { "content-type": "application/json", cookie },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

const org = (path: string) => `/api/organizations/${orgId}/${path}`;
const auth = (path: string) => `/api/auth/organization/${path}`;

const data = async <T>(res: Response) =>
	((await res.json()) as ApiResponse<T>).data as T;

const listActivity = async (cookie = owner.cookie, before?: string) => {
	const res = await call(
		"GET",
		org(`activity${before ? `?before=${encodeURIComponent(before)}` : ""}`),
		cookie,
	);
	expect(res.status).toBe(200);
	return data<OrganizationActivityPageDto>(res);
};

const entriesOf = async (cookie?: string) =>
	(await listActivity(cookie)).entries.map(({ action, details, actor }) => ({
		action,
		details,
		actor: actor?.name ?? null,
	}));

test("team, page, service and transfer actions each record one entry naming the actor, newest first", async () => {
	expect(
		(
			await call("POST", auth("update-member-role"), owner.cookie, {
				memberId: `member_${staff.userId}_${orgId}`,
				role: "admin",
				organizationId: orgId,
			})
		).status,
	).toBe(200);

	const invite = await call("POST", auth("invite-member"), owner.cookie, {
		email: "new@test.dev",
		role: "staff",
		organizationId: orgId,
	});
	expect(invite.status).toBe(200);
	const { id: invitationId } = (await invite.json()) as { id: string };
	expect(
		(
			await call("POST", auth("cancel-invitation"), owner.cookie, {
				invitationId,
			})
		).status,
	).toBe(200);

	const page = await call("POST", org("pages"), owner.cookie, {
		templateId: "blank",
		title: "About us",
		slug: "about-us",
	});
	const { id: pageId } = await data<{ id: string }>(page);
	expect(
		(await call("POST", org(`pages/${pageId}/publish`), owner.cookie)).status,
	).toBe(200);

	const service = await call("POST", org("services"), owner.cookie, {
		name: "Haircut",
		durationMinutes: 30,
		priceMinor: 2500,
	});
	const { id: serviceId } = await data<{ id: string }>(service);
	await call("PATCH", org(`services/${serviceId}`), owner.cookie, {
		priceMinor: 3000,
	});
	await call("PATCH", org(`services/${serviceId}`), owner.cookie, {
		name: "Cut",
	});
	expect(
		(await call("DELETE", org(`services/${serviceId}`), owner.cookie)).status,
	).toBe(200);

	expect(
		(
			await call("POST", org("transfer"), owner.cookie, {
				userId: staff.userId,
			})
		).status,
	).toBe(201);

	const expected: ActivityEvent[] = [
		{
			action: "member.role_changed",
			details: { memberName: "Sam Staff", role: "admin" },
		},
		{ action: "member.invited", details: { role: "staff" } },
		{ action: "invitation.revoked", details: { role: "staff" } },
		{ action: "page.published", details: { title: "About us" } },
		{ action: "service.created", details: { name: "Haircut" } },
		{
			action: "service.price_changed",
			details: {
				name: "Haircut",
				fromMinor: 2500,
				toMinor: 3000,
				currency: "EUR",
			},
		},
		{ action: "service.archived", details: { name: "Cut" } },
		{
			action: "transfer.offered",
			details: { recipientName: "Sam Staff" },
		},
	];
	const entries = await entriesOf();
	expect(entries).toEqual(
		expected.map((entry) => ({ ...entry, actor: "Olive Owner" })).reverse(),
	);
	// the invited email is a contact detail, so it stays out of the log
	expect(JSON.stringify(entries)).not.toContain("new@test.dev");

	// the staff member is an admin now, and sees the same list
	expect(await entriesOf(staff.cookie)).toEqual(entries);
});

test("a refused better-auth call records nothing", async () => {
	const res = await call("POST", auth("update-member-role"), owner.cookie, {
		memberId: `member_${staff.userId}_${orgId}`,
		role: "owner",
		organizationId: orgId,
	});
	expect(res.status).toBe(403);
	expect(await db.select().from(organizationActivity)).toEqual([]);
});

test("removing a member and leaving are recorded; joining names the new member", async () => {
	const other = await named("Ada Admin");
	await joinOrganization(orgId, other.userId, "admin");

	await call("POST", auth("remove-member"), owner.cookie, {
		memberIdOrEmail: `member_${staff.userId}_${orgId}`,
		organizationId: orgId,
	});
	await call("POST", auth("leave"), other.cookie, { organizationId: orgId });

	const invitee = await named("Ian Invitee");
	const [row] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, invitee.userId));
	await db.insert(invitation).values({
		id: "inv_join",
		organizationId: orgId,
		email: row?.email ?? "",
		role: "staff",
		status: "pending",
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: new Date(),
		inviterId: owner.userId,
	});
	expect(
		(
			await call("POST", auth("accept-invitation"), invitee.cookie, {
				invitationId: "inv_join",
			})
		).status,
	).toBe(200);

	expect(await entriesOf()).toEqual([
		{
			action: "member.joined",
			details: { role: "staff" },
			actor: "Ian Invitee",
		},
		{ action: "member.left", details: {}, actor: "Ada Admin" },
		{
			action: "member.removed",
			details: { memberName: "Sam Staff" },
			actor: "Olive Owner",
		},
	]);
});

test("a failed activity write doesn't fail the action", async () => {
	spies.push(
		spyOn(repository, "insertActivity").mockRejectedValue(new Error("down")),
	);
	const res = await call(
		"POST",
		`/api/account/organizations/${orgId}/deactivate`,
		owner.cookie,
	);
	expect(res.status).toBe(200);
	expect(await db.select().from(organizationActivity)).toEqual([]);
});

test("a failed name lookup doesn't fail a team change", async () => {
	spies.push(
		spyOn(repository, "findUserName").mockRejectedValue(new Error("down")),
	);
	const res = await call("POST", auth("update-member-role"), owner.cookie, {
		memberId: `member_${staff.userId}_${orgId}`,
		role: "admin",
		organizationId: orgId,
	});
	expect(res.status).toBe(200);
	expect(await db.select().from(organizationActivity)).toEqual([]);
});

test("activating and deactivating are recorded only when the slot changes", async () => {
	const path = (action: string) =>
		`/api/account/organizations/${orgId}/${action}`;
	await call("POST", path("deactivate"), owner.cookie);
	await call("POST", path("deactivate"), owner.cookie);
	await call("POST", path("activate"), owner.cookie);
	await call("POST", path("activate"), owner.cookie);

	expect((await entriesOf()).map(({ action }) => action)).toEqual([
		"organization.activated",
		"organization.deactivated",
	]);
});

test("staff get 403, and another organization's entries never show", async () => {
	expect((await call("GET", org("activity"), staff.cookie)).status).toBe(403);

	const otherOrg = await insertOrganization("Other");
	await recordActivity(otherOrg, null, {
		action: "organization.activated",
		details: {},
	});
	expect((await listActivity()).entries).toEqual([]);

	// a member of the other organization can't read this one's either
	const outsider = await createUserWithSession();
	await joinOrganization(otherOrg, outsider.userId, "owner");
	expect((await call("GET", org("activity"), outsider.cookie)).status).toBe(
		404,
	);
});

test("the actor's name survives their account deletion; Sinwy's own actions have no actor", async () => {
	await recordActivity(
		orgId,
		{ id: staff.userId, name: "Sam Staff" },
		{ action: "page.deleted", details: { title: "Old" } },
	);
	await recordActivity(orgId, null, {
		action: "transfer.completed",
		details: { fromName: "Olive Owner", toName: "Sam Staff" },
	});
	await db.delete(user).where(eq(user.id, staff.userId));

	const { entries } = await listActivity();
	expect(entries.map(({ actor }) => actor)).toEqual([
		null,
		{ name: "Sam Staff", image: null },
	]);
});

test("pages of 50 follow the cursor, and a bad cursor is refused", async () => {
	const start = Date.now();
	await db.insert(organizationActivity).values(
		Array.from({ length: ACTIVITY_PAGE_SIZE + 1 }, (_, index) => ({
			id: `act_${String(index).padStart(3, "0")}`,
			organizationId: orgId,
			actorName: "Olive Owner",
			action: "organization.activated" as const,
			details: {},
			// two entries share each moment, so the id breaks the tie
			occurredAt: new Date(start - Math.floor(index / 2) * 1000),
		})),
	);

	const first = await listActivity();
	expect(first.entries).toHaveLength(ACTIVITY_PAGE_SIZE);
	expect(first.nextCursor).not.toBeNull();
	const second = await listActivity(owner.cookie, first.nextCursor ?? "");
	expect(second.entries).toHaveLength(1);
	expect(second.nextCursor).toBeNull();

	const seen = [...first.entries, ...second.entries].map(({ id }) => id);
	expect(new Set(seen).size).toBe(ACTIVITY_PAGE_SIZE + 1);

	expect(
		(await call("GET", org("activity?before=nonsense"), owner.cookie)).status,
	).toBe(400);
});

test("entries older than 90 days are deleted", async () => {
	const now = new Date("2026-11-14T12:00:00Z");
	const day = 24 * 60 * 60 * 1000;
	for (const [id, age] of [
		["old", 91 * day],
		["recent", 89 * day],
	] as const)
		await db.insert(organizationActivity).values({
			id,
			organizationId: orgId,
			actorName: null,
			action: "organization.activated",
			details: {},
			occurredAt: new Date(now.getTime() - age),
		});

	expect(await purgeOldActivity(now)).toBe(1);
	expect(
		(
			await db
				.select({ id: organizationActivity.id })
				.from(organizationActivity)
		).map(({ id }) => id),
	).toEqual(["recent"]);
});
