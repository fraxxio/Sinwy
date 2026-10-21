import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import db from "@db";
import { user } from "@db/schema/userSchema";
import { registerUserRoutes } from "@userModule";
import type { Server } from "bun";
import { loginAs } from "../loginAs";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerUserRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => {
	server.stop(true);
});

beforeEach(async () => {
	await db.delete(user);
});

const insertUser = async (emailVerified: boolean) => {
	const id = crypto.randomUUID();
	const email = `${id}@login-as.test`;
	await db.insert(user).values({
		id,
		name: "Login As",
		email,
		emailVerified,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return { id, email };
};

const flagsStatus = async (cookie?: string) => {
	const res = await fetch(new URL("/api/user/flags", base), {
		headers: cookie ? { cookie } : {},
	});
	return res.status;
};

test("the printed cookie passes a protected endpoint", async () => {
	const { id, email } = await insertUser(true);

	const login = await loginAs({ email });

	expect(login.userId).toBe(id);
	expect(await flagsStatus()).toBe(401);
	expect(await flagsStatus(login.cookie)).toBe(200);
});

test("the storage-state cookie passes a protected endpoint on the web app host", async () => {
	const { id } = await insertUser(true);

	const { storageState } = await loginAs({ userId: id });
	const [cookie] = storageState.cookies;

	expect(cookie?.domain).toBe(new URL(appConfig.WEB_APP_URL).hostname);
	expect(await flagsStatus(`${cookie?.name}=${cookie?.value}`)).toBe(200);
});

test("refuses users who could not sign in", async () => {
	const { email } = await insertUser(false);

	await expect(loginAs({ email })).rejects.toThrow(
		"has not verified their email",
	);
	await expect(loginAs({ email: "nobody@login-as.test" })).rejects.toThrow(
		"No user",
	);
});
