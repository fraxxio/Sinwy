import db from "@db";
import { memberHasRole } from "@db/memberRole";
import {
	member,
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import type { PlanSlug } from "@sinwy/shared";
import {
	and,
	asc,
	eq,
	exists,
	inArray,
	isNull,
	lt,
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
	| { result: "bound-elsewhere"; boundSubscriptionId: string };

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
			.select({ subscriptionId: organization.subscriptionId })
			.from(organization)
			.where(eq(organization.id, organizationId))
			.for("update");
		if (!row) return { result: "unknown-organization" };

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
