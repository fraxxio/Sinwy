import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { createUserWithSession } from "@backend/test/helpers";
import db from "@db";
import { user } from "@db/schema/userSchema";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { polarClient } from "../polarClient";

let updateSpy: ReturnType<typeof spyOn>;

// the polar plugin syncs every user update to the Polar customer; keep tests offline
beforeAll(() => {
	updateSpy = spyOn(polarClient.customers, "updateExternal").mockResolvedValue(
		{} as never,
	);
});

afterAll(() => updateSpy.mockRestore());

beforeEach(async () => {
	await db.delete(user);
});

const nameOf = async (userId: string) => {
	const [row] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, userId));
	return row?.name;
};

test("updateUser trims the name and saves it", async () => {
	const { userId, cookie } = await createUserWithSession();

	await auth.api.updateUser({
		body: { name: "  Jane Doe  " },
		headers: { cookie },
	});

	expect(await nameOf(userId)).toBe("Jane Doe");
});

test("updateUser rejects a name that fails the shared rule", async () => {
	const { userId, cookie } = await createUserWithSession();

	const attempt = auth.api.updateUser({
		body: { name: "a1" },
		headers: { cookie },
	});

	await expect(attempt).rejects.toBeInstanceOf(APIError);
	await expect(attempt).rejects.toMatchObject({ status: "BAD_REQUEST" });
	expect(await nameOf(userId)).toBe("Test User");
});

test("updateUser without a name skips the name rule", async () => {
	const { userId, cookie } = await createUserWithSession();

	await auth.api.updateUser({
		body: { image: "https://example.com/a.png" },
		headers: { cookie },
	});

	expect(await nameOf(userId)).toBe("Test User");
});
