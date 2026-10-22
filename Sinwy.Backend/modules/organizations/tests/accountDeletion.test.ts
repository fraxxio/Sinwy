import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient } from "@backend/infrastructure/polar";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
	polarPages,
} from "@backend/test/helpers";
import db from "@db";
import {
	member,
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import {
	deleteSoleOwnedOrganizations,
	getAccountDeletionPreview,
} from "../service";

let listSpy: ReturnType<typeof spyOn>;
let revokeSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	listSpy = spyOn(polarClient.subscriptions, "list").mockResolvedValue(
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

const orgExists = async (id: string) =>
	(
		await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, id))
	).length > 0;

const memberCount = async (organizationId: string) =>
	(
		await db
			.select({ id: member.id })
			.from(member)
			.where(eq(member.organizationId, organizationId))
	).length;

const profileExists = async (organizationId: string) =>
	(
		await db
			.select({ id: organizationProfile.organizationId })
			.from(organizationProfile)
			.where(eq(organizationProfile.organizationId, organizationId))
	).length > 0;

test("sole owner: org is previewed and deleted with its member and profile rows", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Solo Co");
	await joinOrganization(orgId, userId, "owner");
	await db.insert(organizationProfile).values({ organizationId: orgId });

	const preview = await getAccountDeletionPreview(userId);
	expect(preview.soleOwnedOrganizations).toEqual([
		{ id: orgId, name: "Solo Co", status: "inactive" },
	]);

	await deleteSoleOwnedOrganizations(userId);

	expect(await orgExists(orgId)).toBe(false);
	expect(await memberCount(orgId)).toBe(0);
	expect(await profileExists(orgId)).toBe(false);
	expect(revokeSpy).not.toHaveBeenCalled();
});

test("combined role string still counts as owner", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Combined Co");
	await joinOrganization(orgId, userId, "owner,admin");

	const preview = await getAccountDeletionPreview(userId);
	expect(preview.soleOwnedOrganizations.map((org) => org.id)).toEqual([orgId]);
});

test("org where the user is only admin is not previewed and survives", async () => {
	const { userId } = await createUserWithSession();
	const { userId: ownerId } = await createUserWithSession();
	const orgId = await insertOrganization("Managed Co");
	await joinOrganization(orgId, ownerId, "owner");
	await joinOrganization(orgId, userId, "admin");

	const preview = await getAccountDeletionPreview(userId);
	expect(preview.soleOwnedOrganizations).toEqual([]);

	await deleteSoleOwnedOrganizations(userId);

	expect(await orgExists(orgId)).toBe(true);
	expect(await memberCount(orgId)).toBe(2);
});

test("every entitled subscription, across pages and past_due included, is revoked before the org is deleted", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Paying Co");
	await joinOrganization(orgId, userId, "owner");
	listSpy.mockResolvedValue(
		polarPages(
			[
				{ id: "sub_1", status: "active" },
				{ id: "sub_old", status: "canceled" },
			],
			[{ id: "sub_2", status: "past_due" }],
		),
	);

	await deleteSoleOwnedOrganizations(userId);

	expect(listSpy).toHaveBeenCalledWith({
		metadata: { referenceId: orgId },
		limit: 100,
	});
	expect(revokeSpy).toHaveBeenCalledTimes(2);
	expect(revokeSpy).toHaveBeenCalledWith({ id: "sub_1" });
	expect(revokeSpy).toHaveBeenCalledWith({ id: "sub_2" });
	expect(await orgExists(orgId)).toBe(false);
});

test("Polar revoke failure throws and deletes nothing", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Stuck Co");
	await joinOrganization(orgId, userId, "owner");
	listSpy.mockResolvedValue(polarPages([{ id: "sub_1", status: "active" }]));
	revokeSpy.mockRejectedValue(new Error("polar down"));

	await expect(deleteSoleOwnedOrganizations(userId)).rejects.toBeInstanceOf(
		APIError,
	);

	expect(await orgExists(orgId)).toBe(true);
	expect(await memberCount(orgId)).toBe(1);
});
