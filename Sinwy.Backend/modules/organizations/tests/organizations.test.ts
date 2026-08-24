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

// profile/onboarding writes are gated on a paid organization
const createActiveOrg = async (name: string, cookie: string) => {
	const org = await createOrg(name, cookie);
	await setStatus(org.id, "active");
	return org;
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

const put = (path: string, body: unknown, cookie?: string) =>
	fetch(new URL(path, base), {
		method: "PUT",
		headers: {
			"content-type": "application/json",
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});

const get = (path: string, cookie?: string) =>
	fetch(new URL(path, base), { headers: cookie ? { cookie } : undefined });

type ProfileDto = {
	tagline: string | null;
	description: string | null;
	email: string | null;
	phone: string | null;
	website: string | null;
	city: string | null;
	country: string | null;
};

const emptyProfile: ProfileDto = {
	tagline: null,
	description: null,
	email: null,
	phone: null,
	website: null,
	city: null,
	country: null,
};

const joinAsMember = async (organizationId: string, userId: string) => {
	await db.insert(member).values({
		id: `member_${userId}_${organizationId}`,
		organizationId,
		userId,
		role: "member",
		createdAt: new Date(),
	});
};

test("GET onboarding: fresh organization → nothing completed, empty profile", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);

	expect(
		await unwrap<{ completedAt: string | null; profile: ProfileDto }>(
			await get(`/api/organizations/${id}/onboarding`, cookie),
		),
	).toEqual({ completedAt: null, profile: emptyProfile });
});

test("GET onboarding: non-member → 404, no session → 401", async () => {
	const owner = await createUserWithSession();
	const { id } = await createOrg("Acme", owner.cookie);
	const outsider = await createUserWithSession();

	expect(
		(await get(`/api/organizations/${id}/onboarding`, outsider.cookie)).status,
	).toBe(404);
	expect((await get(`/api/organizations/${id}/onboarding`)).status).toBe(401);
});

const validProfile = {
	tagline: "Sharp cuts, no waiting",
	description: "A barbershop in the old town.",
	email: "hi@acme.dev",
	phone: "+370 600 00000",
	website: "acme.dev",
	city: "Vilnius",
	country: "LT",
};

const saveProfile = (
	id: string,
	cookie: string,
	overrides: Record<string, unknown> = {},
) =>
	put(
		`/api/organizations/${id}/profile`,
		{ ...validProfile, ...overrides },
		cookie,
	);

test("PUT profile: saves the profile and reads back through onboarding", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	const saved = await unwrap<ProfileDto>(
		await saveProfile(id, cookie, { tagline: "  Sharp cuts, no waiting  " }),
	);

	expect(saved).toEqual({
		...validProfile,
		// a bare domain is stored as something an anchor can point at
		website: "https://acme.dev",
	});

	const onboarding = await unwrap<{ profile: ProfileDto }>(
		await get(`/api/organizations/${id}/onboarding`, cookie),
	);
	expect(onboarding.profile).toEqual(saved);
});

test("PUT profile: city and website may be left out", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	const saved = await unwrap<ProfileDto>(
		await saveProfile(id, cookie, { city: "   ", website: "   " }),
	);
	expect(saved.city).toBeNull();
	expect(saved.website).toBeNull();

	const { city: _city, website: _website, ...required } = validProfile;
	expect(
		(await put(`/api/organizations/${id}/profile`, required, cookie)).status,
	).toBe(200);
});

test("PUT profile: a second save overwrites the first", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	await saveProfile(id, cookie, { city: "Vilnius" });
	const second = await unwrap<ProfileDto>(
		await saveProfile(id, cookie, { city: "Kaunas" }),
	);

	expect(second.city).toBe("Kaunas");
});

// the form checks the same rules, so these all stand in for a bypassed form
test("PUT profile: every field except city and website is required", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	const requiredMessage = {
		tagline: /Tagline is required/,
		description: /A description is required/,
		email: /Contact email is required/,
		phone: /Phone number is required/,
		country: /Select a country/,
	} as const;

	for (const [field, message] of Object.entries(requiredMessage)) {
		for (const value of ["", "   "]) {
			const res = await saveProfile(id, cookie, { [field]: value });
			expect(res.status).toBe(400);
			// the rejection must be for this field, any 400 is not enough
			const body = (await res.json()) as ApiResponse<never>;
			expect(body.message).toMatch(message);
		}
		// JSON.stringify drops undefined keys, so this also covers omission
		for (const value of [null, undefined]) {
			const res = await saveProfile(id, cookie, { [field]: value });
			expect(res.status).toBe(400);
		}
	}
});

