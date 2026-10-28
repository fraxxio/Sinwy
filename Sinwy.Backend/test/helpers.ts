import { spyOn } from "bun:test";
import { polarCore } from "@backend/infrastructure/polar";
import type { IReqContext } from "@backend/lib/app/types";
import type { ReqContextValues } from "@backend/lib/sharedTypes";
import appConfig from "@config";
import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { account, session } from "@db/schema/authSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { user, userSubscription } from "@db/schema/userSchema";
import type { PlanSlug } from "@sinwy/shared";
import { and, eq } from "drizzle-orm";

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

type PlanSeed = {
	subscriptionId?: string | null;
	status?: string;
	subscriptionStatusAt?: Date;
	trialUsedAt?: Date | null;
};

/**
 * The row the webhook projection leaves for a user's subscription: `plan`
 * only while it grants access. Older than any event a test sends, unless
 * `subscriptionStatusAt` says otherwise.
 */
export const givePlan = async (
	userId: string,
	plan: PlanSlug | null = "starter",
	{
		subscriptionId = `sub_${userId}`,
		status = plan ? "active" : "canceled",
		subscriptionStatusAt = new Date("2000-01-01T00:00:00Z"),
		trialUsedAt = new Date("2000-01-01T00:00:00Z"),
	}: PlanSeed = {},
) => {
	const values = {
		subscriptionId,
		plan,
		status,
		subscriptionStatusAt,
		trialUsedAt,
	};
	await db
		.insert(userSubscription)
		.values({ userId, ...values })
		.onConflictDoUpdate({ target: userSubscription.userId, set: values });
};

export const holdSlot = (organizationId: string, heldAt = new Date()) =>
	db
		.update(organization)
		.set({ slotHeldAt: heldAt })
		.where(eq(organization.id, organizationId));

const findOwnerId = async (organizationId: string) => {
	const [owner] = await db
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(eq(member.organizationId, organizationId), memberHasRole("owner")),
		);
	return owner?.userId ?? null;
};

/**
 * An active organization: its owner on `plan`, and the organization holding
 * one of their slots. An organization without an owner gets one.
 */
export const activateOrganization = async (
	organizationId: string,
	plan: PlanSlug | null = "starter",
	subscriptionId = `sub_${organizationId}`,
) => {
	let ownerId = await findOwnerId(organizationId);
	if (!ownerId) {
		ownerId = `user_owner_${++seq}`;
		const now = new Date();
		await db.insert(user).values({
			id: ownerId,
			name: "Owner",
			email: `${ownerId}@test.dev`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
		await joinOrganization(organizationId, ownerId, "owner");
	}
	await givePlan(ownerId, plan, { subscriptionId });
	await holdSlot(organizationId);
	return ownerId;
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

/** Stands in for a Polar `iterList`: each call yields every item of every page afresh. */
export const polarPages =
	<T>(...pages: T[][]) =>
	(..._args: unknown[]): AsyncGenerator<never> =>
		(async function* () {
			for (const items of pages) yield* items as never[];
		})();

/**
 * Answers the better-auth plugin's own Polar calls offline: it syncs the
 * customer on sign-up, user update and user delete, and serves checkout and
 * the customer portal, all through `polarCore`. `responses` is keyed by
 * route, e.g. `"POST /v1/checkouts/"`; a `Response` is sent as is.
 */
export const stubPolarCore = (responses: Record<string, unknown> = {}) =>
	spyOn(polarCore, "sendRequest").mockImplementation(([url, init]) => {
		const route = `${init.method} ${new URL(url).pathname}`;
		return Promise.resolve(cannedPolarResponse(route, responses));
	});

const cannedPolarResponse = (
	route: string,
	responses: Record<string, unknown>,
) => {
	const canned = responses[route];
	if (canned instanceof Response) return canned;
	if (route in responses) return Response.json(canned);
	if (route.startsWith("DELETE ")) return new Response(null, { status: 204 });
	// no existing customer for the email, so sign-up creates one
	if (route === "GET /v1/customers/")
		return Response.json({
			items: [],
			pagination: { total_count: 0, max_page: 1 },
		});
	return Response.json({});
};

/** The JSON bodies of the stubbed core requests to `route`, oldest first. */
export const polarCoreRequests = (
	spy: ReturnType<typeof stubPolarCore>,
	route: string,
) =>
	spy.mock.calls
		.filter(
			([[url, init]]) => `${init.method} ${new URL(url).pathname}` === route,
		)
		.map(([[, init]]) =>
			typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : null,
		);
