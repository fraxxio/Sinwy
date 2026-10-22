import { beforeEach, expect, test } from "bun:test";
import { insertOrganization } from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { eq } from "drizzle-orm";

let orgId: string;

beforeEach(async () => {
	await db.delete(organization);
	orgId = await insertOrganization("Constraint Co");
});

const set = (values: Partial<typeof organization.$inferInsert>) =>
	db
		.update(organization)
		.set(values)
		.where(eq(organization.id, orgId))
		.execute();

test("plan and status only take the shared values", async () => {
	await expect(set({ status: "active", plan: "gold" })).rejects.toThrow();
	await expect(set({ status: "suspended" })).rejects.toThrow();
	await set({ status: "active", plan: "enterprise" });
});

test("an inactive organization has no plan", async () => {
	await expect(set({ plan: "starter" })).rejects.toThrow();
});
