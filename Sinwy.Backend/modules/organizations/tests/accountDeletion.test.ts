import { beforeEach, expect, test } from "bun:test";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { session } from "@db/schema/authSchema";
import {
	invitation,
	member,
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { eq } from "drizzle-orm";
import {
	getAccountDeletionPreview,
	scheduleOwnedOrganizationsForDeletion,
} from "../service";

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
});

const orgState = async (id: string) => {
	const [row] = await db
		.select({
			slotHeldAt: organization.slotHeldAt,
			deletionScheduledAt: organization.deletionScheduledAt,
		})
		.from(organization)
		.where(eq(organization.id, id));
	return row;
};

const memberCount = async (organizationId: string) =>
	(
		await db
			.select({ id: member.id })
			.from(member)
			.where(eq(member.organizationId, organizationId))
	).length;

const invitationStatuses = async (organizationId: string) =>
	(
		await db
			.select({ id: invitation.id, status: invitation.status })
			.from(invitation)
			.where(eq(invitation.organizationId, organizationId))
			.orderBy(invitation.id)
	).map((row) => row.status);

const activeOrganizationOf = async (userId: string) => {
	const [row] = await db
		.select({ activeOrganizationId: session.activeOrganizationId })
		.from(session)
		.where(eq(session.userId, userId));
	return row?.activeOrganizationId;
};

const invite = (
	organizationId: string,
	inviterId: string,
	status: string,
	n: number,
) =>
	db.insert(invitation).values({
		id: `invitation_${organizationId}_${n}`,
		organizationId,
		email: `invitee${n}@test.dev`,
		role: "staff",
		status,
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: new Date(),
		inviterId,
	});

test("owned active org: scheduled and its slot freed, its data kept", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Solo Co");
	await joinOrganization(orgId, userId, "owner");
	await activateOrganization(orgId, "professional", "sub_solo");
	await db.insert(organizationProfile).values({ organizationId: orgId });
	const staff = await createUserWithSession({ activeOrganizationId: orgId });
	await joinOrganization(orgId, staff.userId, "staff");
	await invite(orgId, staff.userId, "pending", 1);
	await invite(orgId, staff.userId, "accepted", 2);

	const preview = await getAccountDeletionPreview(userId);
	expect(preview.soleOwnedOrganizations).toEqual([
		{ id: orgId, name: "Solo Co", status: "active" },
	]);

	const before = Date.now();
	await scheduleOwnedOrganizationsForDeletion(userId);

	const state = await orgState(orgId);
	expect(state?.slotHeldAt).toBeNull();
	expect(state?.deletionScheduledAt?.getTime()).toBeGreaterThanOrEqual(
		before - 1000,
	);
	expect(await invitationStatuses(orgId)).toEqual(["canceled", "accepted"]);
	expect(await activeOrganizationOf(staff.userId)).toBeNull();
	expect(await memberCount(orgId)).toBe(2);
	const [profile] = await db
		.select({ id: organizationProfile.organizationId })
		.from(organizationProfile)
		.where(eq(organizationProfile.organizationId, orgId));
	expect(profile).toBeDefined();
});

test("combined role string still counts as owner", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Combined Co");
	await joinOrganization(orgId, userId, "owner,admin");

	const preview = await getAccountDeletionPreview(userId);
	expect(preview.soleOwnedOrganizations.map((org) => org.id)).toEqual([orgId]);

	await scheduleOwnedOrganizationsForDeletion(userId);

	expect((await orgState(orgId))?.deletionScheduledAt).not.toBeNull();
});

test("org where the user is only admin is not previewed and stays untouched", async () => {
	const { userId } = await createUserWithSession();
	const { userId: ownerId } = await createUserWithSession();
	const orgId = await insertOrganization("Managed Co");
	await joinOrganization(orgId, ownerId, "owner");
	await joinOrganization(orgId, userId, "admin");
	await activateOrganization(orgId, "starter", "sub_managed");
	await invite(orgId, ownerId, "pending", 1);

	const preview = await getAccountDeletionPreview(userId);
	expect(preview.soleOwnedOrganizations).toEqual([]);

	await scheduleOwnedOrganizationsForDeletion(userId);

	expect(await orgState(orgId)).toMatchObject({ deletionScheduledAt: null });
	expect((await orgState(orgId))?.slotHeldAt).toBeInstanceOf(Date);
	expect(await invitationStatuses(orgId)).toEqual(["pending"]);
});
