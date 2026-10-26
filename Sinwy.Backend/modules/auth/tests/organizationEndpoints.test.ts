import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { invitation, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
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
let adminCookie: string;
let staffId: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Guarded Co");
	ownerId = await activateOrganization(orgId);
	const admin = await createUserWithSession({ activeOrganizationId: orgId });
	adminCookie = admin.cookie;
	await joinOrganization(orgId, admin.userId, "admin");
	({ userId: staffId } = await createUserWithSession());
	await joinOrganization(orgId, staffId, "staff");
	await db.insert(invitation).values({
		id: "invitation_pending",
		organizationId: orgId,
		email: "invitee@test.dev",
		role: "staff",
		status: "pending",
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: new Date(),
		inviterId: ownerId,
	});
});

type Endpoint = {
	path: string;
	manages: boolean;
	query?: () => Record<string, string>;
	body?: () => unknown;
};

const scoped = () => ({ organizationId: orgId });

const endpoints: Endpoint[] = [
	{ path: "get-organization", manages: false, query: scoped },
	{ path: "get-full-organization", manages: false, query: scoped },
	{ path: "list-members", manages: false, query: scoped },
	{ path: "list-invitations", manages: false, query: scoped },
	{ path: "get-active-member", manages: false, query: () => ({}) },
	{ path: "get-active-member-role", manages: false, query: scoped },
	{
		path: "has-permission",
		manages: false,
		body: () => ({ ...scoped(), permissions: { organization: ["update"] } }),
	},
	{ path: "leave", manages: false, body: scoped },
	{
		path: "update",
		manages: true,
		body: () => ({ ...scoped(), data: { name: "Renamed" } }),
	},
	{ path: "delete", manages: true, body: scoped },
	{
		path: "invite-member",
		manages: true,
		body: () => ({ ...scoped(), email: "new@test.dev", role: "staff" }),
	},
	{
		path: "cancel-invitation",
		manages: true,
		body: () => ({ invitationId: "invitation_pending" }),
	},
	{
		path: "remove-member",
		manages: true,
		body: () => ({
			...scoped(),
			memberIdOrEmail: `member_${staffId}_${orgId}`,
		}),
	},
	{
		path: "update-member-role",
		manages: true,
		body: () => ({
			...scoped(),
			memberId: `member_${staffId}_${orgId}`,
			role: "admin",
		}),
	},
];

const call = ({ path, query, body }: Endpoint) => {
	const url = new URL(`/api/auth/organization/${path}`, base);
	for (const [key, value] of Object.entries(query?.() ?? {}))
		url.searchParams.set(key, value);
	return fetch(url, {
		method: body ? "POST" : "GET",
		headers: { "content-type": "application/json", cookie: adminCookie },
		body: body ? JSON.stringify(body()) : undefined,
	});
};

const codeOf = async (res: Response) =>
	((await res.json().catch(() => null)) as { code?: string } | null)?.code;

const nameOf = async () => {
	const [row] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId));
	return row?.name;
};

test.each(
	endpoints,
)("scheduled for deletion: $path is refused", async (endpoint) => {
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date(), slotHeldAt: null })
		.where(eq(organization.id, orgId));

	const res = await call(endpoint);

	expect(res.status).toBe(403);
	expect(await codeOf(res)).toBe(AUTH_ERROR_CODES.ORGANIZATION_INACTIVE);
	expect(await nameOf()).toBe("Guarded Co");
});

test.each(
	endpoints,
)("inactive: $path is refused only when it manages the organization", async (endpoint) => {
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	const res = await call(endpoint);

	if (endpoint.manages) {
		expect(res.status).toBe(403);
		expect(await codeOf(res)).toBe(AUTH_ERROR_CODES.ORGANIZATION_INACTIVE);
		expect(await nameOf()).toBe("Guarded Co");
	} else expect(res.status).toBe(200);
});

test("active: reads and management pass", async () => {
	const update = endpoints.find((endpoint) => endpoint.path === "update");
	if (!update) throw new Error("update endpoint missing from the table");
	for (const endpoint of [
		...endpoints.filter((endpoint) => !endpoint.manages),
		update,
	].filter((endpoint) => endpoint.path !== "leave"))
		expect({
			path: endpoint.path,
			status: (await call(endpoint)).status,
		}).toEqual({
			path: endpoint.path,
			status: 200,
		});
	expect(await nameOf()).toBe("Renamed");
});

test("a non-member gets the plugin's refusal, not the organization's status", async () => {
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));
	const outsider = await createUserWithSession();

	const res = await fetch(new URL("/api/auth/organization/update", base), {
		method: "POST",
		headers: { "content-type": "application/json", cookie: outsider.cookie },
		body: JSON.stringify({ organizationId: orgId, data: { name: "X" } }),
	});

	expect(res.ok).toBe(false);
	expect(await codeOf(res)).not.toBe(AUTH_ERROR_CODES.ORGANIZATION_INACTIVE);
	expect(await nameOf()).toBe("Guarded Co");
});
