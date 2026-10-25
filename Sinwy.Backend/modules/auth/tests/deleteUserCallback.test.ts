import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient } from "@backend/infrastructure/polar";
import { storageClient } from "@backend/infrastructure/storage";
import createApp from "@backend/lib/app";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
	polarPages,
	stubPolarCore,
} from "@backend/test/helpers";
import appConfig from "@config";
import db from "@db";
import { verification } from "@db/schema/authSchema";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerAuthRoutes } from "../routes";

let server: Server<never>;
let base: URL;
let listSpy: ReturnType<typeof spyOn>;
let revokeSpy: ReturnType<typeof spyOn>;
let polarCoreSpy: ReturnType<typeof stubPolarCore>;

/** Active subscription per user, as Polar answers the revoke lookup by customer. */
const polarSubscriptions = (byUser: Record<string, string>) => {
	listSpy.mockImplementation((params: { external_customer_id: string }) => {
		const id = byUser[params.external_customer_id];
		return polarPages(id ? [{ id, status: "active" }] : [])();
	});
};

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
	listSpy = spyOn(polarClient.subscriptions, "iterList");
	revokeSpy = spyOn(polarClient.subscriptions, "revoke");
	// the polar plugin deletes the customer, through its own client
	polarCoreSpy = stubPolarCore();
});

afterAll(() => {
	listSpy.mockRestore();
	revokeSpy.mockRestore();
	polarCoreSpy.mockRestore();
	server.stop(true);
});

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	listSpy.mockClear();
	revokeSpy.mockClear();
	polarCoreSpy.mockClear();
	polarSubscriptions({});
	revokeSpy.mockResolvedValue({} as never);
});

/** The token Better Auth would have emailed; same row `POST /delete-user` creates. */
const issueDeleteToken = async (userId: string) => {
	const token = `delete_${userId}`;
	const now = new Date();
	await db.insert(verification).values({
		id: `verification_${token}`,
		identifier: `delete-account-${token}`,
		value: userId,
		expiresAt: new Date(Date.now() + 3_600_000),
		createdAt: now,
		updatedAt: now,
	});
	return token;
};

const clickDeleteLink = (cookie: string, token: string) => {
	const url = new URL("/api/auth/delete-user/callback", base);
	url.searchParams.set("token", token);
	url.searchParams.set("callbackURL", "/auth/goodbye");
	return fetch(url, { headers: { cookie }, redirect: "manual" });
};

const userExists = async (id: string) =>
	(await db.select({ id: user.id }).from(user).where(eq(user.id, id))).length >
	0;

const deletionScheduledAt = async (id: string) => {
	const [row] = await db
		.select({ at: organization.deletionScheduledAt })
		.from(organization)
		.where(eq(organization.id, id));
	return row?.at;
};

/** The customer deletes the plugin sent, as `path?query`. */
const customerDeletes = () =>
	polarCoreSpy.mock.calls
		.map(([[url, init]]) => ({ url: new URL(url), method: init.method }))
		.filter(
			({ url, method }) =>
				method === "DELETE" && url.pathname.startsWith("/v1/customers/"),
		)
		.map(({ url }) => `${url.pathname}${url.search}`);

test("owner with two orgs: their subscription revoked once, both orgs scheduled, user gone, avatar deleted, customer anonymized", async () => {
	const { userId, cookie } = await createUserWithSession();
	const avatarKey = `avatars/${userId}/old.png`;
	await storageClient.put(avatarKey, new Uint8Array([1]), "image/png");
	await db
		.update(user)
		.set({
			image: `${new URL(appConfig.BETTER_AUTH_URL).origin}/api/files/${avatarKey}`,
		})
		.where(eq(user.id, userId));
	const orgId = await insertOrganization("Solo Co");
	const otherOrgId = await insertOrganization("Second Co");
	await joinOrganization(orgId, userId, "owner");
	await joinOrganization(otherOrgId, userId, "owner");
	polarSubscriptions({ [userId]: "sub_solo" });

	const res = await clickDeleteLink(cookie, await issueDeleteToken(userId));

	expect(res.status).toBe(302);
	expect(res.headers.get("location")).toBe("/auth/goodbye");
	expect(revokeSpy.mock.calls).toEqual([["sub_solo"]]);
	expect(await deletionScheduledAt(orgId)).toBeInstanceOf(Date);
	expect(await deletionScheduledAt(otherOrgId)).toBeInstanceOf(Date);
	expect(await userExists(userId)).toBe(false);
	expect((await storageClient.serve(avatarKey)).status).toBe(404);
	expect(customerDeletes()).toEqual([
		`/v1/customers/external/${userId}?anonymize=true`,
	]);
});

test("admin of someone else's paid org: org and its subscription untouched, Polar customer deleted", async () => {
	const { userId, cookie } = await createUserWithSession();
	const { userId: ownerId } = await createUserWithSession();
	const orgId = await insertOrganization("Employer Co");
	await joinOrganization(orgId, ownerId, "owner");
	await joinOrganization(orgId, userId, "admin");
	polarSubscriptions({ [ownerId]: "sub_employer" });

	const res = await clickDeleteLink(cookie, await issueDeleteToken(userId));

	expect(res.status).toBe(302);
	expect(await userExists(userId)).toBe(false);
	expect(await deletionScheduledAt(orgId)).toBeNull();
	expect(revokeSpy).not.toHaveBeenCalled();
	expect(customerDeletes()).toEqual([
		`/v1/customers/external/${userId}?anonymize=true`,
	]);
});

test("Polar revoke failure: redirects to the goodbye error page, schedules and deletes nothing", async () => {
	const { userId, cookie } = await createUserWithSession();
	const orgId = await insertOrganization("Stuck Co");
	await joinOrganization(orgId, userId, "owner");
	polarSubscriptions({ [userId]: "sub_stuck" });
	revokeSpy.mockRejectedValue(new Error("polar down"));

	const res = await clickDeleteLink(cookie, await issueDeleteToken(userId));

	expect(res.status).toBe(302);
	expect(res.headers.get("location")).toBe(
		new URL(
			"/auth/goodbye?error=SUBSCRIPTION_REVOKE_FAILED",
			appConfig.WEB_APP_URL,
		).toString(),
	);
	expect(await userExists(userId)).toBe(true);
	expect(await deletionScheduledAt(orgId)).toBeNull();
	expect(customerDeletes()).toEqual([]);
});
