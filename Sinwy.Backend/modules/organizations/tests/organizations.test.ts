import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import db from "@db";
import { session } from "@db/schema/authSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { ApiResponse } from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { setStatus } from "../repository";
import { registerOrganizationRoutes } from "../routes";

// The status endpoint falls back to Polar for inactive orgs; stub that reach so
// these tests stay offline, and so calls can be counted.
let reconcileResult: "active" | "inactive" = "inactive";
let reconcileCalls = 0;

mock.module("../reconcileStatus", () => ({
	reconcileInactiveStatus: async (organizationId: string) => {
		reconcileCalls++;
		if (reconcileResult === "active") await setStatus(organizationId, "active");
		return reconcileResult;
	},
}));

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

beforeEach(async () => {
	// cascades clean member/session rows
	await db.delete(organization);
	await db.delete(user);
	reconcileResult = "inactive";
	reconcileCalls = 0;
});

// Mirrors better-call's signCookieValue: `${token}.${base64(HMAC-SHA256(token, secret))}`.
// Forged instead of signing up through better-auth because createCustomerOnSignUp
// would call the Polar API, which placeholder credentials can't reach.
const cookieName = appConfig.BETTER_AUTH_URL.startsWith("https")
	? "__Secure-better-auth.session_token"
	: "better-auth.session_token";

const sessionCookie = async (token: string) => {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(appConfig.BETTER_AUTH_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = btoa(
		String.fromCharCode(
			...new Uint8Array(
				await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)),
			),
		),
	);
	return `${cookieName}=${encodeURIComponent(`${token}.${sig}`)}`;
};

let seq = 0;

const createUserWithSession = async () => {
	const id = `user_test_${++seq}`;
	const token = `token_${id}`;
	const now = new Date();
	await db.insert(user).values({
		id,
		name: "Test User",
		email: `${id}@test.dev`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(session).values({
		id: `session_${id}`,
		token,
		userId: id,
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: now,
		updatedAt: now,
	});
	return { userId: id, cookie: await sessionCookie(token) };
};

const post = (path: string, body: unknown, cookie?: string) =>
	fetch(new URL(path, base), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});

type OrgDto = {
	id: string;
	name: string;
	slug: string;
	status: string;
	industry: string;
};

const unwrap = async <T>(res: Response) => {
	const body = (await res.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

const createOrg = async (name: string, cookie: string) => {
	const res = await post("/api/organizations", { name }, cookie);
	return unwrap<OrgDto>(res);
};

test("POST /api/organizations without session → 401", async () => {
	const res = await post("/api/organizations", { name: "Acme" });
	expect(res.status).toBe(401);
});

test("invalid body → 400", async () => {
	const { cookie } = await createUserWithSession();
	for (const body of [
		{},
		{ name: "" },
		{ name: "  " },
		{ name: "a".repeat(101) },
		{ name: "Acme", industry: "" },
		{ name: "Acme", industry: "astrology" },
	]) {
		const res = await post("/api/organizations", body, cookie);
		expect(res.status).toBe(400);
	}
});

test("valid request → 201 with exactly { id, name, slug, status, industry }", async () => {
	const { cookie } = await createUserWithSession();
	const res = await post(
		"/api/organizations",
		{ name: "Acme Corp", industry: "beauty" },
		cookie,
	);
	expect(res.status).toBe(201);
	const org = await unwrap<OrgDto>(res);
	expect(Object.keys(org).sort()).toEqual([
		"id",
		"industry",
		"name",
		"slug",
		"status",
	]);
	expect(org.name).toBe("Acme Corp");
	expect(org.slug).toBe("acme-corp");
	expect(org.status).toBe("inactive");
	expect(org.industry).toBe("beauty");
});

test("industry is persisted", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await unwrap<OrgDto>(
		await post(
			"/api/organizations",
			{ name: "Bright Smile", industry: "healthcare" },
			cookie,
		),
	);
	const [row] = await db
		.select({ industry: organization.industry })
		.from(organization)
		.where(eq(organization.id, id));
	expect(row?.industry).toBe("healthcare");
});

test("omitted industry → 'other', never null", async () => {
	const { cookie } = await createUserWithSession();
	const org = await createOrg("Acme", cookie);
	expect(org.industry).toBe("other");
	const [row] = await db
		.select({ industry: organization.industry })
		.from(organization)
		.where(eq(organization.id, org.id));
	expect(row?.industry).toBe("other");
});

test("creator has an owner membership row", async () => {
	const { userId, cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);
	const members = await db
		.select()
		.from(member)
		.where(eq(member.organizationId, id));
	expect(members).toHaveLength(1);
	expect(members[0]?.userId).toBe(userId);
	expect(members[0]?.role).toBe("owner");
});

test("two orgs with the same name → distinct slugs", async () => {
	const { cookie } = await createUserWithSession();
	const first = await createOrg("Acme", cookie);
	const second = await createOrg("Acme", cookie);
	expect(first.slug).toBe("acme");
	expect(second.slug).toMatch(/^acme-[a-z0-9]{6}$/);
	expect(second.slug).not.toBe(first.slug);
});

test("built-in organization.create endpoint → rejected", async () => {
	const { cookie } = await createUserWithSession();
	const res = await post(
		"/api/auth/organization/create",
		{ name: "Bypass", slug: "bypass" },
		cookie,
	);
	// regression guard for allowUserToCreateOrganization: false
	expect(res.status).toBe(403);
});

test("GET status: member → { status }", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);
	const res = await fetch(new URL(`/api/organizations/${id}/status`, base), {
		headers: { cookie },
	});
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		isSuccess: true,
		data: { status: "inactive" },
		message: null,
		code: 0,
	});
});