test("PUT profile: text fields need at least three characters", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	for (const field of ["tagline", "description"]) {
		expect((await saveProfile(id, cookie, { [field]: "ab" })).status).toBe(400);
		expect((await saveProfile(id, cookie, { [field]: "abc" })).status).toBe(
			200,
		);
	}
});

test("PUT profile: rejects text fields over their limit", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	for (const [field, max] of [
		["tagline", 120],
		["description", 600],
	] as const) {
		const res = await saveProfile(id, cookie, { [field]: "a".repeat(max + 1) });
		expect(res.status).toBe(400);
	}
});

test("PUT profile: rejects malformed emails", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	for (const email of ["not-an-email", "someone@", "@acme.dev", "a b@acme.dev"])
		expect((await saveProfile(id, cookie, { email })).status).toBe(400);

	expect((await saveProfile(id, cookie, { email: "a@b.dev" })).status).toBe(
		200,
	);
});

test("PUT profile: takes phone numbers from any country, within 7-15 digits", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	for (const phone of [
		"+370 600 00000",
		"+1 (555) 010-1234",
		"020 7946 0958",
		"+81-3-1234-5678",
	])
		expect((await saveProfile(id, cookie, { phone })).status).toBe(200);

	for (const phone of ["12345", "1234567890123456", "call me", "+++"])
		expect((await saveProfile(id, cookie, { phone })).status).toBe(400);
});

test("PUT profile: an offered website still has to be one", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	for (const website of ["acme", "not a website", "https://"])
		expect((await saveProfile(id, cookie, { website })).status).toBe(400);

	const saved = await unwrap<ProfileDto>(
		await saveProfile(id, cookie, { website: "https://acme.dev/book" }),
	);
	expect(saved.website).toBe("https://acme.dev/book");
});

test("PUT profile: country must be one we know, by code", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	// a typed country name is exactly what the select stops the form sending
	for (const country of ["Lithuania", "lt", "ZZ", "XX", "L"])
		expect((await saveProfile(id, cookie, { country })).status).toBe(400);

	for (const country of ["LT", "US", "JP"])
		expect((await saveProfile(id, cookie, { country })).status).toBe(200);
});

test("PUT profile: a rejection says which rule failed", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	const res = await saveProfile(id, cookie, { tagline: "" });
	const body = (await res.json()) as ApiResponse<never>;
	expect(body.message).toMatch(/Tagline is required/);
});

test("PUT profile: non-member → 404, plain member → 403", async () => {
	const owner = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", owner.cookie);
	const outsider = await createUserWithSession();

	expect((await saveProfile(id, outsider.cookie)).status).toBe(404);

	await joinAsMember(id, outsider.userId);
	expect((await saveProfile(id, outsider.cookie)).status).toBe(403);
});

test("POST onboarding/complete: marks the organization done, idempotently", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", cookie);

	const first = await unwrap<{ completedAt: string }>(
		await post(`/api/organizations/${id}/onboarding/complete`, {}, cookie),
	);
	expect(first.completedAt).toBeString();

	const second = await unwrap<{ completedAt: string }>(
		await post(`/api/organizations/${id}/onboarding/complete`, {}, cookie),
	);
	// the first completion is what counts, a repeat must not move it
	expect(second.completedAt).toBe(first.completedAt);

	const onboarding = await unwrap<{ completedAt: string | null }>(
		await get(`/api/organizations/${id}/onboarding`, cookie),
	);
	expect(onboarding.completedAt).toBe(first.completedAt);
});

test("POST onboarding/complete: non-member → 404, plain member → 403", async () => {
	const owner = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", owner.cookie);
	const outsider = await createUserWithSession();

	expect(
		(
			await post(
				`/api/organizations/${id}/onboarding/complete`,
				{},
				outsider.cookie,
			)
		).status,
	).toBe(404);

	await joinAsMember(id, outsider.userId);
	expect(
		(
			await post(
				`/api/organizations/${id}/onboarding/complete`,
				{},
				outsider.cookie,
			)
		).status,
	).toBe(403);
});

// pay → then onboard: the wizard never runs for an unpaid organization, so the
// API refuses too instead of leaving that ordering to the frontend guard
test("PUT profile & complete on an unpaid organization → 409", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);

	expect((await saveProfile(id, cookie)).status).toBe(409);
	expect(
		(await post(`/api/organizations/${id}/onboarding/complete`, {}, cookie))
			.status,
	).toBe(409);

	const onboarding = await unwrap<{ completedAt: string | null }>(
		await get(`/api/organizations/${id}/onboarding`, cookie),
	);
	expect(onboarding.completedAt).toBeNull();
});
