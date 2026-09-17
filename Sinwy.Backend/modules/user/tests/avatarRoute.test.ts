import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient, registerAuthRoutes } from "@authModule";
import { keyFromFileUrl, storageClient } from "@backend/infrastructure/storage";
import createApp from "@backend/lib/app";
import { createUserWithSession } from "@backend/test/helpers";
import db from "@db";
import { user } from "@db/schema/userSchema";
import { registerFileRoutes } from "@filesModule";
import type { ApiResponse, AvatarDto } from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerUserRoutes } from "../routes";

let server: Server<never>;
let base: URL;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

beforeAll(() => {
	// the polar plugin syncs every user update to the Polar customer; keep tests offline
	spyOn(polarClient.customers, "updateExternal").mockResolvedValue({} as never);
	const app = createApp();
	registerAuthRoutes(app);
	registerUserRoutes(app);
	registerFileRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

beforeEach(async () => {
	await db.delete(user);
});

const upload = async (cookie: string, file: File | null) => {
	const form = new FormData();
	if (file) form.set("file", file);
	const res = await fetch(new URL("/api/user/avatar", base), {
		method: "POST",
		headers: { cookie },
		body: form,
	});
	return {
		status: res.status,
		body: (await res.json()) as ApiResponse<AvatarDto>,
	};
};

const imageOf = async (userId: string) => {
	const [row] = await db
		.select({ image: user.image })
		.from(user)
		.where(eq(user.id, userId));
	return row?.image;
};

const storedStatus = async (image: string) => {
	const key = keyFromFileUrl(image);
	if (!key) throw new Error(`not our URL: ${image}`);
	return (await storageClient.serve(key)).status;
};

test("upload stores the file, updates the user and serves it publicly", async () => {
	const { userId, cookie } = await createUserWithSession();

	const { status, body } = await upload(
		cookie,
		new File([PNG], "me.png", { type: "image/png" }),
	);
	expect(status).toBe(200);
	if (!body.isSuccess) throw new Error(body.message ?? "upload failed");

	const { image } = body.data;
	expect(image).toMatch(
		new RegExp(`/api/files/avatars/${userId}/[\\w-]+\\.png$`),
	);
	expect(await imageOf(userId)).toBe(image);

	const served = await fetch(new URL(new URL(image).pathname, base));
	expect(served.status).toBe(200);
	expect(served.headers.get("content-type")).toContain("image/png");

	await storageClient.delete(keyFromFileUrl(image) as string);
});

test("replacing deletes the previous object; removing clears the image", async () => {
	const { userId, cookie } = await createUserWithSession();

	const first = await upload(
		cookie,
		new File([PNG], "a.png", { type: "image/png" }),
	);
	const second = await upload(
		cookie,
		new File([PNG], "b.png", { type: "image/png" }),
	);
	if (!first.body.isSuccess || !second.body.isSuccess)
		throw new Error("upload failed");

	expect(await storedStatus(first.body.data.image)).toBe(404);
	expect(await storedStatus(second.body.data.image)).toBe(200);

	const removed = await fetch(new URL("/api/user/avatar", base), {
		method: "DELETE",
		headers: { cookie },
	});
	expect(removed.status).toBe(200);
	expect(await imageOf(userId)).toBeNull();
	expect(await storedStatus(second.body.data.image)).toBe(404);
});

test("missing file → 400, oversize → 413, wrong type → 400", async () => {
	const { cookie } = await createUserWithSession();

	expect((await upload(cookie, null)).status).toBe(400);
	const json = await fetch(new URL("/api/user/avatar", base), {
		method: "POST",
		headers: { cookie, "content-type": "application/json" },
		body: "{}",
	});
	expect(json.status).toBe(400);
	expect(
		(
			await upload(
				cookie,
				new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", {
					type: "image/png",
				}),
			)
		).status,
	).toBe(413);
	expect(
		(await upload(cookie, new File([PNG], "a.gif", { type: "image/gif" })))
			.status,
	).toBe(400);
});
