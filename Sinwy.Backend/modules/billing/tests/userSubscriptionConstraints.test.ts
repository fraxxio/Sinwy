import { beforeEach, expect, test } from "bun:test";
import { createUserWithSession, givePlan } from "@backend/test/helpers";
import db from "@db";
import { user } from "@db/schema/userSchema";

let userId: string;

beforeEach(async () => {
	await db.delete(user);
	({ userId } = await createUserWithSession());
});

test("a user's plan only takes the shared values", async () => {
	await expect(givePlan(userId, "gold" as never)).rejects.toThrow();
	await givePlan(userId, "enterprise");
});

test("a plan is held only while the subscription grants access", async () => {
	await expect(
		givePlan(userId, "starter", { status: "paused" }),
	).rejects.toThrow();
	await givePlan(userId, "starter", { status: "past_due" });
	await givePlan(userId, null, { status: "paused" });
});