test("GET status: non-member → 404", async () => {
	const owner = await createUserWithSession();
	const { id } = await createOrg("Acme", owner.cookie);
	const outsider = await createUserWithSession();
	const res = await fetch(new URL(`/api/organizations/${id}/status`, base), {
		headers: { cookie: outsider.cookie },
	});
	expect(res.status).toBe(404);
});

test("GET status: no session → 401", async () => {
	const res = await fetch(new URL("/api/organizations/some-id/status", base));
	expect(res.status).toBe(401);
});

const getStatus = async (id: string, cookie: string) => {
	const res = await fetch(new URL(`/api/organizations/${id}/status`, base), {
		headers: { cookie },
	});
	return unwrap<{ status: string }>(res);
};

const storedStatus = async (id: string) => {
	const [row] = await db
		.select({ status: organization.status })
		.from(organization)
		.where(eq(organization.id, id));
	return row?.status;
};

test("GET status: inactive org with an active Polar subscription → active", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);
	reconcileResult = "active";

	expect(await getStatus(id, cookie)).toEqual({ status: "active" });
	// self-healed, so the next read no longer needs Polar
	expect(await storedStatus(id)).toBe("active");
});

test("GET status: inactive org with no Polar subscription → stays inactive", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);

	expect(await getStatus(id, cookie)).toEqual({ status: "inactive" });
	expect(reconcileCalls).toBe(1);
	expect(await storedStatus(id)).toBe("inactive");
});

test("GET status: already-active org never reaches for Polar", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);
	await setStatus(id, "active");

	expect(await getStatus(id, cookie)).toEqual({ status: "active" });
	expect(reconcileCalls).toBe(0);
});

test("GET status: non-member of an inactive org → 404 without touching Polar", async () => {
	const owner = await createUserWithSession();
	const { id } = await createOrg("Acme", owner.cookie);
	const outsider = await createUserWithSession();
	reconcileResult = "active";

	const res = await fetch(new URL(`/api/organizations/${id}/status`, base), {
		headers: { cookie: outsider.cookie },
	});
	expect(res.status).toBe(404);
	expect(reconcileCalls).toBe(0);
});

test("setStatus: unknown organization id → false", async () => {
	expect(await setStatus("org_does_not_exist", "active")).toBe(false);
});
