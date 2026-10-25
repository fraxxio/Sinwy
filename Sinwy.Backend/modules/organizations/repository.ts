import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { session } from "@db/schema/authSchema";
import {
	invitation,
	member,
	organization,
	organizationProfile,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import type { PlanSlug } from "@sinwy/shared";
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
	or,
	sql,
} from "drizzle-orm";

export const isSlugTaken = async (slug: string) => {
	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	return row !== undefined;
};

export const findSubscriptionState = async (organizationId: string) => {
	const [row] = await db
		.select({
			status: organization.status,
			plan: organization.plan,
			subscriptionId: organization.subscriptionId,
		})
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row ?? null;
};

// One subscription backs an organization at a time; while bound, no other
// subscription may change it (stale revocations, a second purchase). Polar
// may also redeliver or reorder state, so only newer state applies.
const changeableBy = (
	organizationId: string,
	subscriptionId: string,
	observedAt: Date,
) =>
	and(
		eq(organization.id, organizationId),
		or(
			isNull(organization.subscriptionId),
			eq(organization.subscriptionId, subscriptionId),
		),
		or(
			isNull(organization.subscriptionStatusAt),
			lt(organization.subscriptionStatusAt, observedAt),
		),
	);

export type SubscriptionWrite =
	| { result: "applied" }
	| { result: "unknown-organization" }
	| { result: "outdated" }
	| { result: "bound-elsewhere"; boundSubscriptionId: string }
	| { result: "scheduled-for-deletion" };

const writeSubscription = (
	organizationId: string,
	subscriptionId: string,
	observedAt: Date,
	values: Pick<
		typeof organization.$inferInsert,
		"status" | "plan" | "subscriptionId"
	>,
) =>
	db.transaction(async (tx): Promise<SubscriptionWrite> => {
		// locked first, so a refusal is explained by the state that caused it
		const [row] = await tx
			.select({
				subscriptionId: organization.subscriptionId,
				deletionScheduledAt: organization.deletionScheduledAt,
			})
			.from(organization)
			.where(eq(organization.id, organizationId))
			.for("update");
		if (!row) return { result: "unknown-organization" };
		if (row.deletionScheduledAt) return { result: "scheduled-for-deletion" };

		const updated = await tx
			.update(organization)
			.set({ ...values, subscriptionStatusAt: observedAt })
			.where(changeableBy(organizationId, subscriptionId, observedAt))
			.returning({ id: organization.id });
		if (updated.length > 0) return { result: "applied" };

		return row.subscriptionId !== null && row.subscriptionId !== subscriptionId
			? { result: "bound-elsewhere", boundSubscriptionId: row.subscriptionId }
			: { result: "outdated" };
	});

export const bindSubscription = (
	organizationId: string,
	subscriptionId: string,
	plan: PlanSlug | null,
	observedAt: Date,
) =>
	writeSubscription(organizationId, subscriptionId, observedAt, {
		status: "active",
		plan,
		subscriptionId,
	});

/**
 * Inactive but still bound: the paused subscription can resume, and while it
 * is bound no second checkout can take over. The only write that leaves an
 * organization inactive with a subscription.
 */
export const pauseSubscription = (
	organizationId: string,
	subscriptionId: string,
	observedAt: Date,
) =>
	writeSubscription(organizationId, subscriptionId, observedAt, {
		status: "inactive",
		plan: null,
		subscriptionId,
	});

export const releaseSubscription = (
	organizationId: string,
	subscriptionId: string,
	observedAt: Date,
) =>
	writeSubscription(organizationId, subscriptionId, observedAt, {
		status: "inactive",
		plan: null,
		subscriptionId: null,
	});

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
			status: organization.status,
		})
		.from(organization)
		.where(
			exists(
				db
					.select({ id: member.id })
					.from(member)
					.where(
						and(
							eq(member.organizationId, organization.id),
							eq(member.userId, userId),
							memberHasRole("owner"),
						),
					),
			),
		)
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
 * Takes the organizations out of service until they are purged: no plan, no
 * subscription, no pending invitation or open transfer, and no session keeps
 * them active.
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
				status: "inactive",
				plan: null,
				subscriptionId: null,
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
 * Oldest organization the user owns that billing has not activated yet. A
 * lapsed one (onboarding finished) renews from Account → Organizations, and a
 * suspended one (still bound) resumes from there.
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
				eq(organization.status, "inactive"),
				isNull(organization.subscriptionId),
				isNull(organization.onboardingCompletedAt),
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
			status: organization.status,
			plan: organization.plan,
			subscriptionId: organization.subscriptionId,
			role: member.role,
			deletionScheduledAt: organization.deletionScheduledAt,
			onboardingCompletedAt: organization.onboardingCompletedAt,
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId))
		.orderBy(asc(organization.createdAt), asc(organization.id));

/** Oldest paid organization the user owns that never finished its setup wizard. */
export const findUnfinishedOnboardingOrganization = async (userId: string) => {
	const [row] = await db
		.select({ organizationId: organization.id })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				memberHasRole("owner"),
				eq(organization.status, "active"),
				isNull(organization.onboardingCompletedAt),
			),
		)
		.orderBy(asc(organization.createdAt))
		.limit(1);
	return row?.organizationId ?? null;
};
