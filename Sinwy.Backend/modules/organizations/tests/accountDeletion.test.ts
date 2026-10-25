import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { polarClient } from "@backend/infrastructure/polar";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
	polarPages,
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
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import {
	getAccountDeletionPreview,
	scheduleOwnedOrganizationsForDeletion,
} from "../service";

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

const orgState = async (id: string) => {
	const [row] = await db
		.select({
			status: organization.status,
			plan: organization.plan,
			subscriptionId: organization.subscriptionId,
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

test("owned paid org: scheduled and taken out of service, its data kept", async () => {
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
	expect(state).toMatchObject({
		status: "inactive",
		plan: null,
		subscriptionId: null,
	});
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

	expect(await orgState(orgId)).toEqual({
		status: "active",
		plan: "starter",
		subscriptionId: "sub_managed",
		deletionScheduledAt: null,
	});
	expect(await invitationStatuses(orgId)).toEqual(["pending"]);
	expect(revokeSpy).not.toHaveBeenCalled();
});

test("every billable subscription, across pages, past_due and paused included, is revoked before scheduling", async () => {
	const { userId } = await createUserWithSession();
	const orgId = await insertOrganization("Paying Co");
	await joinOrganization(orgId, userId, "owner");
	listSpy.mockImplementation(
		polarPages(
			[
				{ id: "sub_1", status: "active" },
				{ id: "sub_old", status: "canceled" },
			],
			[
				{ id: "sub_2", status: "past_due" },
				{ id: "sub_paused", status: "paused" },
			],
		),
	);

	await scheduleOwnedOrganizationsForDeletion(userId);

	expect(listSpy).toHaveBeenCalledWith({
		metadata: { referenceId: orgId },
		limit: 100,
	});
	expect(revokeSpy).toHaveBeenCalledTimes(3);
	expect(revokeSpy).toHaveBeenCalledWith("sub_1");
	expect(revokeSpy).toHaveBeenCalledWith("sub_2");
	expect(revokeSpy).toHaveBeenCalledWith("sub_paused");
	expect((await orgState(orgId))?.deletionScheduledAt).not.toBeNull();
});

test("a revoke failure in any owned org throws and schedules none of them", async () => {
	const { userId } = await createUserWithSession();
	const paidId = await insertOrganization("A Paid Co");
	const stuckId = await insertOrganization("B Stuck Co");
	await joinOrganization(paidId, userId, "owner");
	await joinOrganization(stuckId, userId, "owner");
	await activateOrganization(stuckId, "starter", "sub_stuck");
	await invite(stuckId, userId, "pending", 1);
	listSpy.mockImplementation((params: { metadata: { referenceId: string } }) =>
		polarPages([
			{ id: `sub_${params.metadata.referenceId}`, status: "active" },
		])(),
	);
	revokeSpy.mockImplementation((id: string) =>
		id === `sub_${stuckId}`
			? Promise.reject(new Error("polar down"))
			: Promise.resolve({}),
	);

	await expect(
		scheduleOwnedOrganizationsForDeletion(userId),
	).rejects.toBeInstanceOf(APIError);

	expect((await orgState(paidId))?.deletionScheduledAt).toBeNull();
	expect(await orgState(stuckId)).toEqual({
		status: "active",
		plan: "starter",
		subscriptionId: "sub_stuck",
		deletionScheduledAt: null,
	});
	expect(await invitationStatuses(stuckId)).toEqual(["pending"]);
});
