import type { IReqContext } from "@backend/lib/app/types";
import type { ReqContextValues } from "@backend/lib/sharedTypes";
import appConfig from "@config";
import db from "@db";
import { account, session } from "@db/schema/authSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";

// Mirrors better-call's signCookieValue: `${token}.${base64(HMAC-SHA256(token, secret))}`.
// Forged instead of signing up through better-auth because createCustomerOnSignUp
// would call the Polar API, which placeholder credentials can't reach.
const cookieName = appConfig.BETTER_AUTH_URL.startsWith("https")
	? "__Secure-better-auth.session_token"
	: "better-auth.session_token";

export const sessionCookie = async (token: string) => {
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

type AccountSeed = { providerId: "credential" | "google"; password?: string };

export const createUserWithSession = async (
	options: { activeOrganizationId?: string; accounts?: AccountSeed[] } = {},
) => {
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
		activeOrganizationId: options.activeOrganizationId ?? null,
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: now,
		updatedAt: now,
	});
	for (const seed of options.accounts ?? []) {
		await db.insert(account).values({
			id: `account_${id}_${seed.providerId}`,
			accountId: id,
			providerId: seed.providerId,
			userId: id,
			password: seed.password ?? null,
			createdAt: now,
			updatedAt: now,
		});
	}
	return { userId: id, cookie: await sessionCookie(token) };
};

/** Inserts an organization row directly, bypassing the create endpoint. */
export const insertOrganization = async (name: string) => {
	const id = `org_test_${++seq}`;
	await db.insert(organization).values({
		id,
		name,
		slug: id,
		createdAt: new Date(),
	});
	return id;
};

/** `role` is the raw column value, so tests can also seed legacy or combined roles. */
export const joinOrganization = async (
	organizationId: string,
	userId: string,
	role: string,
) => {
	await db.insert(member).values({
		id: `member_${userId}_${organizationId}`,
		organizationId,
		userId,
		role,
		createdAt: new Date(),
	});
};

export const fakeCtx = (
	options: { params?: Record<string, string>; cookie?: string } = {},
): IReqContext => {
	const store: Partial<ReqContextValues> = {};
	const req = Object.assign(
		new Request("http://localhost/", {
			headers: options.cookie ? { cookie: options.cookie } : {},
		}),
		{ params: options.params ?? {} },
	);
	return {
		req: req as IReqContext["req"],
		set: (key, value) => {
			store[key] = value;
		},
		get: (key) => store[key],
	};
};
