import db from "@db";
import { memberHasRole } from "@db/memberRole";
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
import {
	clearFromSessions,
	organizationAccess,
	ownedBy,
	type Tx,
} from "./access";
import { countHeldSlots, slotLimit } from "./slots";

export const isSlugTaken = async (slug: string) => {
	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	return row !== undefined;
};

/** A new organization with its creator as owner. */
export const insertOrganizationWithOwner = (
	values: { name: string; slug: string; industry: string; timezone: string },
	userId: string,
) =>
	db.transaction(async (tx) => {
		const createdAt = new Date();
		const [org] = await tx
			.insert(organization)
			.values({ id: crypto.randomUUID(), ...values, createdAt })
			.returning({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				industry: organization.industry,
			});
		if (!org) throw new Error("Organization insert returned no row");
		await tx.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: org.id,
			userId,
			role: "owner",
			createdAt,
		});
		return org;
	});

export const findOrganizationAccess = async (organizationId: string) => {
	const [row] = await db
		.select({
			id: organization.id,
			name: organization.name,
			...organizationAccess,
			onboardingCompletedAt: organization.onboardingCompletedAt,
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

export const countOwnedHeldSlots = (userId: string) =>
	countHeldSlots(db, userId);

/** Whether the user's plan grants access and has a slot no organization holds. */
export const hasFreeSlot = async (userId: string) => {
	const [row] = await db
		.select({ plan: userSubscription.plan })
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId));
	const limit = slotLimit(row?.plan ?? null);
	return limit > 0 && (await countHeldSlots(db, userId)) < limit;
};

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
	currency: string,
) =>
	db.transaction(async (tx) => {
		const [row] = await tx
			.insert(organizationProfile)
			.values({ ...values, organizationId })
			.onConflictDoUpdate({
				target: organizationProfile.organizationId,
				set: { ...values, updatedAt: sql`now()` },
			})
			.returning();
		await tx
			.update(organization)
			.set({ currency })
			.where(eq(organization.id, organizationId));
		return row;
	});

export const findOrganizationLocale = async (organizationId: string) => {
	const [row] = await db
		.select({
			timezone: organization.timezone,
			currency: organization.currency,
		})
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row ?? null;
};

export const updateOrganizationTimezone = (
	executor: Tx | typeof db,
	organizationId: string,
	timezone: string,
) =>
	executor
		.update(organization)
		.set({ timezone })
		.where(eq(organization.id, organizationId));

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
		await clearFromSessions(tx, ids);
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
				isNull(organization.deletionScheduledAt),
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

/** The user's raw role column and the organization's access; null when not a member. */
export const findMembershipAccess = async (
	userId: string,
	ref: { id: string } | { slug: string },
) => {
	const [row] = await db
		.select({ role: member.role, ...organizationAccess })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				"id" in ref
					? eq(organization.id, ref.id)
					: eq(organization.slug, ref.slug),
			),
		);
	return row ?? null;
};

export const findInvitationOrganizationId = async (invitationId: string) => {
	const [row] = await db
		.select({ organizationId: invitation.organizationId })
		.from(invitation)
		.where(eq(invitation.id, invitationId));
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

/**
 * Oldest organization the user owns that never finished its setup wizard:
 * an active one, or with `withDrafts` (the owner has a free slot) a draft,
 * whose wizard takes that slot.
 */
export const findUnfinishedOnboardingOrganization = async (
	userId: string,
	withDrafts: boolean,
) => {
	const [row] = await db
		.select({ organizationId: organization.id })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				memberHasRole("owner"),
				isNull(organization.deletionScheduledAt),
				isNotNull(organizationAccess.ownerPlan),
				isNull(organization.onboardingCompletedAt),
				withDrafts ? undefined : isNotNull(organization.slotHeldAt),
			),
		)
		.orderBy(asc(organization.createdAt))
		.limit(1);
	return row?.organizationId ?? null;
};
