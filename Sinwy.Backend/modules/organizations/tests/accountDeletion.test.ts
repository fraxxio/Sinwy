import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient } from "@authModule";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
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

const noSubscriptions = { result: { items: [], pagination: {} } } as never;

let listSpy: ReturnType<typeof spyOn>;
let revokeSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	listSpy = spyOn(polarClient.subscriptions, "list").mockResolvedValue(
		noSubscriptions,
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

test("org with a second owner is not previewed and survives", async () => {
	const { userId } = await createUserWithSession();
	const { userId: coOwnerId } = await createUserWithSession();
	const orgId = await insertOrganization("Shared Co");
	await joinOrganization(orgId, userId, "owner");
	await joinOrganization(orgId, coOwnerId, "owner");

	const preview = await getAccountDeletionPreview(userId);
	expect(preview.soleOwnedOrganizations).toEqual([]);

	await deleteSoleOwnedOrganizations(userId);

	expect(await orgExists(orgId)).toBe(true);
	expect(await memberCount(orgId)).toBe(2);
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

test("active subscription is revoked before the org is deleted", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Paying Co");
	await joinOrganization(orgId, userId, "owner");
	listSpy.mockResolvedValue({
		result: { items: [{ id: "sub_1" }], pagination: {} },
	} as never);

	await deleteSoleOwnedOrganizations(userId);

	expect(listSpy).toHaveBeenCalledWith({
		metadata: { referenceId: orgId },
		active: true,
		limit: 1,
	});
	expect(revokeSpy).toHaveBeenCalledWith({ id: "sub_1" });
	expect(await orgExists(orgId)).toBe(false);
});

test("Polar revoke failure throws and deletes nothing", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Stuck Co");
	await joinOrganization(orgId, userId, "owner");
	listSpy.mockResolvedValue({
		result: { items: [{ id: "sub_1" }], pagination: {} },
	} as never);
	revokeSpy.mockRejectedValue(new Error("polar down"));

	await expect(deleteSoleOwnedOrganizations(userId)).rejects.toBeInstanceOf(
		APIError,
	);

	expect(await orgExists(orgId)).toBe(true);
	expect(await memberCount(orgId)).toBe(1);
});
