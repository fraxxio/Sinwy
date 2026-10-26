import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient, productIdFor } from "@backend/infrastructure/polar";
import {
	createUserWithSession,
	givePlan,
	polarPages,
} from "@backend/test/helpers";
import db from "@db";
import { user, userSubscription } from "@db/schema/userSchema";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import { eq } from "drizzle-orm";
import { ensureCheckoutAllowed } from "../checkoutGuard";

let userId: string;

// the guard asks Polar for a plan a webhook missed; Polar has none unless a test says so
let listSpy: ReturnType<typeof spyOn>;

beforeAll(() => {
	listSpy = spyOn(polarClient.subscriptions, "iterList");
});

afterAll(() => listSpy.mockRestore());

beforeEach(async () => {
	listSpy.mockImplementation(polarPages());
	await db.delete(user);
	({ userId } = await createUserWithSession());
});

const refusedAsPlanExists = (promise: Promise<unknown>) =>
	expect(promise).rejects.toMatchObject({
		body: { code: AUTH_ERROR_CODES.PLAN_EXISTS },
	});

test("a user who never had a plan → checkout proceeds, with the trial", async () => {
	expect(await ensureCheckoutAllowed(userId)).toEqual({ allowTrial: true });
	expect(listSpy).toHaveBeenCalledWith({
		external_customer_id: userId,
		limit: 100,
	});
});

test("a user whose plan ended → checkout proceeds, without a second trial", async () => {
	await givePlan(userId, null, { subscriptionId: null, status: "canceled" });
	expect(await ensureCheckoutAllowed(userId)).toEqual({ allowTrial: false });
});

test("a user with an entitled or paused plan → refused, change or resume it instead", async () => {
	await givePlan(userId, "starter");
	await refusedAsPlanExists(ensureCheckoutAllowed(userId));

	await givePlan(userId, null, { status: "paused" });
	await refusedAsPlanExists(ensureCheckoutAllowed(userId));
});

test("a plan Polar bills but no webhook brought → refused and projected", async () => {
	listSpy.mockImplementation(
		polarPages([
			{
				id: "sub_missed",
				status: "active",
				product_id: productIdFor("professional"),
				customer: { external_id: userId },
				metadata: {},
				created_at: new Date(0).toISOString(),
				modified_at: new Date().toISOString(),
			},
		]),
	);

	await refusedAsPlanExists(ensureCheckoutAllowed(userId));

	const [row] = await db
		.select({
			plan: userSubscription.plan,
			subscriptionId: userSubscription.subscriptionId,
		})
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId));
	expect(row).toEqual({ plan: "professional", subscriptionId: "sub_missed" });
});

test("Polar down → checkout proceeds; a raced second plan is caught by the projection", async () => {
	listSpy.mockImplementation(() => {
		throw new Error("polar down");
	});
	expect(await ensureCheckoutAllowed(userId)).toEqual({ allowTrial: true });
});
