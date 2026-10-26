import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	givePlan,
	holdSlot,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type OrganizationSummary,
	PLAN_FEATURES,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
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

beforeEach(async () => {
	// cascades clean member/session rows
	await db.delete(organization);
	await db.delete(user);
});

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
	plan: string | null;
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
	await activateOrganization(org.id);
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

test("valid request → 201 with exactly { id, name, slug, status, plan, industry }", async () => {
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
		"plan",
		"slug",
		"status",
	]);
	expect(org.name).toBe("Acme Corp");
	expect(org.slug).toBe("acme-corp");
	expect(org.status).toBe("inactive");
	expect(org.plan).toBeNull();
	expect(org.industry).toBe("beauty");
});

test("a new org takes a free slot on the owner's plan; at the cap it stays a draft", async () => {
	const { userId, cookie } = await createUserWithSession();
	await givePlan(userId, "starter");

	const first = await createOrg("First", cookie);
	expect({ status: first.status, plan: first.plan }).toEqual({
		status: "active",
		plan: "starter",
	});

	const second = await createOrg("Second", cookie);
	expect({ status: second.status, plan: second.plan }).toEqual({
		status: "inactive",
		plan: null,
	});
	const list = await unwrap<OrganizationSummary[]>(
		await get("/api/organizations", cookie),
	);
	expect(list.map(({ id, draft }) => ({ id, draft }))).toEqual([
		{ id: first.id, draft: false },
		{ id: second.id, draft: true },
	]);
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

const joinAsStaff = (organizationId: string, userId: string) =>
	joinOrganization(organizationId, userId, "staff");

const joinAsAdmin = (organizationId: string, userId: string) =>
	joinOrganization(organizationId, userId, "admin");

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

test("PUT profile: non-member → 404, staff → 403", async () => {
	const owner = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", owner.cookie);
	const outsider = await createUserWithSession();

	expect((await saveProfile(id, outsider.cookie)).status).toBe(404);

	await joinAsStaff(id, outsider.userId);
	expect((await saveProfile(id, outsider.cookie)).status).toBe(403);
});

test("PUT profile: admin → 200", async () => {
	const owner = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", owner.cookie);
	const admin = await createUserWithSession();
	await joinAsAdmin(id, admin.userId);

	expect((await saveProfile(id, admin.cookie)).status).toBe(200);
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

test("POST onboarding/complete: non-member → 404, staff → 403", async () => {
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

	await joinAsStaff(id, outsider.userId);
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

test("POST onboarding/complete: admin → 200", async () => {
	const owner = await createUserWithSession();
	const { id } = await createActiveOrg("Acme", owner.cookie);
	const admin = await createUserWithSession();
	await joinAsAdmin(id, admin.userId);

	expect(
		(
			await post(
				`/api/organizations/${id}/onboarding/complete`,
				{},
				admin.cookie,
			)
		).status,
	).toBe(200);
});

const complete = (id: string, cookie: string) =>
	post(`/api/organizations/${id}/onboarding/complete`, {}, cookie);

const codeOf = async (res: Response) =>
	((await res.json()) as ApiResponse).code;

const isActive = async (id: string, cookie: string) => {
	const list = await unwrap<OrganizationSummary[]>(
		await get("/api/organizations", cookie),
	);
	return list.find((org) => org.id === id)?.status === "active";
};

// setup can start before there is a slot for it (D5)
test("draft without a plan: the profile saves, completing → 409 PLAN_REQUIRED and it stays a draft", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);

	expect((await saveProfile(id, cookie)).status).toBe(200);
	const res = await complete(id, cookie);
	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.PLAN_REQUIRED);

	const onboarding = await unwrap<{ completedAt: string | null }>(
		await get(`/api/organizations/${id}/onboarding`, cookie),
	);
	expect(onboarding.completedAt).toBeNull();
	expect(await isActive(id, cookie)).toBe(false);
});

test("draft whose owner has a free slot: completing takes it", async () => {
	const { userId, cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);
	await givePlan(userId, "starter");

	const done = await unwrap<{ completedAt: string }>(
		await complete(id, cookie),
	);
	expect(done.completedAt).toBeString();
	expect(await isActive(id, cookie)).toBe(true);
});

test("draft at the cap: completing → 409 ORGANIZATION_LIMIT_REACHED and nothing is marked done", async () => {
	const { userId, cookie } = await createUserWithSession();
	await givePlan(userId, "starter");
	await createOrg("Active", cookie);
	const { id } = await createOrg("Draft", cookie);

	const res = await complete(id, cookie);
	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.ORGANIZATION_LIMIT_REACHED);
	const onboarding = await unwrap<{ completedAt: string | null }>(
		await get(`/api/organizations/${id}/onboarding`, cookie),
	);
	expect(onboarding.completedAt).toBeNull();
});

test("inactive after finishing setup: profile and complete → 409 ORGANIZATION_INACTIVE", async () => {
	const { cookie } = await createUserWithSession();
	const { id } = await createOrg("Acme", cookie);
	await db
		.update(organization)
		.set({ onboardingCompletedAt: new Date() })
		.where(eq(organization.id, id));

	const saved = await saveProfile(id, cookie);
	expect(saved.status).toBe(409);
	expect(await codeOf(saved)).toBe(API_ERROR_CODES.ORGANIZATION_INACTIVE);
	expect((await complete(id, cookie)).status).toBe(409);
});

test("GET /api/organizations: only the caller's organizations, with their role and state", async () => {
	const { userId, cookie } = await createUserWithSession();
	const other = await createUserWithSession();
	const owned = await insertOrganization("Owned");
	const joined = await insertOrganization("Joined");
	const foreign = await insertOrganization("Foreign");
	await joinOrganization(owned, userId, "owner");
	await joinOrganization(joined, userId, "admin");
	await joinOrganization(joined, other.userId, "owner");
	await joinOrganization(foreign, other.userId, "owner");
	await activateOrganization(joined, "professional");
	await db
		.update(organization)
		.set({ createdAt: new Date("2026-02-01T00:00:00Z") })
		.where(eq(organization.id, joined));
	const scheduledAt = new Date();
	const completedAt = new Date("2026-01-01T00:00:00Z");
	await db
		.update(organization)
		.set({
			createdAt: new Date("2026-01-15T00:00:00Z"),
			deletionScheduledAt: scheduledAt,
			onboardingCompletedAt: completedAt,
		})
		.where(eq(organization.id, owned));

	const list = await unwrap<OrganizationSummary[]>(
		await get("/api/organizations", cookie),
	);

	expect(list).toEqual([
		{
			id: owned,
			name: "Owned",
			slug: owned,
			status: "inactive",
			suspended: false,
			draft: false,
			plan: null,
			features: [],
			isOwner: true,
			paymentFailed: false,
			deletesAt: new Date(
				scheduledAt.getTime() + 30 * 24 * 60 * 60 * 1000,
			).toISOString(),
			onboardingCompletedAt: completedAt.toISOString(),
		},
		{
			id: joined,
			name: "Joined",
			slug: joined,
			status: "active",
			suspended: false,
			draft: false,
			plan: "professional",
			features: PLAN_FEATURES.professional,
			isOwner: false,
			paymentFailed: false,
			deletesAt: null,
			onboardingCompletedAt: null,
		},
	]);
});

// D15: billing is the owner's; staff still get the tier's features
test("GET /api/organizations: admins see the tier name, staff only its features", async () => {
	const admin = await createUserWithSession();
	const staff = await createUserWithSession();
	const orgId = await insertOrganization("Acme");
	await activateOrganization(orgId, "professional");
	await joinAsAdmin(orgId, admin.userId);
	await joinAsStaff(orgId, staff.userId);
	const viewOf = async (cookie: string) => {
		const [org] = await unwrap<OrganizationSummary[]>(
			await get("/api/organizations", cookie),
		);
		return { plan: org?.plan, features: org?.features };
	};

	expect(await viewOf(admin.cookie)).toEqual({
		plan: "professional",
		features: PLAN_FEATURES.professional,
	});
	expect(await viewOf(staff.cookie)).toEqual({
		plan: null,
		features: PLAN_FEATURES.professional,
	});
});

test("GET /api/organizations: a past-due plan is flagged to the owner only, and the org stays active", async () => {
	const owner = await createUserWithSession();
	const admin = await createUserWithSession();
	const orgId = await insertOrganization("Acme");
	await joinOrganization(orgId, owner.userId, "owner");
	await joinAsAdmin(orgId, admin.userId);
	await givePlan(owner.userId, "professional", { status: "past_due" });
	await holdSlot(orgId);
	const viewOf = async (cookie: string) => {
		const [org] = await unwrap<OrganizationSummary[]>(
			await get("/api/organizations", cookie),
		);
		return { status: org?.status, paymentFailed: org?.paymentFailed };
	};

	expect(await viewOf(owner.cookie)).toEqual({
		status: "active",
		paymentFailed: true,
	});
	expect(await viewOf(admin.cookie)).toEqual({
		status: "active",
		paymentFailed: false,
	});
});

test("GET /api/organizations: an org holding a slot while its owner's plan is paused is suspended", async () => {
	const { userId, cookie } = await createUserWithSession();
	const suspended = await insertOrganization("Suspended");
	const lapsed = await insertOrganization("Lapsed");
	await joinOrganization(suspended, userId, "owner");
	await joinOrganization(lapsed, userId, "owner");
	await givePlan(userId, null, { status: "paused" });
	await holdSlot(suspended);

	const list = await unwrap<OrganizationSummary[]>(
		await get("/api/organizations", cookie),
	);

	expect(
		list.map(({ id, status, suspended }) => ({ id, status, suspended })),
	).toEqual([
		{ id: suspended, status: "inactive", suspended: true },
		{ id: lapsed, status: "inactive", suspended: false },
	]);
});

test("an org holding a slot is inactive while its owner's plan is paused, lapsed or missing, and active again once it grants access", async () => {
	const { userId, cookie } = await createUserWithSession();
	const orgId = await insertOrganization("Slotted");
	await joinOrganization(orgId, userId, "owner");
	await holdSlot(orgId);
	const state = async () => {
		const [org] = await unwrap<OrganizationSummary[]>(
			await get("/api/organizations", cookie),
		);
		return { status: org?.status, plan: org?.plan };
	};

	expect(await state()).toEqual({ status: "inactive", plan: null });
	await givePlan(userId, null, { status: "paused" });
	expect(await state()).toEqual({ status: "inactive", plan: null });
	await givePlan(userId, null, { status: "canceled", subscriptionId: null });
	expect(await state()).toEqual({ status: "inactive", plan: null });
	await givePlan(userId, "professional");
	expect(await state()).toEqual({ status: "active", plan: "professional" });
});

test("GET /api/organizations: no organizations → empty list, no session → 401", async () => {
	const { cookie } = await createUserWithSession();

	expect(await unwrap(await get("/api/organizations", cookie))).toEqual([]);
	expect((await get("/api/organizations")).status).toBe(401);
});
