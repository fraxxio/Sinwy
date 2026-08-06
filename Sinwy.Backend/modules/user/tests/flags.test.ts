import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import db from "@db";
import { session } from "@db/schema/authSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { ApiResponse, PostLoginFlags } from "@sinwy/shared";
import type { Server } from "bun";
import { registerUserRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerUserRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

beforeEach(async () => {
	// cascades clean member/session rows
	await db.delete(organization);
	await db.delete(user);
});

// Mirrors better-call's signCookieValue; see organizations.test.ts for why
// sessions are forged rather than created through better-auth.
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
	const id = `user_flags_${++seq}`;
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

const createOrg = async (
	userId: string,
	{
		status,
		role = "owner",
		createdAt = new Date(),
	}: { status: "active" | "inactive"; role?: string; createdAt?: Date },
) => {
	const id = `org_flags_${++seq}`;
	await db.insert(organization).values({
		id,
		name: id,
		slug: id,
		status,
		createdAt,
	});
	await db.insert(member).values({
		id: `member_${id}`,
		organizationId: id,
		userId,
		role,
		createdAt,
	});
	return id;
};

const getFlags = async (cookie: string) => {
	const res = await fetch(new URL("/api/user/flags", base), {
		headers: { cookie },
	});
	const body = (await res.json()) as ApiResponse<PostLoginFlags>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

test("no session → 401", async () => {
	const res = await fetch(new URL("/api/user/flags", base));
	expect(res.status).toBe(401);
});

test("user with no organizations → no flags raised", async () => {
	const { cookie } = await createUserWithSession();
	expect(await getFlags(cookie)).toEqual({ unfinishedOnboarding: null });
});

test("owner of an inactive organization → resume at select-plan", async () => {
	const { userId, cookie } = await createUserWithSession();
	const orgId = await createOrg(userId, { status: "inactive" });
	expect(await getFlags(cookie)).toEqual({
		unfinishedOnboarding: { step: "select-plan", organizationId: orgId },
	});
});

test("owner of an active organization → no flags raised", async () => {
	const { userId, cookie } = await createUserWithSession();
	await createOrg(userId, { status: "active" });
	expect(await getFlags(cookie)).toEqual({ unfinishedOnboarding: null });
});

test("active org alongside an unpaid one → still surfaces the unpaid one", async () => {
	const { userId, cookie } = await createUserWithSession();
	await createOrg(userId, { status: "active" });
	const unpaid = await createOrg(userId, { status: "inactive" });
	expect(await getFlags(cookie)).toEqual({
		unfinishedOnboarding: { step: "select-plan", organizationId: unpaid },
	});
});

test("several unpaid organizations → resumes the oldest", async () => {
	const { userId, cookie } = await createUserWithSession();
	const oldest = await createOrg(userId, {
		status: "inactive",
		createdAt: new Date("2020-01-01"),
	});
	await createOrg(userId, {
		status: "inactive",
		createdAt: new Date("2020-06-01"),
	});
	expect(await getFlags(cookie)).toEqual({
		unfinishedOnboarding: { step: "select-plan", organizationId: oldest },
	});
});

test("non-owner member of an inactive org → not prompted to pay", async () => {
	const { userId, cookie } = await createUserWithSession();
	await createOrg(userId, { status: "inactive", role: "member" });
	expect(await getFlags(cookie)).toEqual({ unfinishedOnboarding: null });
});

test("another user's unpaid organization → not leaked", async () => {
	const owner = await createUserWithSession();
	await createOrg(owner.userId, { status: "inactive" });
	const outsider = await createUserWithSession();
	expect(await getFlags(outsider.cookie)).toEqual({
		unfinishedOnboarding: null,
	});
});
