import { beforeEach, expect, test } from "bun:test";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { eq } from "drizzle-orm";
import { projectSubscriptionStatus } from "../subscriptionStatus";

type Payload = Parameters<typeof projectSubscriptionStatus>[0];

const payload = (
	type: "subscription.active" | "subscription.revoked",
	referenceId?: string,
) =>
	({
		type,
		timestamp: new Date(),
		data: { metadata: referenceId ? { referenceId } : {} },
	}) as Payload;

const orgId = "org_test_1";

const getStatus = async () => {
	const [row] = await db
		.select({ status: organization.status })
		.from(organization)
		.where(eq(organization.id, orgId));
	return row?.status;
};

beforeEach(async () => {
	await db.delete(organization);
	await db.insert(organization).values({
		id: orgId,
		name: "Test Org",
		slug: "test-org",
		createdAt: new Date(),
	});
});

test("subscription.active with referenceId → status active", async () => {
	await projectSubscriptionStatus(payload("subscription.active", orgId));
	expect(await getStatus()).toBe("active");
});

test("subscription.revoked → status inactive", async () => {
	await projectSubscriptionStatus(payload("subscription.active", orgId));
	await projectSubscriptionStatus(payload("subscription.revoked", orgId));
	expect(await getStatus()).toBe("inactive");
});

test("payload without referenceId → no-op, no throw", async () => {
	await projectSubscriptionStatus(payload("subscription.active"));
	expect(await getStatus()).toBe("inactive");
});

test("same event delivered twice → same end state, no error", async () => {
	await projectSubscriptionStatus(payload("subscription.active", orgId));
	await projectSubscriptionStatus(payload("subscription.active", orgId));
	expect(await getStatus()).toBe("active");
});

test("referenceId of non-existent org → no throw", async () => {
	await projectSubscriptionStatus(
		payload("subscription.active", "org_does_not_exist"),
	);
	expect(await getStatus()).toBe("inactive");
});
