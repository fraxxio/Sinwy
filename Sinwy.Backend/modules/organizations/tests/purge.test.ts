import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient } from "@backend/infrastructure/polar";
import { fileUrl, storageClient } from "@backend/infrastructure/storage";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
	polarPages,
} from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { eq } from "drizzle-orm";
import { purgeScheduledOrganizations } from "../purge";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-25T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

let listSpy: ReturnType<typeof spyOn>;
let revokeSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	listSpy = spyOn(polarClient.subscriptions, "iterList").mockImplementation(
		polarPages(),
	);
	revokeSpy = spyOn(polarClient.subscriptions, "revoke").mockResolvedValue(
		{} as never,
	);
});

afterEach(() => {
	listSpy.mockRestore();
	revokeSpy.mockRestore();
});

/** An organization as `insertOrganization` makes it, created long before `now`. */
const seedOrganization = async (
	name: string,
	values: Partial<typeof organization.$inferInsert> = {},
) => {
	const id = await insertOrganization(name);
	await db
		.update(organization)
		.set({ createdAt: ago(90 * DAY), ...values })
		.where(eq(organization.id, id));
	return id;
};

const withOwner = async (organizationId: string) => {
	const { userId } = await createUserWithSession();
	await joinOrganization(organizationId, userId, "owner");
};

const deletionScheduledAt = async (id: string) => {
	const [row] = await db
		.select({ at: organization.deletionScheduledAt })
		.from(organization)
		.where(eq(organization.id, id));
	return row ? row.at : "gone";
};

test("deletes exactly the orgs past their retention, with their logo; a second run changes nothing", async () => {
	const logoKey = "logos/expired/logo.png";
	await storageClient.put(logoKey, new Uint8Array([1]), "image/png");
	const expired = await seedOrganization("Expired", {
		deletionScheduledAt: ago(31 * DAY),
		logo: fileUrl(logoKey),
	});
	const retained = await seedOrganization("Retained", {
		deletionScheduledAt: ago(29 * DAY),
	});
	const lapsed = await seedOrganization("Lapsed", {
		onboardingCompletedAt: ago(60 * DAY),
	});
	const neverPaid = await seedOrganization("Never paid");
	await withOwner(lapsed);
	await withOwner(neverPaid);

	expect(await purgeScheduledOrganizations(now)).toEqual({
		unscheduled: 0,
		scheduled: 0,
		purged: 1,
	});

	expect(await deletionScheduledAt(expired)).toBe("gone");
	expect((await storageClient.serve(logoKey)).status).toBe(404);
	expect(await deletionScheduledAt(retained)).toEqual(ago(29 * DAY));
	expect(await deletionScheduledAt(lapsed)).toBeNull();
	expect(await deletionScheduledAt(neverPaid)).toBeNull();

	expect(await purgeScheduledOrganizations(now)).toEqual({
		unscheduled: 0,
		scheduled: 0,
		purged: 0,
	});
	expect(await deletionScheduledAt(retained)).toEqual(ago(29 * DAY));
});

test("purges in batches until none are left", async () => {
	const ids = [];
	for (let n = 0; n < 101; n++)
		ids.push(
			await seedOrganization(`Expired ${n}`, {
				deletionScheduledAt: ago(40 * DAY),
			}),
		);

	expect((await purgeScheduledOrganizations(now)).purged).toBe(101);
	expect(await db.select({ id: organization.id }).from(organization)).toEqual(
		[],
	);
});

test("an org left without an owner and never scheduled is revoked and scheduled, unless just created", async () => {
	const orphan = await seedOrganization("Orphan", {
		status: "active",
		plan: "starter",
		subscriptionId: "sub_orphan",
	});
	const justCreated = await seedOrganization("Just created", {
		createdAt: ago(5 * 60 * 1000),
	});
	listSpy.mockImplementation(
		polarPages([{ id: "sub_orphan", status: "active" }]),
	);

	expect(await purgeScheduledOrganizations(now)).toEqual({
		unscheduled: 0,
		scheduled: 1,
		purged: 0,
	});

	expect(revokeSpy).toHaveBeenCalledWith("sub_orphan");
	const [row] = await db
		.select({
			status: organization.status,
			subscriptionId: organization.subscriptionId,
			deletionScheduledAt: organization.deletionScheduledAt,
		})
		.from(organization)
		.where(eq(organization.id, orphan));
	expect(row).toEqual({
		status: "inactive",
		subscriptionId: null,
		deletionScheduledAt: now,
	});
	expect(await deletionScheduledAt(justCreated)).toBeNull();
});

test("an ownerless org whose subscription can't be revoked stays unscheduled for the next run", async () => {
	const orphan = await seedOrganization("Orphan");
	listSpy.mockImplementation(
		polarPages([{ id: "sub_orphan", status: "active" }]),
	);
	revokeSpy.mockRejectedValue(new Error("polar down"));

	expect((await purgeScheduledOrganizations(now)).scheduled).toBe(0);
	expect(await deletionScheduledAt(orphan)).toBeNull();
});

test("a scheduled org that still has an owner is unscheduled, unless its deletion may still be in flight", async () => {
	const failed = await seedOrganization("Failed deletion", {
		deletionScheduledAt: ago(40 * DAY),
	});
	const inFlight = await seedOrganization("In flight", {
		deletionScheduledAt: ago(60 * 1000),
	});
	await withOwner(failed);
	await withOwner(inFlight);

	expect(await purgeScheduledOrganizations(now)).toEqual({
		unscheduled: 1,
		scheduled: 0,
		purged: 0,
	});

	expect(await deletionScheduledAt(failed)).toBeNull();
	expect(await deletionScheduledAt(inFlight)).toEqual(ago(60 * 1000));
});
