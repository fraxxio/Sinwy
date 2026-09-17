import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { AccountDeletionPreviewDto, ApiResponse } from "@sinwy/shared";
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
	await db.delete(organization);
	await db.delete(user);
});

const getPreview = async (cookie: string) => {
	const res = await fetch(new URL("/api/user/deletion-preview", base), {
		headers: { cookie },
	});
	const body = (await res.json()) as ApiResponse<AccountDeletionPreviewDto>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

test("no session → 401", async () => {
	const res = await fetch(new URL("/api/user/deletion-preview", base));
	expect(res.status).toBe(401);
});

test("lists only organizations the user solely owns", async () => {
	const { userId, cookie } = await createUserWithSession();
	const { userId: coOwnerId } = await createUserWithSession();

	const solo = await insertOrganization("Solo Co");
	await joinOrganization(solo, userId, "owner");

	const shared = await insertOrganization("Shared Co");
	await joinOrganization(shared, userId, "owner");
	await joinOrganization(shared, coOwnerId, "owner");

	const managed = await insertOrganization("Managed Co");
	await joinOrganization(managed, coOwnerId, "owner");
	await joinOrganization(managed, userId, "admin");

	expect(await getPreview(cookie)).toEqual({
		soleOwnedOrganizations: [{ id: solo, name: "Solo Co", status: "inactive" }],
	});
});
