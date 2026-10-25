import db from "@db";
import { memberHasRole } from "@db/memberRole";
import {
	countHeldSlots,
	lockPlan,
	organizationAccess,
	ownedBy,
	slotLimit,
} from "@db/organizationAccess";
import { session } from "@db/schema/authSchema";
import {
	invitation,
	member,
	organization,
	organizationProfile,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import { userSubscription } from "@db/schema/userSchema";
import {
	and,
	asc,
	eq,
	exists,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	not,
	sql,
} from "drizzle-orm";

export const isSlugTaken = async (slug: string) => {
	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	return row !== undefined;
};

export const findOrganizationAccess = async (organizationId: string) => {
	const [row] = await db
		.select({
			...organizationAccess,
			ownerUserId: sql<string | null>`(${db
				.select({ userId: member.userId })
				.from(member)
				.where(
					and(
						eq(member.organizationId, organization.id),
						memberHasRole("owner"),
					),
				)})`,
		})
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row ?? null;
};

export type SlotHold =
	| { result: "held" }
	| { result: "not-found" }
	| { result: "no-plan" }
	| { result: "limit-reached"; limit: number };

/**
 * Gives an organization the owner owns one of their slots. The owner's plan
 * row is locked first, so concurrent activations count one after another.
 */
export const holdSlot = (userId: string, organizationId: string) =>
	db.transaction(async (tx): Promise<SlotHold> => {
		const plan = await lockPlan(tx, userId);
		const [org] = await tx
			.select({ slotHeldAt: organization.slotHeldAt })
			.from(organization)
			.where(
				and(
					eq(organization.id, organizationId),
					isNull(organization.deletionScheduledAt),
					ownedBy(userId),
				),
			)
			.for("update");
		if (!org) return { result: "not-found" };
		if (org.slotHeldAt) return { result: "held" };
		if (!plan) return { result: "no-plan" };

		const limit = slotLimit(plan);
		if ((await countHeldSlots(tx, userId)) >= limit)
			return { result: "limit-reached", limit };
		await tx
			.update(organization)
			.set({ slotHeldAt: new Date() })
			.where(eq(organization.id, organizationId));
		return { result: "held" };
	});

/** false when the user doesn't own the organization or it is scheduled for deletion. */
export const releaseSlot = async (userId: string, organizationId: string) => {
	const released = await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(
			and(
				eq(organization.id, organizationId),
				isNull(organization.deletionScheduledAt),
				ownedBy(userId),
			),
		)
		.returning({ id: organization.id });
	return released.length > 0;
};

export const countOwnedHeldSlots = (userId: string) =>
	countHeldSlots(db, userId);

export const findOwnedOrganizationIds = (userId: string) =>
	db.select({ id: organization.id }).from(organization).where(ownedBy(userId));

export const findOnboardingCompletedAt = async (organizationId: string) => {
	const [row] = await db
		.select({ completedAt: organization.onboardingCompletedAt })
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row?.completedAt ?? null;
};

export const findProfile = async (organizationId: string) => {
	const [row] = await db
		.select()
		.from(organizationProfile)
		.where(eq(organizationProfile.organizationId, organizationId));
	return row ?? null;
};

export const upsertProfile = async (
	organizationId: string,
	values: Omit<
		typeof organizationProfile.$inferInsert,
		"organizationId" | "updatedAt"
	>,
) => {
	const [row] = await db
		.insert(organizationProfile)
		.values({ ...values, organizationId })
		.onConflictDoUpdate({
			target: organizationProfile.organizationId,
			set: { ...values, updatedAt: sql`now()` },
		})
		.returning();
	return row;
};

/** Idempotent: an organization keeps the timestamp of its first completion. */
export const markOnboardingCompleted = async (organizationId: string) => {
	const [row] = await db
		.update(organization)
		.set({ onboardingCompletedAt: new Date() })
		.where(
			and(
				eq(organization.id, organizationId),
				isNull(organization.onboardingCompletedAt),
			),
		)
		.returning({ completedAt: organization.onboardingCompletedAt });
	return row?.completedAt ?? null;
};

/** Organizations this user owns; each has exactly one owner. */
export const findSoleOwnedOrganizations = (userId: string) =>
	db
		.select({
			id: organization.id,
			name: organization.name,
			...organizationAccess,
		})
		.from(organization)
		.where(ownedBy(userId))
		.orderBy(organization.name);

const hasOwner = exists(
	db
		.select({ id: member.id })
		.from(member)
		.where(
			and(eq(member.organizationId, organization.id), memberHasRole("owner")),
		),
);

/**
 * Takes the organizations out of service until they are purged: no slot, no
 * pending invitation or open transfer, and no session keeps them active.
 */
export const scheduleOrganizationsForDeletion = (
	ids: string[],
	scheduledAt: Date,
) =>
	db.transaction(async (tx) => {
		await tx
			.update(organization)
			.set({
				deletionScheduledAt: scheduledAt,
				slotHeldAt: null,
			})
			.where(inArray(organization.id, ids));
		await tx
			.update(invitation)
			.set({ status: "canceled" })
			.where(
				and(
					inArray(invitation.organizationId, ids),
					eq(invitation.status, "pending"),
				),
			);
		await tx
			.update(organizationTransfer)
			.set({ status: "canceled", updatedAt: sql`now()` })
			.where(
				and(
					inArray(organizationTransfer.organizationId, ids),
					inArray(organizationTransfer.status, ["pending", "accepted"]),
				),
			);
		await tx
			.update(session)
			.set({ activeOrganizationId: null })
			.where(inArray(session.activeOrganizationId, ids));
	});

export const findDeletionScheduledAt = async (organizationId: string) => {
	const [row] = await db
		.select({ deletionScheduledAt: organization.deletionScheduledAt })
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row?.deletionScheduledAt ?? null;
};

/** Created before `createdBefore` and left without an owner, yet never scheduled. */
export const findOwnerlessUnscheduledOrganizations = (createdBefore: Date) =>
	db
		.select({ id: organization.id })
		.from(organization)
		.where(
			and(
				isNull(organization.deletionScheduledAt),
				lt(organization.createdAt, createdBefore),
				not(hasOwner),
			),
		);

/** Clears the schedule of organizations that still have an owner; returns their ids. */
export const unscheduleOwnedOrganizations = (scheduledBefore: Date) =>
	db
		.update(organization)
		.set({ deletionScheduledAt: null })
		.where(
			and(
				isNotNull(organization.deletionScheduledAt),
				lt(organization.deletionScheduledAt, scheduledBefore),
				hasOwner,
			),
		)
		.returning({ id: organization.id });

/** Ownerless organizations scheduled at or before `scheduledBefore`, oldest first. */
export const findExpiredOrganizations = (
	scheduledBefore: Date,
	limit: number,
) =>
	db
		.select({ id: organization.id, logo: organization.logo })
		.from(organization)
		.where(
			and(
				lte(organization.deletionScheduledAt, scheduledBefore),
				not(hasOwner),
			),
		)
		.orderBy(asc(organization.deletionScheduledAt), asc(organization.id))
		.limit(limit);

/** FK cascades remove members, invitations and the profile. */
export const deleteOrganizations = (ids: string[]) =>
	db.delete(organization).where(inArray(organization.id, ids));

/**
 * Oldest organization the user owns that never finished onboarding, while the
 * user has no plan: a lapsed or suspended plan renews or resumes from the
 * account instead.
 * Single index hit on member_userId_idx, then a primary-key join, this runs
 * on every app load, so it must stay a bounded lookup.
 */
export const findUnpaidOwnedOrganization = async (userId: string) => {
	const [row] = await db
		.select({ organizationId: organization.id })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				memberHasRole("owner"),
				isNull(organization.slotHeldAt),
				isNull(organization.onboardingCompletedAt),
				not(
					exists(
						db
							.select({ userId: userSubscription.userId })
							.from(userSubscription)
							.where(
								and(
									eq(userSubscription.userId, userId),
									isNotNull(userSubscription.subscriptionId),
								),
							),
					),
				),
			),
		)
		.orderBy(asc(organization.createdAt))
		.limit(1);
	return row?.organizationId ?? null;
};

/** Every organization the user belongs to, oldest first, with their raw role column. */
export const findMemberOrganizations = (userId: string) =>
	db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			...organizationAccess,
			role: member.role,
			onboardingCompletedAt: organization.onboardingCompletedAt,
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId))
		.orderBy(asc(organization.createdAt), asc(organization.id));

/** Oldest active organization the user owns that never finished its setup wizard. */
export const findUnfinishedOnboardingOrganization = async (userId: string) => {
	const [row] = await db
		.select({ organizationId: organization.id })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				memberHasRole("owner"),
				isNotNull(organization.slotHeldAt),
				isNull(organization.deletionScheduledAt),
				isNotNull(organizationAccess.ownerPlan),
				isNull(organization.onboardingCompletedAt),
			),
		)
		.orderBy(asc(organization.createdAt))
		.limit(1);
	return row?.organizationId ?? null;
};
