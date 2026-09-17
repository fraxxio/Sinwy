import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import { createUserWithSession } from "@backend/test/helpers";
import db from "@db";
import { account } from "@db/schema/authSchema";
import { user } from "@db/schema/userSchema";
import type { ApiResponse } from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
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
	await db.delete(user);
});

const setPassword = async (cookie: string | null, body: unknown) => {
	const res = await fetch(new URL("/api/user/password", base), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ApiResponse<null> };
};

const credentialAccounts = (userId: string) =>
	db
		.select({ providerId: account.providerId, password: account.password })
		.from(account)
		.where(eq(account.userId, userId))
		.then((rows) => rows.filter((row) => row.providerId === "credential"));

test("no session → 401", async () => {
	const { status } = await setPassword(null, { newPassword: "Str0ng!Pass" });
	expect(status).toBe(401);
});

test("password failing the shared rule → 400", async () => {
	const { cookie } = await createUserWithSession({
		accounts: [{ providerId: "google" }],
	});
	const { status } = await setPassword(cookie, { newPassword: "short" });
	expect(status).toBe(400);
});

test("Google-only user → 200 and a credential account exists", async () => {
	const { userId, cookie } = await createUserWithSession({
		accounts: [{ providerId: "google" }],
	});

	const { status, body } = await setPassword(cookie, {
		newPassword: "Str0ng!Pass",
	});

	expect(status).toBe(200);
	expect(body.isSuccess).toBe(true);
	const credentials = await credentialAccounts(userId);
	expect(credentials).toHaveLength(1);
	expect(credentials[0]?.password).toBeString();
});

test("user with a password already → 409", async () => {
	const { userId, cookie } = await createUserWithSession({
		accounts: [{ providerId: "credential", password: "hashed" }],
	});

	const { status, body } = await setPassword(cookie, {
		newPassword: "Str0ng!Pass",
	});

	expect(status).toBe(409);
	expect(body.isSuccess).toBe(false);
	expect(await credentialAccounts(userId)).toEqual([
		{ providerId: "credential", password: "hashed" },
	]);
});
