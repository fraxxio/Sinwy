import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { storageClient } from "@backend/infrastructure/storage";
import createApp from "@backend/lib/app";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import appConfig from "@config";
import db from "@db";
import { verification } from "@db/schema/authSchema";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { polarClient } from "../polarClient";
import { registerAuthRoutes } from "../routes";

let server: Server<never>;
let base: URL;
let listSpy: ReturnType<typeof spyOn>;
let revokeSpy: ReturnType<typeof spyOn>;
let deleteCustomerSpy: ReturnType<typeof spyOn>;

const page = (items: { id: string }[]) =>
	({ result: { items, pagination: {} } }) as never;

/** Active subscriptions as Polar would answer: by organization (revoke lookup) or by customer. */
const polarSubscriptions = (subs: {
	byOrganization?: Record<string, string>;
	byCustomer?: Record<string, string>;
}) => {
	listSpy.mockImplementation((params: Record<string, unknown>) => {
		const referenceId = (params["metadata"] as { referenceId?: string })
			?.referenceId;
		if (referenceId) {
			const id = subs.byOrganization?.[referenceId];
			return Promise.resolve(page(id ? [{ id }] : []));
		}
		const id = subs.byCustomer?.[params["externalCustomerId"] as string];
		return Promise.resolve(page(id ? [{ id }] : []));
	});
};

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
	listSpy = spyOn(polarClient.subscriptions, "list");
	revokeSpy = spyOn(polarClient.subscriptions, "revoke");
	deleteCustomerSpy = spyOn(polarClient.customers, "deleteExternal");
});

afterAll(() => {
	listSpy.mockRestore();
	revokeSpy.mockRestore();
	deleteCustomerSpy.mockRestore();
	server.stop(true);
});

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	listSpy.mockClear();
	revokeSpy.mockClear();
	deleteCustomerSpy.mockClear();
	polarSubscriptions({});
	revokeSpy.mockResolvedValue({} as never);
	deleteCustomerSpy.mockResolvedValue(undefined as never);
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

const orgExists = async (id: string) =>
	(
		await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, id))
	).length > 0;

test("sole-owned paid org: subscription revoked, org and user gone, avatar and customer cleaned up", async () => {
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
	await joinOrganization(orgId, userId, "owner");
	polarSubscriptions({ byOrganization: { [orgId]: "sub_solo" } });

	const res = await clickDeleteLink(cookie, await issueDeleteToken(userId));

	expect(res.status).toBe(302);
	expect(res.headers.get("location")).toBe("/auth/goodbye");
	expect(revokeSpy).toHaveBeenCalledWith({ id: "sub_solo" });
	expect(await orgExists(orgId)).toBe(false);
	expect(await userExists(userId)).toBe(false);
	expect((await storageClient.serve(avatarKey)).status).toBe(404);
	expect(deleteCustomerSpy).toHaveBeenCalledWith({ externalId: userId });
});

test("co-owned paid org: org and its subscription survive, Polar customer is kept", async () => {
	const { userId, cookie } = await createUserWithSession();
	const { userId: coOwnerId } = await createUserWithSession();
	const orgId = await insertOrganization("Shared Co");
	await joinOrganization(orgId, userId, "owner");
	await joinOrganization(orgId, coOwnerId, "owner");
	polarSubscriptions({
		byOrganization: { [orgId]: "sub_shared" },
		byCustomer: { [userId]: "sub_shared" },
	});

	const res = await clickDeleteLink(cookie, await issueDeleteToken(userId));

	expect(res.status).toBe(302);
	expect(await userExists(userId)).toBe(false);
	expect(await orgExists(orgId)).toBe(true);
	expect(revokeSpy).not.toHaveBeenCalled();
	expect(listSpy).toHaveBeenCalledWith({
		externalCustomerId: userId,
		active: true,
		limit: 1,
	});
	expect(deleteCustomerSpy).not.toHaveBeenCalled();
});

test("Polar revoke failure: redirects to the goodbye error page and deletes nothing", async () => {
	const { userId, cookie } = await createUserWithSession();
	const orgId = await insertOrganization("Stuck Co");
	await joinOrganization(orgId, userId, "owner");
	polarSubscriptions({ byOrganization: { [orgId]: "sub_stuck" } });
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
	expect(await orgExists(orgId)).toBe(true);
	expect(deleteCustomerSpy).not.toHaveBeenCalled();
});
